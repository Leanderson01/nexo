import { v } from "convex/values";

import { err, ok, type Result } from "../src/domain/result";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireEmployee } from "./lib/guards";
import { transferToAnalyst, type TransferError } from "./lib/handoff";
import {
  countStartedConversations,
  findConversationsCreatedToday,
  isDailyCostLimitReached,
  readConversationsPerDayLimit,
} from "./usage";

// Conversas do funcionário (§5.9, §7.2, §9). Toda leitura passa por `requireEmployee` e
// pelo dono: conversa alheia, inexistente ou com id malformado dão o mesmo "não encontrada".

const DEFAULT_MESSAGE_LIMIT = 30;

/** Limite de mensagens do funcionário por conversa (decisão 5), lido do env do Convex. */
export function readMessageLimit(): number {
  const fromEnv = Number(process.env.MAX_MESSAGES_PER_CONVERSATION);
  return Number.isInteger(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_MESSAGE_LIMIT;
}

/** A conversa, se existir e for do funcionário; senão null (sem distinguir os casos). */
export async function findOwnedConversation(
  ctx: QueryCtx,
  employeeId: Id<"people">,
  rawConversationId: string,
): Promise<Doc<"conversations"> | null> {
  const conversationId = ctx.db.normalizeId("conversations", rawConversationId);
  if (!conversationId) return null;

  const conversation = await ctx.db.get(conversationId);
  if (!conversation || conversation.employeeId !== employeeId) return null;
  return conversation;
}

// ---------- Leituras ----------

/** Histórico do funcionário, da conversa mais recente para a mais antiga. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const employee = await requireEmployee(ctx);
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_employee_lastMessage", (q) => q.eq("employeeId", employee._id))
      .order("desc")
      .take(50);

    return conversations.map((conversation) => ({
      _id: conversation._id,
      status: conversation.status,
      subject: conversation.subject ?? null,
      lastMessageAt: conversation.lastMessageAt,
    }));
  },
});

/** Cabeçalho e campo de mensagem: estado, contador, limite e quem está atendendo. */
export const get = query({
  args: { conversationId: v.string() },
  handler: async (ctx, { conversationId }) => {
    const employee = await requireEmployee(ctx);
    const conversation = await findOwnedConversation(ctx, employee._id, conversationId);
    if (!conversation) return null;

    const analyst = conversation.assignedAnalystId
      ? await ctx.db.get(conversation.assignedAnalystId)
      : null;

    return {
      _id: conversation._id,
      status: conversation.status,
      subject: conversation.subject ?? null,
      agentBusy: conversation.agentBusy,
      employeeMessageCount: conversation.employeeMessageCount,
      messageLimit: readMessageLimit(),
      /** Teto diário de custo atingido (§12.3): o agent não responde até a meia-noite. */
      dailyLimitReached: await isDailyCostLimitReached(ctx, Date.now()),
      analyst: analyst ? { name: analyst.name, level: analyst.level ?? null } : null,
      lastMessageAt: conversation.lastMessageAt,
    };
  },
});

/** O limite, para a tela de conversa nova (que ainda não tem conversa para consultar). */
export const messageLimit = query({
  args: {},
  handler: async (ctx) => {
    await requireEmployee(ctx);
    return readMessageLimit();
  },
});

/**
 * Teto diário de custo atingido (§12.3), antes de existir conversa: o "Nova conversa" avisa
 * em vez de criar uma conversa que já nasceria bloqueada.
 */
export const dailyLimitReached = query({
  args: {},
  handler: async (ctx) => {
    await requireEmployee(ctx);
    return await isDailyCostLimitReached(ctx, Date.now());
  },
});

// ---------- Escritas do funcionário ----------

export type CreateConversationError = "not_found" | "conversation_limit_reached";

/**
 * Abre uma conversa em `agent`. Com `inheritSummaryFrom`, herda o resumo acumulado da
 * anterior ("Nova conversa (com resumo desta)", quando o limite de 30 foi atingido).
 *
 * Cada funcionário começa no máximo `MAX_CONVERSATIONS_PER_DAY` conversas por dia (§12.3);
 * só conta a conversa que recebeu ao menos uma mensagem dele. Se já houver uma conversa vazia
 * criada hoje (o "Nova conversa" clicado sem escrever nada), ela é devolvida em vez de
 * criar outra: assim as vazias não contam e também não se acumulam.
 */
export const create = mutation({
  args: { inheritSummaryFrom: v.optional(v.string()) },
  handler: async (
    ctx,
    { inheritSummaryFrom },
  ): Promise<Result<{ conversationId: Id<"conversations"> }, CreateConversationError>> => {
    const employee = await requireEmployee(ctx);
    const now = Date.now();
    const createdToday = await findConversationsCreatedToday(ctx, employee._id, now);
    if (countStartedConversations(createdToday) >= readConversationsPerDayLimit()) {
      return err("conversation_limit_reached");
    }

    let rollingSummary: string | undefined;
    if (inheritSummaryFrom !== undefined) {
      const previous = await findOwnedConversation(ctx, employee._id, inheritSummaryFrom);
      if (!previous) return err("not_found");
      rollingSummary = previous.rollingSummary;
    }

    const empty = createdToday.find(isUnusedConversation);
    if (empty) {
      await ctx.db.patch(empty._id, { rollingSummary, lastMessageAt: now });
      return ok({ conversationId: empty._id });
    }

    const conversationId = await ctx.db.insert("conversations", {
      employeeId: employee._id,
      status: "agent",
      rollingSummary,
      employeeMessageCount: 0,
      agentBusy: false,
      clarificationAttempts: 0,
      lastMessageAt: now,
    });
    return ok({ conversationId });
  },
});

/** Conversa aberta e nunca usada: sem mensagem do funcionário e ainda com o agent. */
function isUnusedConversation(conversation: Doc<"conversations">): boolean {
  return (
    conversation.employeeMessageCount === 0 &&
    conversation.status === "agent" &&
    conversation.handoff === undefined
  );
}

export type RequestAnalystError = "not_found" | "empty_conversation" | TransferError;

const MESSAGE_LIMIT_HANDOFF_SUMMARY =
  "O funcionário atingiu o limite de mensagens da conversa e pediu para falar com um analista.";
const DAILY_LIMIT_HANDOFF_SUMMARY =
  "O Nexo Assist atingiu o limite de uso do dia e o funcionário pediu para falar com um analista. Leia as últimas mensagens dele.";

/**
 * "Falar com um analista" no campo bloqueado pelo limite de mensagens ou pelo teto diário de
 * custo (§7.2, §12.3): transfere sem passar pelo agent. Os outros pedidos de transferência
 * chegam como mensagem e quem decide é o agent.
 *
 * Conversa sem nenhuma mensagem do funcionário não vai para a fila (`empty_conversation`):
 * o analista receberia "Sem mensagens ainda" sem saber o pedido. No teto diário, o "Nova
 * conversa" leva à conversa nova; a primeira mensagem é salva para o analista e o campo
 * oferece "Falar com um analista", que transfere já com o pedido.
 */
export const requestAnalyst = mutation({
  args: { conversationId: v.string() },
  handler: async (ctx, { conversationId }): Promise<Result<null, RequestAnalystError>> => {
    const employee = await requireEmployee(ctx);
    const conversation = await findOwnedConversation(ctx, employee._id, conversationId);
    if (!conversation) return err("not_found");
    if (conversation.employeeMessageCount === 0) return err("empty_conversation");

    return await transferToAnalyst(ctx, conversation, {
      reason: "requested",
      summary: conversation.rollingSummary ?? limitHandoffSummary(conversation),
      ticketCode: conversation.selectedTicketCode,
    });
  },
});

function limitHandoffSummary(conversation: Doc<"conversations">): string {
  return conversation.employeeMessageCount >= readMessageLimit()
    ? MESSAGE_LIMIT_HANDOFF_SUMMARY
    : DAILY_LIMIT_HANDOFF_SUMMARY;
}
