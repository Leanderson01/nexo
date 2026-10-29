import type { ConversationEvent, HandoffReason } from "./enums";
import type { TicketCode } from "./ticket";

// Blocos de uma mensagem do chat (§5.11). A UI renderiza um componente por `type`.
// Ids dentro das partes são strings: são referências, não chaves do banco.
export type MessagePart =
  | { type: "text"; text: string }
  | { type: "article"; slug: string; title: string; excerpt: string }
  /** A UI busca o card do chamado reativamente pelo código. */
  | { type: "ticket"; code: TicketCode }
  | { type: "ticketSelector"; codes: TicketCode[]; prompt: string }
  /** Card de rascunho; o estado (pendente, confirmado, cancelado) vem da tabela `pendingActions`. */
  | { type: "draft"; pendingActionId: string }
  | { type: "quickReplies"; options: { label: string; value: string }[] }
  | { type: "handoff"; reason: HandoffReason; outOfHours: boolean }
  | { type: "event"; kind: ConversationEvent; actorName?: string }
  | { type: "error"; message: string; retryable: boolean };

export type MessagePartType = MessagePart["type"];
