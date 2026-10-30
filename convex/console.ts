import { v } from "convex/values";

import {
  belongsToTab,
  compareQueueEntries,
  countByTab,
  type QueueEntry,
} from "../src/domain/console-queue";
import { transition, TRANSITION_EVENTS } from "../src/domain/conversation-fsm";
import type { ConversationStatus, HandoffReason } from "../src/domain/enums";
import type { MessagePart } from "../src/domain/message-parts";
import { err, ok, type Result } from "../src/domain/result";
import { maskSensitiveData } from "../src/domain/sensitive-data";
import type { SlaTicket } from "../src/domain/sla";
import { normalizeText } from "../src/shared/normalize-text";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireAnalyst } from "./lib/guards";
import { vConsoleTab, vHandoffReason } from "./lib/validators";
import { findOwnedTicket } from "./ticketing/reads";

// Console do analista (§7.4, §7.5, §9): a fila, a conversa e as ações sobre ela.
// Tudo passa por `requireAnalyst`; as transições de estado, por `transition` (§5.9), e cada
// uma grava uma mensagem `system` com o evento, que o funcionário vê no chat.

/** Conversas com o agent e encerradas: só as mais recentes entram na fila. */
const RECENT_CONVERSATIONS_LIMIT = 50;

// ---------- Fila ----------

export interface QueueItem {
  _id: Id<"conversations">;
  status: ConversationStatus;
  employeeName: string;
  subject: string | null;
  lastMessage: { role: Doc<"messages">["role"]; text: string } | null;
  /** Motivo da transferência; null para conversas que nunca foram para um analista. */
  reason: HandoffReason | null;
  /** Instante da transferência, enquanto a conversa espera ou está com analista. */
  waitingSince: number | null;
  lastMessageAt: number;
  /** Chamado ligado à conversa, com o que a tela precisa para o selo de prazo. */
  ticket: (SlaTicket & { code: string }) | null;
  /** Nome de quem atende, quando está com um analista. */
  assignedAnalystName: string | null;
  isMine: boolean;
  unread: number;
}

/**
 * A fila do console. Contadores das abas são os totais; a aba, o motivo e a busca (nome do
 * funcionário, assunto ou código do chamado, sem diferenciar acento) filtram só a lista.
 */
export const listConversations = query({
  args: {
    tab: vConsoleTab,
    reason: v.optional(vHandoffReason),
    search: v.optional(v.string()),
  },
  handler: async (ctx, { tab, reason, search }) => {
    const analyst = await requireAnalyst(ctx);
    const conversations = await loadQueueConversations(ctx);
    const items = await Promise.all(
      conversations.map((conversation) => toQueueItem(ctx, conversation, analyst._id)),
    );

    const searchText = normalizeText(search?.trim() ?? "");
    const visible = items
      .filter((item) => belongsToTab(toQueueEntry(item), tab))
      .filter((item) => reason === undefined || item.reason === reason)
      .filter((item) => searchText === "" || matchesSearch(item, searchText))
      .sort((a, b) => compareQueueEntries(toQueueEntry(a), toQueueEntry(b)));

    return { items: visible, counts: countByTab(items.map(toQueueEntry)) };
  },
});

async function loadQueueConversations(ctx: QueryCtx): Promise<Doc<"conversations">[]> {
  const byStatus = (status: ConversationStatus) =>
    ctx.db
      .query("conversations")
      .withIndex("by_status_lastMessage", (q) => q.eq("status", status))
      .order("desc");

  const [waiting, withAnalyst, withAgent, closed] = await Promise.all([
    byStatus("waiting_analyst").collect(),
    byStatus("with_analyst").collect(),
    byStatus("agent").take(RECENT_CONVERSATIONS_LIMIT),
    byStatus("closed").take(RECENT_CONVERSATIONS_LIMIT),
  ]);
  // Conversa aberta e nunca usada (sem mensagem do funcionário) não interessa ao analista.
  const used = (conversation: Doc<"conversations">) =>
    conversation.employeeMessageCount > 0 || conversation.handoff !== undefined;
  return [...waiting, ...withAnalyst, ...withAgent.filter(used), ...closed.filter(used)];
}

