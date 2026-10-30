import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { secretsMatch } from "./lib/secrets";
import { buildSeedTickets } from "./seedData";

// Apoio ao runner de evals (T14b, `npm run evals`). Só funciona num deployment com
// EVALS_SECRET definido (o local de desenvolvimento): sem a variável, tudo é recusado, então
// a limpeza destrutiva nunca roda em produção.
//
// - `resetForScenario`: devolve o banco ao estado do seed antes de cada cenário;
// - `observe`: tudo o que o runner compara depois de cada passo, numa leitura só.

function requireEvalsSecret(secret: string): void {
  const expected = process.env.EVALS_SECRET;
  if (!expected || !secretsMatch(secret, expected)) {
    throw new ConvexError("Acesso negado: apoio aos evals sem o EVALS_SECRET.");
  }
}

async function findPersonByEmail(
  ctx: QueryCtx | MutationCtx,
  email: string,
): Promise<Doc<"people">> {
  const person = await ctx.db
    .query("people")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
  if (!person) throw new ConvexError(`Pessoa ${email} não está no seed.`);
  return person;
}

// ---------- Antes do cenário ----------

/**
 * Apaga o que execuções anteriores deixaram e roda o seed de novo:
 * 1. chamados que não são do seed (de qualquer pessoa: o INC do cenário crítico do Rafael
 *    apareceria no `findSimilar` do cenário seguinte dele), com histórico e chaves;
 * 2. todas as conversas do funcionário do cenário (a do seed, do Pedro, volta com o seed);
 * 3. o seed, que restaura os chamados dele ao estado inicial.
 */
export const resetForScenario = mutation({
  args: { secret: v.string(), employeeEmail: v.string() },
  handler: async (ctx, { secret, employeeEmail }) => {
    requireEvalsSecret(secret);
    const deletedTickets = await deleteTicketsOutsideSeed(ctx);
    const employee = await findPersonByEmail(ctx, employeeEmail);
    const deletedConversations = await deleteConversationsOf(ctx, employee._id);
    await ctx.runMutation(internal.seed.run, {});
    return { deletedTickets, deletedConversations };
  },
});

async function deleteTicketsOutsideSeed(ctx: MutationCtx): Promise<string[]> {
  const seedCodes = new Set(buildSeedTickets(Date.now()).map((ticket) => ticket.code));
  const extraTickets = (await ctx.db.query("tickets").collect()).filter(
    (ticket) => !seedCodes.has(ticket.code),
  );
  const extraCodes = new Set(extraTickets.map((ticket) => ticket.code));

  for (const ticket of extraTickets) {
    const updates = await ctx.db
      .query("ticketUpdates")
      .withIndex("by_ticket", (q) => q.eq("ticketId", ticket._id))
      .collect();
    for (const update of updates) await ctx.db.delete(update._id);
    await ctx.db.delete(ticket._id);
  }
  const keys = await ctx.db.query("idempotencyKeys").collect();
  for (const key of keys) {
    if (extraCodes.has(key.ticketCode)) await ctx.db.delete(key._id);
  }
  return [...extraCodes];
}

async function deleteConversationsOf(ctx: MutationCtx, employeeId: Id<"people">): Promise<number> {
  const conversations = await ctx.db
    .query("conversations")
    .withIndex("by_employee_lastMessage", (q) => q.eq("employeeId", employeeId))
    .collect();
  for (const conversation of conversations) {
    const contents = await conversationContents(ctx, conversation._id);
    for (const row of [...contents.messages, ...contents.decisions, ...contents.pendingActions]) {
      await ctx.db.delete(row._id);
    }
    await ctx.db.delete(conversation._id);
  }
  return conversations.length;
}

// ---------- Depois de cada passo ----------

/** A conversa inteira (mensagens, decisões, rascunhos) e os chamados do funcionário. */
export const observe = query({
  args: { secret: v.string(), conversationId: v.id("conversations") },
  handler: async (ctx, { secret, conversationId }) => {
    requireEvalsSecret(secret);
    const conversation = await ctx.db.get(conversationId);
    if (!conversation) throw new ConvexError("Conversa não encontrada.");

    const contents = await conversationContents(ctx, conversationId);
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_owner_status", (q) => q.eq("ownerId", conversation.employeeId))
      .collect();
    return { conversation, ...contents, employeeTickets: tickets };
  },
});

async function conversationContents(ctx: QueryCtx, conversationId: Id<"conversations">) {
  const messages = await ctx.db
    .query("messages")
    .withIndex("by_conversation_createdAt", (q) => q.eq("conversationId", conversationId))
    .order("asc")
    .collect();
  const decisions = await ctx.db
    .query("decisions")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .collect();
  const pendingActions = await ctx.db
    .query("pendingActions")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .collect();
  return { messages, decisions, pendingActions };
}
