import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import {
  SEED_ARTICLES,
  SEED_CONVERSATION_EMPLOYEE_EMAIL,
  SEED_CONVERSATION_TICKET_CODE,
  SEED_COUNTERS,
  SEED_HANDOFF_SUMMARY,
  SEED_PEOPLE,
  buildSearchText,
  buildSeedConversationTimes,
  buildSeedTickets,
  type SeedTicket,
} from "./seedData";

// Seed idempotente (§4): `npm run seed`. Cada registro tem uma chave natural
// (e-mail, código, slug, nome do contador); rodar de novo atualiza em vez de duplicar
// e recalcula as datas relativas, devolvendo os cenários de demonstração ao estado inicial.

type PeopleIdsByEmail = Map<string, Id<"people">>;

export const run = internalMutation({
  args: {
    /** Só para testes: fixa o "agora" das datas relativas. */
    now: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const peopleIds = await upsertPeople(ctx);
    await upsertTickets(ctx, now, peopleIds);
    await upsertCounters(ctx);
    await upsertArticles(ctx);
    await resetSeedConversation(ctx, now, peopleIds);
    return {
      people: SEED_PEOPLE.length,
      tickets: buildSeedTickets(now).length,
      articles: SEED_ARTICLES.length,
      counters: SEED_COUNTERS.length,
    };
  },
});

// ---------- Pessoas ----------

async function upsertPeople(ctx: MutationCtx): Promise<PeopleIdsByEmail> {
  const ids: PeopleIdsByEmail = new Map();
  for (const person of SEED_PEOPLE) {
    const existing = await ctx.db
      .query("people")
      .withIndex("by_email", (q) => q.eq("email", person.email))
      .unique();
    if (existing) {
      await ctx.db.replace(existing._id, person);
      ids.set(person.email, existing._id);
    } else {
      ids.set(person.email, await ctx.db.insert("people", person));
    }
  }
  return ids;
}

function requirePersonId(peopleIds: PeopleIdsByEmail, email: string): Id<"people"> {
  const id = peopleIds.get(email);
  if (!id) throw new Error(`Seed inconsistente: ${email} não está entre as pessoas.`);
  return id;
}

// ---------- Chamados ----------

async function upsertTickets(ctx: MutationCtx, now: number, peopleIds: PeopleIdsByEmail) {
  for (const seedTicket of buildSeedTickets(now)) {
    const ticketId = await upsertTicket(ctx, seedTicket, peopleIds);
    await replaceTicketUpdates(ctx, ticketId, seedTicket);
  }
}

async function upsertTicket(
  ctx: MutationCtx,
  seedTicket: SeedTicket,
  peopleIds: PeopleIdsByEmail,
): Promise<Id<"tickets">> {
  const ticket = toTicketFields(seedTicket, requirePersonId(peopleIds, seedTicket.ownerEmail));

  const existing = await ctx.db
    .query("tickets")
    .withIndex("by_code", (q) => q.eq("code", seedTicket.code))
    .unique();
  if (existing) {
    await ctx.db.replace(existing._id, ticket);
    return existing._id;
  }
  return await ctx.db.insert("tickets", ticket);
}

function toTicketFields(
  seedTicket: SeedTicket,
  ownerId: Id<"people">,
): Omit<Doc<"tickets">, "_id" | "_creationTime"> {
  return {
    code: seedTicket.code,
    kind: seedTicket.kind,
    category: seedTicket.category,
    priority: seedTicket.priority,
    priorityReason: seedTicket.priorityReason,
    prioritySignals: seedTicket.prioritySignals,
    status: seedTicket.status,
    title: seedTicket.title,
    description: seedTicket.description,
    affected: seedTicket.affected,
    ownerId,
    createdAt: seedTicket.createdAt,
    lastActivityAt: seedTicket.lastActivityAt,
    resolvedAt: seedTicket.resolvedAt,
  };
}

/** O histórico de um chamado do seed é sempre o do cenário: apaga e grava de novo. */
async function replaceTicketUpdates(
  ctx: MutationCtx,
  ticketId: Id<"tickets">,
  seedTicket: SeedTicket,
) {
  const oldUpdates = await ctx.db
    .query("ticketUpdates")
    .withIndex("by_ticket", (q) => q.eq("ticketId", ticketId))
    .collect();
  for (const update of oldUpdates) await ctx.db.delete(update._id);

  for (const update of seedTicket.updates) {
    await ctx.db.insert("ticketUpdates", { ticketId, ...update });
  }
}

// ---------- Contadores ----------

/** Nunca volta um contador para trás: códigos já emitidos pelo app não podem se repetir. */
async function upsertCounters(ctx: MutationCtx) {
  for (const counter of SEED_COUNTERS) {
    const existing = await ctx.db
      .query("counters")
      .withIndex("by_name", (q) => q.eq("name", counter.name))
      .unique();
    if (!existing) {
      await ctx.db.insert("counters", counter);
    } else if (existing.value < counter.value) {
      await ctx.db.patch(existing._id, { value: counter.value });
    }
  }
}

// ---------- Artigos ----------

async function upsertArticles(ctx: MutationCtx) {
  for (const seedArticle of SEED_ARTICLES) {
    const article = { ...seedArticle, searchText: buildSearchText(seedArticle) };
    const existing = await ctx.db
      .query("articles")
      .withIndex("by_slug", (q) => q.eq("slug", seedArticle.slug))
      .unique();
    if (existing) {
      await ctx.db.replace(existing._id, article);
    } else {
      await ctx.db.insert("articles", article);
    }
  }
}

