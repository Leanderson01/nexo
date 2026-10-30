import { v } from "convex/values";

import type { MessagePart } from "../src/domain/message-parts";
import type { MessageRole } from "../src/domain/enums";
import { err, ok, type Result } from "../src/domain/result";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireAgentServer } from "./lib/guards";
import { transferToAnalyst, type TransferError } from "./lib/handoff";
import { recordTurnUsage } from "./usage";
import {
  decisionRecordFields,
  vHandoffOffer,
  vHandoffReason,
  vPendingAction,
} from "./lib/validators";

// Leituras e escritas do pipeline do agent (T10, §6). Só o servidor do Next chama, com o
// AGENT_SERVER_SECRET: todas começam por `requireAgentServer`. A resposta em streaming
// (`appendDelta`, `finalize`, `fail`) continua em convex/messages.ts.

/** Janela de mensagens que o modelo vê a cada turno (§6.7). */
export const HISTORY_WINDOW = 12;
/** O resumo acumulado é refeito quando há esta quantidade de mensagens fora dele (§6.7). */
export const SUMMARY_EVERY = 10;

const DRAFT_COUNTER = "draft";

// ---------- Leitura do contexto do turno ----------

export interface HistoryMessage {
  role: MessageRole;
  parts: MessagePart[];
  createdAt: number;
  /** Nome de quem escreveu, só nas mensagens do analista. */
  authorName: string | null;
}

/**
 * Tudo o que o turno precisa do Convex (§5.2): estado da conversa, rascunho pendente,
 * funcionário, as últimas 12 mensagens antes da resposta em andamento e, quando já passou da
 * hora de refazer o resumo, as mensagens que ainda não entraram nele.
 */
export const loadTurnContext = query({
  args: {
    secret: v.string(),
    conversationId: v.id("conversations"),
    assistantMessageId: v.id("messages"),
  },
  handler: async (ctx, { secret, conversationId, assistantMessageId }) => {
    requireAgentServer(secret);
    const conversation = await ctx.db.get(conversationId);
    const assistantMessage = await ctx.db.get(assistantMessageId);
    if (!conversation || !assistantMessage) return null;

    const employee = await ctx.db.get(conversation.employeeId);
    if (!employee) return null;

    const history = await loadHistoryBefore(ctx, conversationId, assistantMessage.createdAt);
    const summarizedCount = conversation.summarizedMessageCount ?? 0;
    const unsummarized = history.slice(summarizedCount);

    return {
      conversation: {
        status: conversation.status,
        clarificationAttempts: conversation.clarificationAttempts,
        selectedTicketCode: conversation.selectedTicketCode ?? null,
        rollingSummary: conversation.rollingSummary ?? null,
        returnNote: conversation.returnNote ?? null,
        pendingHandoffOffer: conversation.pendingHandoffOffer ?? null,
      },
      pendingDraft: await loadPendingDraft(ctx, conversation),
      employee: {
        id: employee._id as string,
        name: employee.name,
        department: employee.department,
      },
      recentMessages: history.slice(-HISTORY_WINDOW),
      messagesToSummarize: unsummarized.length >= SUMMARY_EVERY ? unsummarized : [],
      messageCount: history.length,
    };
  },
});

async function loadHistoryBefore(
  ctx: QueryCtx,
  conversationId: Id<"conversations">,
  before: number,
): Promise<HistoryMessage[]> {
  const messages = await ctx.db
    .query("messages")
    .withIndex("by_conversation_createdAt", (q) =>
      q.eq("conversationId", conversationId).lt("createdAt", before),
    )
    .order("asc")
    .collect();

  const history: HistoryMessage[] = [];
  for (const message of messages) {
    // Respostas que falharam ou ainda estão em andamento não entram no contexto.
    if (message.status === "streaming") continue;
    history.push({
      role: message.role,
      parts: message.parts,
      createdAt: message.createdAt,
      authorName: await analystName(ctx, message),
    });
  }
  return history;
}

async function analystName(ctx: QueryCtx, message: Doc<"messages">): Promise<string | null> {
  if (message.role !== "analyst" || !message.authorId) return null;
  const author = await ctx.db.get(message.authorId);
  return author?.name ?? null;
}

async function loadPendingDraft(ctx: QueryCtx, conversation: Doc<"conversations">) {
  if (!conversation.pendingActionId) return null;
  const draft = await ctx.db.get(conversation.pendingActionId);
  if (!draft || draft.status !== "pending") return null;
  return { id: draft._id as string, draftNumber: draft.draftNumber, action: draft.action };
}

// ---------- Rascunho ----------

/**
 * Cria o rascunho proposto pelo agent (§6.4): número sequencial do contador `draft`, o
 * rascunho pendente anterior vira `superseded` e a conversa passa a apontar para o novo.
 */
