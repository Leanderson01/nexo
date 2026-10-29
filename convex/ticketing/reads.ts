import { v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../_generated/server";
import { vTicketCategory } from "../lib/validators";
import type { GatewayErrorKind } from "../../src/domain/enums";
import { err, ok, type Result } from "../../src/domain/result";
import type {
  SimilarityQuery,
  Ticket,
  TicketDetail,
  TicketFilter,
  TicketSummary,
  TicketUpdate,
} from "../../src/domain/ticket";
import { findDuplicateCandidates, isOpen } from "../../src/domain/ticket-rules";
import { rankBySimilarity } from "./similarity";

// Leituras e mapeamentos do serviço de chamados, usados pela API HTTP (as internal
// queries abaixo), pelas mutations de `service.ts` e pelas queries reativas da UI.

/**
 * Erro esperado do serviço. Mesmo formato do `GatewayError` do agent, mas definido aqui:
 * o bundler do Convex não resolve o alias `@/` de `src/agent/gateways/gateway-error.ts`.
 */
export interface ServiceError {
  kind: GatewayErrorKind;
  message: string;
}

/** A mesma mensagem para chamado inexistente e alheio: não confirma que o chamado existe. */
export const TICKET_NOT_FOUND_MESSAGE = "Chamado não encontrado entre os seus.";

export const ticketNotFound: ServiceError = {
  kind: "not_found",
  message: TICKET_NOT_FOUND_MESSAGE,
};

// ---------- Mapeamento doc → domínio ----------

export function toTicket(doc: Doc<"tickets">): Ticket {
  return {
    code: doc.code,
    kind: doc.kind,
    category: doc.category,
    priority: doc.priority,
    priorityReason: doc.priorityReason,
    prioritySignals: doc.prioritySignals,
    status: doc.status,
    title: doc.title,
    description: doc.description,
    affected: doc.affected,
    createdAt: doc.createdAt,
    lastActivityAt: doc.lastActivityAt,
    ...(doc.resolvedAt !== undefined && { resolvedAt: doc.resolvedAt }),
    ...(doc.reopenedFrom !== undefined && { reopenedFrom: doc.reopenedFrom }),
  };
}

export function toSummary(doc: Doc<"tickets">): TicketSummary {
  return {
    code: doc.code,
    kind: doc.kind,
    category: doc.category,
    priority: doc.priority,
    status: doc.status,
    title: doc.title,
    createdAt: doc.createdAt,
    lastActivityAt: doc.lastActivityAt,
    ...(doc.resolvedAt !== undefined && { resolvedAt: doc.resolvedAt }),
  };
}

function toUpdate(doc: Doc<"ticketUpdates">): TicketUpdate {
  return {
    authorType: doc.authorType,
    ...(doc.authorName !== undefined && { authorName: doc.authorName }),
    text: doc.text,
    ...(doc.fieldChanges !== undefined && { fieldChanges: doc.fieldChanges }),
    createdAt: doc.createdAt,
  };
}

/** O chamado com o histórico de atualizações, da mais antiga para a mais recente. */
export async function loadDetail(ctx: QueryCtx, doc: Doc<"tickets">): Promise<TicketDetail> {
  const updates = await ctx.db
    .query("ticketUpdates")
    .withIndex("by_ticket", (q) => q.eq("ticketId", doc._id))
    .collect();
  updates.sort((a, b) => a.createdAt - b.createdAt);
  return { ...toTicket(doc), updates: updates.map(toUpdate) };
}

// ---------- Leituras com guarda de dono ----------

/** O chamado, se existe e é do funcionário. Alheio e inexistente devolvem o mesmo null. */
export async function findOwnedTicket(
  ctx: QueryCtx,
  employeeId: Id<"people">,
  code: string,
): Promise<Doc<"tickets"> | null> {
  const ticket = await ctx.db
    .query("tickets")
    .withIndex("by_code", (q) => q.eq("code", code))
    .unique();
  if (!ticket || ticket.ownerId !== employeeId) return null;
  return ticket;
}

/** Chamados do funcionário, com a atividade mais recente primeiro. */
export async function listOwnedTickets(
  ctx: QueryCtx,
  employeeId: Id<"people">,
  filter: TicketFilter = {},
): Promise<Doc<"tickets">[]> {
  const tickets = await ctx.db
    .query("tickets")
    .withIndex("by_owner_status", (q) => q.eq("ownerId", employeeId))
    .collect();
  const visible = filter.onlyOpen ? tickets.filter((ticket) => isOpen(ticket.status)) : tickets;
  return visible.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}

export async function getOwnedDetail(
  ctx: QueryCtx,
  employeeId: Id<"people">,
  code: string,
): Promise<Result<TicketDetail, ServiceError>> {
  const ticket = await findOwnedTicket(ctx, employeeId, code);
  if (!ticket) return err(ticketNotFound);
  return ok(await loadDetail(ctx, ticket));
}

/** Candidatos a duplicidade: só do funcionário, dentro da janela do domínio, os mais parecidos. */
export async function findSimilarOwned(
  ctx: QueryCtx,
  employeeId: Id<"people">,
  query: SimilarityQuery,
  now: number,
): Promise<TicketSummary[]> {
  const tickets = await listOwnedTickets(ctx, employeeId);
  const inWindow = findDuplicateCandidates(tickets, now);
  return rankBySimilarity(query, inWindow).map(toSummary);
}

// ---------- Internal queries da API HTTP ----------

/** O id do cabeçalho `X-Employee-Id`, se for de um funcionário cadastrado. */
export const resolveEmployee = internalQuery({
  args: { employeeId: v.string() },
  handler: async (ctx, args): Promise<Id<"people"> | null> => {
    const id = ctx.db.normalizeId("people", args.employeeId);
    if (!id) return null;
    const person = await ctx.db.get(id);
    return person?.role === "employee" ? person._id : null;
  },
});

export const listMine = internalQuery({
  args: { employeeId: v.id("people"), onlyOpen: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<Result<TicketSummary[], ServiceError>> => {
    const tickets = await listOwnedTickets(ctx, args.employeeId, { onlyOpen: args.onlyOpen });
    return ok(tickets.map(toSummary));
  },
});

export const getMine = internalQuery({
  args: { employeeId: v.id("people"), code: v.string() },
  handler: (ctx, args) => getOwnedDetail(ctx, args.employeeId, args.code),
});

export const findSimilar = internalQuery({
  args: {
    employeeId: v.id("people"),
    description: v.string(),
    category: v.union(vTicketCategory, v.null()),
  },
  handler: async (ctx, args): Promise<Result<TicketSummary[], ServiceError>> => {
    const query = { description: args.description, category: args.category };
    return ok(await findSimilarOwned(ctx, args.employeeId, query, Date.now()));
  },
});