// ---------- Conversa inicial do Pedro ----------

/**
 * Conversa transferida pelo crítico INC-20420, aguardando analista, para o console não
 * abrir vazio. A chave natural é (Pedro, INC-20420); ao rodar de novo, ela volta ao início.
 */
async function resetSeedConversation(ctx: MutationCtx, now: number, peopleIds: PeopleIdsByEmail) {
  const employeeId = requirePersonId(peopleIds, SEED_CONVERSATION_EMPLOYEE_EMAIL);
  const times = buildSeedConversationTimes(now);

  const conversationFields = {
    employeeId,
    status: "waiting_analyst" as const,
    handoff: {
      reason: "critical" as const,
      summary: SEED_HANDOFF_SUMMARY,
      ticketCode: SEED_CONVERSATION_TICKET_CODE,
      at: times.ticketCreatedAt,
    },
    selectedTicketCode: SEED_CONVERSATION_TICKET_CODE,
    employeeMessageCount: 1,
    agentBusy: false,
    clarificationAttempts: 0,
    lastMessageAt: times.ticketCreatedAt,
  };

  const existing = await findSeedConversation(ctx, employeeId);
  let conversationId: Id<"conversations">;
  if (existing) {
    await deleteConversationContents(ctx, existing._id);
    await ctx.db.replace(existing._id, conversationFields);
    conversationId = existing._id;
  } else {
    conversationId = await ctx.db.insert("conversations", conversationFields);
  }

  await insertSeedConversationMessages(ctx, conversationId, employeeId, now);
}

async function findSeedConversation(
  ctx: MutationCtx,
  employeeId: Id<"people">,
): Promise<Doc<"conversations"> | null> {
  const conversations = await ctx.db
    .query("conversations")
    .withIndex("by_employee_lastMessage", (q) => q.eq("employeeId", employeeId))
    .collect();
  return (
    conversations.find(
      (conversation) =>
        conversation.handoff?.ticketCode === SEED_CONVERSATION_TICKET_CODE ||
        conversation.selectedTicketCode === SEED_CONVERSATION_TICKET_CODE,
    ) ?? null
  );
}

async function deleteConversationContents(ctx: MutationCtx, conversationId: Id<"conversations">) {
  const messages = await ctx.db
    .query("messages")
    .withIndex("by_conversation_createdAt", (q) => q.eq("conversationId", conversationId))
    .collect();
  const pendingActions = await ctx.db
    .query("pendingActions")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .collect();
  const decisions = await ctx.db
    .query("decisions")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .collect();
  for (const row of [...messages, ...pendingActions, ...decisions]) await ctx.db.delete(row._id);
}

async function insertSeedConversationMessages(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
  employeeId: Id<"people">,
  now: number,
) {
  const times = buildSeedConversationTimes(now);
  const ticket = buildSeedTickets(now).find((t) => t.code === SEED_CONVERSATION_TICKET_CODE);
  if (!ticket) throw new Error(`Seed inconsistente: falta o ${SEED_CONVERSATION_TICKET_CODE}.`);

  // O rascunho já confirmado: o card mostra o estado final "Chamado criado".
  const pendingActionId = await ctx.db.insert("pendingActions", {
    conversationId,
    draftNumber: SEED_COUNTERS.find((c) => c.name === "draft")?.value ?? 0,
    action: {
      kind: "create_ticket",
      ticket: {
        kind: ticket.kind,
        category: ticket.category,
        title: ticket.title,
        description: ticket.description,
        affected: ticket.affected,
        prioritySignals: ticket.prioritySignals,
        priority: ticket.priority,
        priorityReason: ticket.priorityReason,
      },
    },
    status: "confirmed",
    handoffOnConfirm: true,
    resultTicketCode: ticket.code,
    createdAt: times.draftProposedAt,
    resolvedAt: times.ticketCreatedAt,
  });

  const messages: Omit<Doc<"messages">, "_id" | "_creationTime">[] = [
    {
      conversationId,
      role: "user",
      authorId: employeeId,
      parts: [
        {
          type: "text",
          text: "O sistema de estoque saiu do ar para toda a equipe de Operações. Ninguém consegue dar baixa nos pedidos.",
        },
      ],
      status: "complete",
      createdAt: times.reportedAt,
    },
    {
      conversationId,
      role: "assistant",
      parts: [
        {
          type: "text",
          text: "Isso parou a equipe inteira, então é um caso crítico. Preparei o chamado: confira e confirme para eu registrar.",
        },
        { type: "draft", pendingActionId },
      ],
      status: "complete",
      createdAt: times.draftProposedAt,
    },
    {
      conversationId,
      role: "assistant",
      parts: [
        {
          type: "text",
          text: "Chamado registrado. Por ser crítico, já chamei o plantão: um analista assume esta conversa em instantes.",
        },
        { type: "ticket", code: ticket.code },
      ],
      status: "complete",
      createdAt: times.ticketCreatedAt,
    },
    {
      conversationId,
      role: "system",
      parts: [
        { type: "handoff", reason: "critical", outOfHours: false },
        { type: "event", kind: "transferred" },
      ],
      status: "complete",
      createdAt: times.ticketCreatedAt,
    },
  ];
  for (const message of messages) await ctx.db.insert("messages", message);
}
