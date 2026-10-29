import type { ConversationEvent, ConversationStatus } from "./enums";
import { CONVERSATION_STATUS_LABELS } from "./labels";
import { err, ok, type Result } from "./result";

// Máquina de estados da conversa (§5.9), com as transições num lugar só.
//
//   agent ──transfer──▶ waiting_analyst ──assign──▶ with_analyst
//     ▲                       │                          │
//     └───────return──────────┴──────────return──────────┘
//   qualquer estado não encerrado ──close──▶ closed
//
// Desvio da §5.9 (decisão 11): `return` também vale a partir de `waiting_analyst`,
// para o analista devolver ao agent sem precisar assumir antes.

export type ConversationTransition = "transfer" | "assign" | "return" | "close";

const TRANSITIONS: Record<
  ConversationStatus,
  Partial<Record<ConversationTransition, ConversationStatus>>
> = {
  agent: { transfer: "waiting_analyst", close: "closed" },
  waiting_analyst: { assign: "with_analyst", return: "agent", close: "closed" },
  with_analyst: { return: "agent", close: "closed" },
  closed: {},
};

/** Evento `system` que cada transição grava no histórico (§5.9). */
export const TRANSITION_EVENTS: Record<ConversationTransition, ConversationEvent> = {
  transfer: "transferred",
  assign: "assigned",
  return: "returned_to_agent",
  close: "closed",
};

const TRANSITION_LABELS: Record<ConversationTransition, string> = {
  transfer: "transferir para analista",
  assign: "assumir o atendimento",
  return: "devolver ao agent",
  close: "encerrar",
};

/** Próximo estado, ou erro em português quando a transição não é permitida. */
export function transition(
  status: ConversationStatus,
  event: ConversationTransition,
): Result<ConversationStatus, string> {
  const next = TRANSITIONS[status][event];
  if (next === undefined) {
    const from = CONVERSATION_STATUS_LABELS[status];
    return err(`Não é possível ${TRANSITION_LABELS[event]} a partir de "${from}".`);
  }
  return ok(next);
}

export function canTransition(status: ConversationStatus, event: ConversationTransition): boolean {
  return TRANSITIONS[status][event] !== undefined;
}