async function toQueueItem(
  ctx: QueryCtx,
  conversation: Doc<"conversations">,
  analystId: Id<"people">,
): Promise<QueueItem> {
  const employee = await ctx.db.get(conversation.employeeId);
  const assignedAnalyst = conversation.assignedAnalystId
    ? await ctx.db.get(conversation.assignedAnalystId)
    : null;
  const ticketCode = relatedTicketCode(conversation);
  const ticket = ticketCode
    ? await findOwnedTicket(ctx, conversation.employeeId, ticketCode)
    : null;
  const isWithAnalyst =
    conversation.status === "waiting_analyst" || conversation.status === "with_analyst";

  return {
    _id: conversation._id,
    status: conversation.status,
    employeeName: employee?.name ?? "Funcionário",
    subject: conversation.subject ?? null,
    lastMessage: await findLastMessagePreview(ctx, conversation._id),
    reason: conversation.handoff?.reason ?? null,
    waitingSince: isWithAnalyst ? (conversation.handoff?.at ?? null) : null,
    lastMessageAt: conversation.lastMessageAt,
    ticket: ticket
      ? {
          code: ticket.code,
          priority: ticket.priority,
          status: ticket.status,
          lastActivityAt: ticket.lastActivityAt,
        }
      : null,
    assignedAnalystName: isWithAnalyst ? (assignedAnalyst?.name ?? null) : null,
    isMine: conversation.status === "with_analyst" && conversation.assignedAnalystId === analystId,
    unread: await countUnread(ctx, conversation),
  };
}

function toQueueEntry(item: QueueItem): QueueEntry {
  return {
    status: item.status,
    reason: item.reason,
    isMine: item.isMine,
    waitingSince: item.waitingSince,
    lastMessageAt: item.lastMessageAt,
  };
}

function matchesSearch(item: QueueItem, normalizedSearch: string): boolean {
  const fields = [item.employeeName, item.subject ?? "", item.ticket?.code ?? ""];
  return fields.some((field) => normalizeText(field).includes(normalizedSearch));
}

/** O chamado da transferência ou, se não houver, o que o funcionário escolheu na conversa. */
function relatedTicketCode(conversation: Doc<"conversations">): string | null {
  return conversation.handoff?.ticketCode ?? conversation.selectedTicketCode ?? null;
}

/** Última mensagem com texto (funcionário, agent ou analista), para a prévia da fila. */
async function findLastMessagePreview(
  ctx: QueryCtx,
  conversationId: Id<"conversations">,
): Promise<QueueItem["lastMessage"]> {
  const recent = await ctx.db
    .query("messages")
    .withIndex("by_conversation_createdAt", (q) => q.eq("conversationId", conversationId))
    .order("desc")
    .take(10);
  for (const message of recent) {
    if (message.role === "system") continue;
    const text = previewText(message.parts);
    if (text) return { role: message.role, text };
  }
  return null;
}

function previewText(parts: MessagePart[]): string {
  for (const part of parts) {
    if (part.type === "text" && part.text.trim() !== "") return part.text.trim();
    if (part.type === "ticketSelector") return part.prompt;
  }
  return "";
}

/**
 * Não lidas (decisão 12): mensagens do funcionário depois da última leitura da equipe de
 * analistas (`analystReadAt`) e da transferência. Só contam enquanto a conversa espera ou
 * está com analista; com o agent, quem responde é ele.
 */
async function countUnread(ctx: QueryCtx, conversation: Doc<"conversations">): Promise<number> {
  if (conversation.status !== "waiting_analyst" && conversation.status !== "with_analyst") {
    return 0;
  }
  const since = Math.max(conversation.analystReadAt ?? 0, conversation.handoff?.at ?? 0);
  const newer = await ctx.db
    .query("messages")
    .withIndex("by_conversation_createdAt", (q) =>
      q.eq("conversationId", conversation._id).gt("createdAt", since),
    )
    .collect();
  return newer.filter((message) => message.role === "user").length;
}

// ---------- Conversa ----------

/** Id malformado ou inexistente: null, como no chat. */
async function findConversation(
  ctx: QueryCtx,
  rawConversationId: string,
): Promise<Doc<"conversations"> | null> {
  const conversationId = ctx.db.normalizeId("conversations", rawConversationId);
  return conversationId ? await ctx.db.get(conversationId) : null;
}

/**
 * Cabeçalho, card de resumo da transferência (decisão 13) e o que o analista pode fazer.
 * O resumo junta o `handoff` com o que o histórico mostra: artigos sugeridos, perguntas de
 * esclarecimento, chamados citados e a confiança do agent no último turno.
 */
