import type { TicketStatus } from "./enums";

const CLOSED_STATUSES: readonly TicketStatus[] = ["resolved", "closed"];
const REOPEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Aberto é qualquer status diferente de Resolvido e Fechado (§3.2). */
export function isOpen(status: TicketStatus): boolean {
  return !CLOSED_STATUSES.includes(status);
}

/** Resolvido há até 7 dias corridos pode ser reaberto (§3.2). */
export function canReopen(
  ticket: { status: TicketStatus; resolvedAt?: number },
  now: number,
): boolean {
  if (ticket.status !== "resolved" || ticket.resolvedAt === undefined) return false;
  return now - ticket.resolvedAt <= REOPEN_WINDOW_MS;
}
