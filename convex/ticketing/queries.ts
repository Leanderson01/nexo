import { v } from "convex/values";

import { query } from "../_generated/server";
import { requireAnalyst, requireEmployee } from "../lib/guards";
import type { TicketDetail, TicketSummary } from "../../src/domain/ticket";
import { findOwnedTicket, listOwnedTickets, loadDetail, toSummary } from "./reads";

// Leituras reativas da UI (§5.6 b). Devolvem dados crus: prazo e selo de SLA são
// calculados na tela com src/domain/sla.ts.

/** Chamados do funcionário logado. */
export const listMine = query({
  args: { onlyOpen: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<TicketSummary[]> => {
    const employee = await requireEmployee(ctx);
    const tickets = await listOwnedTickets(ctx, employee._id, { onlyOpen: args.onlyOpen });
    return tickets.map(toSummary);
  },
});

/** Detalhe de um chamado do funcionário logado; null tanto para alheio quanto para inexistente. */
export const getMine = query({
  args: { code: v.string() },
  handler: async (ctx, args): Promise<TicketDetail | null> => {
    const employee = await requireEmployee(ctx);
    const ticket = await findOwnedTicket(ctx, employee._id, args.code);
    return ticket ? await loadDetail(ctx, ticket) : null;
  },
});

/** Chamados de um funcionário, para o painel lateral do console do analista. */
export const employeeTickets = query({
  args: { employeeId: v.id("people") },
  handler: async (ctx, args): Promise<TicketSummary[]> => {
    await requireAnalyst(ctx);
    const tickets = await listOwnedTickets(ctx, args.employeeId);
    return tickets.map(toSummary);
  },
});