export const createDraft = mutation({
  args: {
    secret: v.string(),
    conversationId: v.id("conversations"),
    action: vPendingAction,
    handoffOnConfirm: v.boolean(),
  },
  handler: async (ctx, { secret, conversationId, action, handoffOnConfirm }) => {
    requireAgentServer(secret);
    const now = Date.now();
    await supersedePendingDrafts(ctx, conversationId, now);

    const draftNumber = await nextCounterValue(ctx, DRAFT_COUNTER);
    const pendingActionId = await ctx.db.insert("pendingActions", {
      conversationId,
      draftNumber,
      action,
      status: "pending",
      handoffOnConfirm,
      createdAt: now,
    });
    await ctx.db.patch(conversationId, { pendingActionId });
    return { pendingActionId: pendingActionId as string, draftNumber };
  },
});

async function supersedePendingDrafts(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
  now: number,
) {
  const drafts = await ctx.db
    .query("pendingActions")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .collect();
  for (const draft of drafts) {
    if (draft.status === "pending") {
      await ctx.db.patch(draft._id, { status: "superseded", resolvedAt: now });
    }
  }
}

async function nextCounterValue(ctx: MutationCtx, name: string): Promise<number> {
  const counter = await ctx.db
    .query("counters")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
  if (!counter) {
    await ctx.db.insert("counters", { name, value: 1 });
    return 1;
  }
  const value = counter.value + 1;
  await ctx.db.patch(counter._id, { value });
  return value;
}

// ---------- Estado do turno ----------

/**
 * Atualiza o estado da conversa no fim do turno. Campo ausente fica como está; `null` limpa
 * (`selectedTicketCode`, `pendingHandoffOffer`). `clearReturnNote` apaga a nota do analista
 * depois que o agent a usou.
 */
export const saveTurnState = mutation({
  args: {
    secret: v.string(),
    conversationId: v.id("conversations"),
    selectedTicketCode: v.optional(v.union(v.string(), v.null())),
    clarificationAttempts: v.optional(v.number()),
    pendingHandoffOffer: v.optional(v.union(vHandoffOffer, v.null())),
    rollingSummary: v.optional(v.string()),
    summarizedMessageCount: v.optional(v.number()),
    clearReturnNote: v.optional(v.boolean()),
  },
  handler: async (ctx, { secret, conversationId, ...state }) => {
    requireAgentServer(secret);
    const patch: Partial<Doc<"conversations">> = {};
    if (state.selectedTicketCode !== undefined) {
      patch.selectedTicketCode = state.selectedTicketCode ?? undefined;
    }
    if (state.clarificationAttempts !== undefined) {
      patch.clarificationAttempts = state.clarificationAttempts;
    }
    if (state.pendingHandoffOffer !== undefined) {
      patch.pendingHandoffOffer = state.pendingHandoffOffer ?? undefined;
    }
    if (state.rollingSummary !== undefined) patch.rollingSummary = state.rollingSummary;
    if (state.summarizedMessageCount !== undefined) {
      patch.summarizedMessageCount = state.summarizedMessageCount;
    }
    if (state.clearReturnNote) patch.returnNote = undefined;
    await ctx.db.patch(conversationId, patch);
  },
});

// ---------- Registro de decisão ----------

/**
 * Grava o `DecisionRecord` do turno (§6.6); o `finalize` liga o id à mensagem. Os tokens e o
 * custo do turno entram no uso do dia, que alimenta o teto diário (§12.3).
 */
export const recordDecision = mutation({
  args: {
    secret: v.string(),
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
    record: v.object(decisionRecordFields),
  },
  handler: async (ctx, { secret, conversationId, messageId, record }) => {
    requireAgentServer(secret);
    await recordTurnUsage(ctx, record.usage, Date.now());
    return await ctx.db.insert("decisions", { conversationId, messageId, ...record });
  },
});

// ---------- Transferência ----------

export type AgentTransferError = "not_found" | TransferError;

/** Transfere para um analista com o resumo do caso (§3.3), pelo helper compartilhado. */
export const transfer = mutation({
  args: {
    secret: v.string(),
    conversationId: v.id("conversations"),
    reason: vHandoffReason,
    summary: v.string(),
    ticketCode: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { secret, conversationId, ...handoff },
  ): Promise<Result<null, AgentTransferError>> => {
    requireAgentServer(secret);
    const conversation = await ctx.db.get(conversationId);
    if (!conversation) return err("not_found");

    const result = await transferToAnalyst(ctx, conversation, handoff);
    if (!result.ok) return result;
    // A oferta pendente perde o sentido depois da transferência.
    await ctx.db.patch(conversationId, { pendingHandoffOffer: undefined });
    return ok(null);
  },
});
