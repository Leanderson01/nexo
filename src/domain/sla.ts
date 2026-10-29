import { addBusinessHours } from "./business-hours";
import type { Priority, TicketStatus } from "./enums";
import { PRIORITY_DEADLINES } from "./priority";
import type { Ticket } from "./ticket";
import { isOpen } from "./ticket-rules";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** O que as funções de prazo precisam do chamado. `Ticket` e `TicketSummary` servem. */
export type SlaTicket = Pick<Ticket, "priority" | "status" | "lastActivityAt">;

/**
 * Prazo do chamado a partir da criação ou da última atividade do suporte (§3.6).
 * Crítica conta 1 hora corrida; as demais, horas úteis.
 */
export function computeDueAt(priority: Priority, lastActivityAt: number): number {
  const deadline = PRIORITY_DEADLINES[priority];
  if (deadline.clock === "calendar") return lastActivityAt + deadline.hours * HOUR_MS;
  return addBusinessHours(lastActivityAt, deadline.hours);
}

/** Com o funcionário ("Aguardando você"), o prazo fica pausado (§3.6). */
function isPaused(status: TicketStatus): boolean {
  return status === "awaiting_employee";
}

/** Vencido: passou do prazo e não está Resolvido, Fechado nem Aguardando você (§3.6). */
export function isOverdue(ticket: SlaTicket, now: number): boolean {
  if (!isOpen(ticket.status) || isPaused(ticket.status)) return false;
  return now > computeDueAt(ticket.priority, ticket.lastActivityAt);
}

/**
 * Milissegundos corridos até o prazo; negativo quando já passou.
 * Não olha o status: para saber se conta, use `isOverdue` ou `getSlaState`.
 */
export function timeUntilDue(ticket: SlaTicket, now: number): number {
  return computeDueAt(ticket.priority, ticket.lastActivityAt) - now;
}

export type SlaState = "closed" | "paused" | "overdue" | "due_soon" | "on_time";

/** Abaixo disto o selo deixa de dizer "no prazo" e mostra quanto falta. */
export const DUE_SOON_THRESHOLD_MS = DAY_MS;

/** Estado do selo; a UI usa para escolher a cor. */
export function getSlaState(ticket: SlaTicket, now: number): SlaState {
  if (!isOpen(ticket.status)) return "closed";
  if (isPaused(ticket.status)) return "paused";
  const remaining = timeUntilDue(ticket, now);
  if (remaining < 0) return "overdue";
  if (remaining < DUE_SOON_THRESHOLD_MS) return "due_soon";
  return "on_time";
}

/**
 * Texto do selo de prazo (§3.6). Limiares:
 * - Resolvido ou Fechado: "encerrado".
 * - Aguardando você: "prazo pausado".
 * - Faltando 24h corridas ou mais: "no prazo".
 * - Faltando menos de 24h: "vence em 45 min" ou "vence em 2h".
 * - Vencido: "vencido há 10 min", "vencido há 3h" ou "vencido há 2 dias".
 * As durações são arredondadas para baixo (2h50 vira "2h"), com mínimo de 1 min.
 */
export function formatSlaBadge(ticket: SlaTicket, now: number): string {
  const state = getSlaState(ticket, now);
  const remaining = timeUntilDue(ticket, now);

  switch (state) {
    case "closed":
      return "encerrado";
    case "paused":
      return "prazo pausado";
    case "on_time":
      return "no prazo";
    case "due_soon":
      return `vence em ${formatDuration(remaining)}`;
    case "overdue":
      return `vencido há ${formatDuration(-remaining)}`;
  }
}

/** "45 min", "2h", "1 dia", "3 dias". */
function formatDuration(durationMs: number): string {
  if (durationMs < HOUR_MS) {
    return `${Math.max(1, Math.floor(durationMs / MINUTE_MS))} min`;
  }
  if (durationMs < DAY_MS) {
    return `${Math.floor(durationMs / HOUR_MS)}h`;
  }
  const days = Math.floor(durationMs / DAY_MS);
  return days === 1 ? "1 dia" : `${days} dias`;
}
