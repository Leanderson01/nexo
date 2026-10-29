import type { NewTicket, TicketCode, TicketFieldChanges } from "./ticket";

// Ação proposta pelo agent que só é executada quando o funcionário confirma (§6.5).
// Cada proposta vira uma linha da tabela `pendingActions`; o id dessa linha é a
// chave de idempotência da escrita no serviço de chamados.
export type PendingAction =
  | { kind: "create_ticket"; ticket: NewTicket }
  | { kind: "update_ticket"; code: TicketCode; text: string; fieldChanges?: TicketFieldChanges }
  | { kind: "reopen_ticket"; code: TicketCode; reason: string };
