import type { TicketStatus } from "@/domain/enums";
import { TICKET_STATUS_LABELS } from "@/domain/labels";

// Textos das notificações em tempo real (§11.6). Puros, para testar sem a tela.

/** O chamado do evento `ticket_updated`: o código e, se a atualização mudou o status, o novo. */
export interface UpdatedTicket {
  code?: string;
  status?: TicketStatus;
}

/**
 * Linha do evento no chat e título do toast: "O chamado INC-20311 foi atualizado: Em
 * andamento"; sem mudança de status, "O chamado INC-20311 foi atualizado pelo suporte".
 */
export function ticketUpdatedText({ code, status }: UpdatedTicket): string {
  const ticket = code ? `O chamado ${code}` : "Um chamado seu";
  return status
    ? `${ticket} foi atualizado: ${TICKET_STATUS_LABELS[status]}`
    : `${ticket} foi atualizado pelo suporte`;
}
