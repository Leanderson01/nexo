import type { HandoffReason } from "./enums";
import type { TicketCode } from "./ticket";

export interface Handoff {
  reason: HandoffReason;
  /** Resumo do caso para o analista. */
  summary: string;
  ticketCode?: TicketCode;
  at: number;
}