export const getConversation = query({
  args: { conversationId: v.string() },
  handler: async (ctx, { conversationId }) => {
    const analyst = await requireAnalyst(ctx);
    const conversation = await findConversation(ctx, conversationId);
    if (!conversation) return null;

    const employee = await ctx.db.get(conversation.employeeId);
    if (!employee) return null;
    const assignedAnalyst = conversation.assignedAnalystId
      ? await ctx.db.get(conversation.assignedAnalystId)
      : null;
    const isMine =
      conversation.status === "with_analyst" && conversation.assignedAnalystId === analyst._id;

    return {
      _id: conversation._id,
      status: conversation.status,
      subject: conversation.subject ?? null,
      employee: {
        _id: employee._id,
        name: employee.name,
        email: employee.email,
        department: employee.department,
      },
      handoff: conversation.handoff ?? null,
      relatedTicketCode: relatedTicketCode(conversation),
      assignedAnalyst:
        conversation.status === "with_analyst" && assignedAnalyst
          ? { name: assignedAnalyst.name, level: assignedAnalyst.level ?? null }
          : null,
      isMine,
      agentBusy: conversation.agentBusy,
      returnNote: conversation.returnNote ?? null,
      closedAt: conversation.closedAt ?? null,
      summary: await buildTransferSummary(ctx, conversation),
    };
  },
});

async function buildTransferSummary(ctx: QueryCtx, conversation: Doc<"conversations">) {
  const messages = await ctx.db
    .query("messages")
    .withIndex("by_conversation_createdAt", (q) => q.eq("conversationId", conversation._id))
    .collect();
  const decisions = await ctx.db
    .query("decisions")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
    .collect();
  decisions.sort((a, b) => a.createdAt - b.createdAt);

  const articleTitles = new Set<string>();
  const ticketCodes = new Set<string>();
  const handoffCode = relatedTicketCode(conversation);
  if (handoffCode) ticketCodes.add(handoffCode);
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === "article") articleTitles.add(part.title);
      if (part.type === "ticket") ticketCodes.add(part.code);
    }
  }

  const lastConfidence = decisions.findLast((decision) => decision.confidence !== null);
  return {
    articleTitles: [...articleTitles],
    clarifyingQuestions: decisions.filter((decision) => decision.outcome === "asked_clarification")
      .length,
    ticketCodes: [...ticketCodes],
    agentConfidence: lastConfidence?.confidence ?? null,
  };
}

/** O histórico completo para o analista; mesmo formato do `messages.list` do chat. */
export const listMessages = query({
  args: { conversationId: v.string() },
  handler: async (ctx, { conversationId }) => {
    await requireAnalyst(ctx);
    const conversation = await findConversation(ctx, conversationId);
    if (!conversation) return null;

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation_createdAt", (q) => q.eq("conversationId", conversation._id))
      .order("asc")
      .collect();
    return await Promise.all(
      messages.map(async (message) => {
        const author =
          message.role === "analyst" && message.authorId
            ? await ctx.db.get(message.authorId)
            : null;
        return {
          ...message,
          analyst: author ? { name: author.name, level: author.level ?? null } : null,
        };
      }),
    );
  },
});

/**
 * Marca como lidas as mensagens do funcionário (a tela chama ao abrir a conversa e quando
 * chega mensagem nova). A leitura é da equipe: vale para quem pode atender, ou seja, em
 * `waiting_analyst` qualquer analista; em `with_analyst`, só quem assumiu. Quem só acompanha
 * em modo leitura não zera o contador de quem atende.
 */
export const markRead = mutation({
  args: { conversationId: v.string() },
  handler: async (ctx, { conversationId }): Promise<void> => {
    const analyst = await requireAnalyst(ctx);
    const conversation = await findConversation(ctx, conversationId);
    if (!conversation) return;

    const canAttend =
      conversation.status === "waiting_analyst" ||
      (conversation.status === "with_analyst" && conversation.assignedAnalystId === analyst._id);
    if (canAttend) await ctx.db.patch(conversation._id, { analystReadAt: Date.now() });
  },
});

// ---------- Ações do analista ----------

/**
 * Erros esperados das ações: conversa inexistente, transição que a máquina de estados não
 * permite (ex.: outro analista assumiu antes), conversa atendida por outro analista e
 * mensagem vazia.
 */
export type ConsoleActionError = "not_found" | "invalid_transition" | "not_assigned" | "empty";

/** "Ana Ribeiro (Suporte N1)": como o analista aparece nos eventos do histórico. */
function analystDisplayName(analyst: Doc<"people">): string {
  return analyst.level ? `${analyst.name} (Suporte ${analyst.level})` : analyst.name;
}

/** Em atendimento por outro analista: só quem assumiu responde, devolve ou encerra (§7.5). */
function isAttendedByAnother(conversation: Doc<"conversations">, analyst: Doc<"people">) {
  return conversation.status === "with_analyst" && conversation.assignedAnalystId !== analyst._id;
}

