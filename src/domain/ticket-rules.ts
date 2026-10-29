import type { TicketStatus } from "./enums";

const DAY_MS = 24 * 60 * 60 * 1000;
const CLOSED_STATUSES: readonly TicketStatus[] = ["resolved", "closed"];
const REOPEN_WINDOW_MS = 7 * DAY_MS;
/** Até quando um chamado encerrado ainda entra na busca de duplicidade (decisão 15). */
const DUPLICATE_WINDOW_MS = 30 * DAY_MS;

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

/** O que a regra de duplicidade precisa do chamado. `Ticket` e `TicketSummary` servem. */
export interface DuplicateCandidate {
  status: TicketStatus;
  lastActivityAt: number;
  resolvedAt?: number;
}

/**
 * Chamados parecidos que ainda importam: os abertos e os encerrados há até 30 dias.
 * O gateway `findSimilar` já devolve só esses, mas a janela é regra de domínio.
 * Sem `resolvedAt`, um chamado encerrado usa a última atividade como data de encerramento.
 */
export function findDuplicateCandidates<T extends DuplicateCandidate>(
  tickets: readonly T[],
  now: number,
): T[] {
  return tickets.filter((ticket) => {
    if (isOpen(ticket.status)) return true;
    const closedAt = ticket.resolvedAt ?? ticket.lastActivityAt;
    return now - closedAt <= DUPLICATE_WINDOW_MS;
  });
}

export type DuplicateAction = "update" | "reopen" | "new_with_reference";

/**
 * O que propor quando o funcionário descreve um problema que já tem chamado (§3.2):
 * aberto → atualizar; resolvido há até 7 dias → reabrir;
 * resolvido há mais tempo ou fechado → novo chamado com referência ao antigo.
 */
export function suggestDuplicateAction(ticket: DuplicateCandidate, now: number): DuplicateAction {
  if (isOpen(ticket.status)) return "update";
  if (canReopen(ticket, now)) return "reopen";
  return "new_with_reference";
}
