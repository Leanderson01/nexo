import type { ConversationStatus } from "@/domain/enums";

// Estados do campo de mensagem (§7.2), decididos num lugar só. A ordem importa:
// encerrada vence tudo, depois o limite, depois o turno em andamento.

export type ComposerState =
  /** Livre, o agent responde. */
  | "ready"
  /** Bloqueado com indicador enquanto o agent responde (`agentBusy`). */
  | "agent_busy"
  /** Livre, com o aviso "Suas mensagens vão para o analista". */
  | "analyst"
  /** Bloqueado; oferece "Nova conversa (com resumo desta)" e "Falar com um analista". */
  | "limit_reached"
  /** Bloqueado; oferece "Nova conversa". */
  | "closed";

export interface ComposerConversation {
  status: ConversationStatus;
  agentBusy: boolean;
  employeeMessageCount: number;
  messageLimit: number;
}

export function getComposerState(conversation: ComposerConversation): ComposerState {
  if (conversation.status === "closed") return "closed";
  if (conversation.employeeMessageCount >= conversation.messageLimit) return "limit_reached";
  if (conversation.agentBusy) return "agent_busy";
  if (conversation.status === "waiting_analyst" || conversation.status === "with_analyst") {
    return "analyst";
  }
  return "ready";
}

export function canType(state: ComposerState): boolean {
  return state === "ready" || state === "analyst";
}

/** A partir de quantas mensagens o contador ganha destaque (§7.2: "a partir de 20"). */
export const COUNTER_WARNING_FROM = 20;

export type CounterTone = "normal" | "warning" | "limit";

export function getCounterTone(count: number, limit: number): CounterTone {
  if (count >= limit) return "limit";
  if (count >= COUNTER_WARNING_FROM) return "warning";
  return "normal";
}