async function insertEvent(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
  kind: (typeof TRANSITION_EVENTS)[keyof typeof TRANSITION_EVENTS],
  analyst: Doc<"people">,
  now: number,
) {
  await ctx.db.insert("messages", {
    conversationId,
    role: "system",
    parts: [{ type: "event", kind, actorName: analystDisplayName(analyst) }],
    status: "complete",
    createdAt: now,
  });
}

/** Assumir (`waiting_analyst → with_analyst`): o funcionário vê "Ana Ribeiro (Suporte N1) assumiu a conversa". */
export const assign = mutation({
  args: { conversationId: v.string() },
  handler: async (ctx, { conversationId }): Promise<Result<null, ConsoleActionError>> => {
    const analyst = await requireAnalyst(ctx);
    const conversation = await findConversation(ctx, conversationId);
    if (!conversation) return err("not_found");

    const next = transition(conversation.status, "assign");
    if (!next.ok) return err("invalid_transition");

    const now = Date.now();
    await ctx.db.patch(conversation._id, {
      status: next.value,
      assignedAnalystId: analyst._id,
      analystReadAt: now,
      lastMessageAt: now,
    });
    await insertEvent(ctx, conversation._id, TRANSITION_EVENTS.assign, analyst, now);
    return ok(null);
  },
});

/** Mensagem do analista; só de quem assumiu, e com os mesmos dados sensíveis mascarados. */
export const sendAnalystMessage = mutation({
  args: { conversationId: v.string(), text: v.string() },
  handler: async (ctx, { conversationId, text }): Promise<Result<null, ConsoleActionError>> => {
    const analyst = await requireAnalyst(ctx);
    const conversation = await findConversation(ctx, conversationId);
    if (!conversation) return err("not_found");
    if (conversation.status !== "with_analyst" || conversation.assignedAnalystId !== analyst._id) {
      return err("not_assigned");
    }

    const trimmed = text.trim();
    if (trimmed === "") return err("empty");

    const now = Date.now();
    await ctx.db.insert("messages", {
      conversationId: conversation._id,
      role: "analyst",
      authorId: analyst._id,
      parts: [{ type: "text", text: maskSensitiveData(trimmed).text }],
      status: "complete",
      createdAt: now,
    });
    await ctx.db.patch(conversation._id, { lastMessageAt: now, analystReadAt: now });
    return ok(null);
  },
});

/**
 * Devolver ao agent (de `with_analyst` ou, pela decisão 11, de `waiting_analyst`). A nota
 * opcional fica em `returnNote`: o agent lê no próximo turno junto com as mensagens do
 * analista (§7.5).
 */
export const returnToAgent = mutation({
  args: { conversationId: v.string(), note: v.optional(v.string()) },
  handler: async (ctx, { conversationId, note }): Promise<Result<null, ConsoleActionError>> => {
    const analyst = await requireAnalyst(ctx);
    const conversation = await findConversation(ctx, conversationId);
    if (!conversation) return err("not_found");
    if (isAttendedByAnother(conversation, analyst)) return err("not_assigned");

    const next = transition(conversation.status, "return");
    if (!next.ok) return err("invalid_transition");

    const now = Date.now();
    const trimmedNote = note?.trim();
    await ctx.db.patch(conversation._id, {
      status: next.value,
      assignedAnalystId: undefined,
      returnNote: trimmedNote ? maskSensitiveData(trimmedNote).text : undefined,
      lastMessageAt: now,
    });
    await insertEvent(ctx, conversation._id, TRANSITION_EVENTS.return, analyst, now);
    return ok(null);
  },
});

/** Encerrar (qualquer estado não encerrado → `closed`); o funcionário pode abrir outra conversa. */
export const close = mutation({
  args: { conversationId: v.string() },
  handler: async (ctx, { conversationId }): Promise<Result<null, ConsoleActionError>> => {
    const analyst = await requireAnalyst(ctx);
    const conversation = await findConversation(ctx, conversationId);
    if (!conversation) return err("not_found");
    if (isAttendedByAnother(conversation, analyst)) return err("not_assigned");

    const next = transition(conversation.status, "close");
    if (!next.ok) return err("invalid_transition");

    const now = Date.now();
    await ctx.db.patch(conversation._id, {
      status: next.value,
      closedAt: now,
      lastMessageAt: now,
    });
    await insertEvent(ctx, conversation._id, TRANSITION_EVENTS.close, analyst, now);
    return ok(null);
  },
});
