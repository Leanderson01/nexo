import { v } from "convex/values";

import type { TicketDetail, TicketSummary } from "../src/domain/ticket";
import type { Doc } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { canReadConversation, requirePerson } from "./lib/guards";
import { findOwnedTicket, listOwnedTickets, loadDetail, toSummary } from "./ticketing/reads";

// Leituras dos blocos de mensagem (T7) escopadas pela conversa, para o console (T12).
// As do chat (`ticketing.queries.getMine`, `pendingActions.get`...) respondem "os meus";
// estas respondem "desta conversa": quem pode ler a conversa (o funcionário dono ou um
// analista, `canReadConversation`) lê os blocos dela, e chamado só volta se for do
// funcionário daquela conversa. Inexistente, alheio ou id malformado: null, sem distinguir.

async function findReadableConversation(
  ctx: QueryCtx,
  person: Doc<"people">,
  rawConversationId: string,
): Promise<Doc<"conversations"> | null> {
  const conversationId = ctx.db.normalizeId("conversations", rawConversationId);
  const conversation = conversationId ? await ctx.db.get(conversationId) : null;
  if (!conversation || !canReadConversation(person, conversation)) return null;
  return conversation;
}

/** Card de chamado: o chamado, se for do funcionário da conversa. */
export const ticket = query({
  args: { conversationId: v.string(), code: v.string() },
  handler: async (ctx, { conversationId, code }): Promise<TicketDetail | null> => {
    const person = await requirePerson(ctx);
    const conversation = await findReadableConversation(ctx, person, conversationId);
    if (!conversation) return null;

    const ticket = await findOwnedTicket(ctx, conversation.employeeId, code);
    return ticket ? await loadDetail(ctx, ticket) : null;
  },
});

/** Seletor de chamados: os chamados do funcionário da conversa. */
export const tickets = query({
  args: { conversationId: v.string() },
  handler: async (ctx, { conversationId }): Promise<TicketSummary[] | null> => {
    const person = await requirePerson(ctx);
    const conversation = await findReadableConversation(ctx, person, conversationId);
    if (!conversation) return null;

    const owned = await listOwnedTickets(ctx, conversation.employeeId);
    return owned.map(toSummary);
  },
});

/** Card de rascunho: o rascunho com o estado atual (mesmo formato de `pendingActions.get`). */
export const pendingAction = query({
  args: { pendingActionId: v.string() },
  handler: async (ctx, { pendingActionId }) => {
    const person = await requirePerson(ctx);
    const id = ctx.db.normalizeId("pendingActions", pendingActionId);
    const row = id ? await ctx.db.get(id) : null;
    if (!row) return null;
    if (!(await findReadableConversation(ctx, person, row.conversationId))) return null;

    return {
      id: row._id as string,
      draftNumber: row.draftNumber,
      action: row.action,
      status: row.status,
      resultTicketCode: row.resultTicketCode ?? null,
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt ?? null,
    };
  },
});

/** Chips de ação de uma resposta do agent (mesmo formato de `decisions.getActionLabels`). */
export const actionLabels = query({
  args: { messageId: v.string() },
  handler: async (ctx, { messageId }): Promise<string[] | null> => {
    const person = await requirePerson(ctx);
    const id = ctx.db.normalizeId("messages", messageId);
    const message = id ? await ctx.db.get(id) : null;
    if (!message) return null;
    if (!(await findReadableConversation(ctx, person, message.conversationId))) return null;

    const decision = message.decisionId ? await ctx.db.get(message.decisionId) : null;
    return decision ? decision.actions.map((action) => action.label) : [];
  },
});
