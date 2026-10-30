import type { HandoffReason } from "./enums";
import type { TicketCode } from "./ticket";

export interface Handoff {
  reason: HandoffReason;
  /** Resumo do caso para o analista. */
  summary: string;
  ticketCode?: TicketCode;
  at: number;
}

/**
 * Oferta de analista feita pelo agent e ainda sem resposta (decisão 22). Hoje só a
 * OverdueTicketPolicy oferece; se o funcionário aceitar no turno seguinte, a transferência sai
 * com este motivo.
 */
export interface HandoffOffer {
  reason: HandoffReason;
  ticketCode?: TicketCode;
}
