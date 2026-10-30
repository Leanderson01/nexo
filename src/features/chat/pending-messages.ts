import type { MessageReceiver } from "@/domain/enums";

// Mensagens otimistas do chat (UX1). O envio passa pela rota (que salva, mascara e dispara o
// turno), então o `withOptimisticUpdate` do Convex não alcança: a mensagem fica aqui, no
// cliente, desde o clique até a salva chegar pela query. Regras puras; o estado vive em
// `useSendMessage`.

export interface SendFailure {
  message: string;
  /** false nos limites (ex.: conversas novas do dia): o aviso fica sem "Tentar de novo". */
  retryable: boolean;
}

export interface PendingMessage {
  /** Id do cliente, só para a lista da tela. */
  clientId: string;
  /** A conversa da tela no envio (null na conversa nova). */
  origin: string | null;
  /** O texto como foi digitado; a versão salva (mascarada) toma o lugar dele. */
  text: string;
  receiver: MessageReceiver;
  sentAt: number;
  /**
   * Posição esperada entre as mensagens do funcionário: quando a query já tem mais do que isso,
   * a salva chegou, mesmo que a resposta da rota ainda não.
   */
  expectedIndex: number;
  /** Id da mensagem salva, que a rota devolve. */
  savedMessageId: string | null;
  failure: SendFailure | null;
}

/** O mínimo das mensagens da query para casar com as pendentes. */
export interface SavedMessage {
  _id: string;
  role: string;
}

/**
 * Acrescenta a mensagem recém-enviada. As que já chegaram saem da lista aqui, para não
 * contarem na posição da nova.
 */
export function addPending(
  pending: PendingMessage[],
  message: Pick<PendingMessage, "clientId" | "origin" | "text" | "receiver" | "sentAt">,
  saved: SavedMessage[],
): PendingMessage[] {
  const current = pending.filter(
    (item) => item.origin !== message.origin || !hasArrived(item, saved),
  );
  const inFlight = current.filter(
    (item) => item.origin === message.origin && item.failure === null,
  ).length;
  const savedUserMessages = saved.filter((item) => item.role === "user").length;
  return [
    ...current,
    {
      ...message,
      expectedIndex: savedUserMessages + inFlight,
      savedMessageId: null,
      failure: null,
    },
  ];
}

export function markSaved(
  pending: PendingMessage[],
  clientId: string,
  savedMessageId: string,
): PendingMessage[] {
  return pending.map((item) => (item.clientId === clientId ? { ...item, savedMessageId } : item));
}

export function markFailed(
  pending: PendingMessage[],
  clientId: string,
  failure: SendFailure,
): PendingMessage[] {
  return pending.map((item) => (item.clientId === clientId ? { ...item, failure } : item));
}

export function removePending(pending: PendingMessage[], clientId: string): PendingMessage[] {
  return pending.filter((item) => item.clientId !== clientId);
}

/** A salva já está na query: pelo id que a rota devolveu ou pela posição. */
export function hasArrived(item: PendingMessage, saved: SavedMessage[]): boolean {
  if (item.failure) return false;
  if (item.savedMessageId && saved.some((message) => message._id === item.savedMessageId)) {
    return true;
  }
  const savedUserMessages = saved.filter((message) => message.role === "user").length;
  return savedUserMessages > item.expectedIndex;
}

/** As pendentes que a tela mostra: as da conversa aberta que ainda não chegaram. */
export function visiblePending(
  pending: PendingMessage[],
  origin: string | null,
  saved: SavedMessage[],
): PendingMessage[] {
  return pending.filter((item) => item.origin === origin && !hasArrived(item, saved));
}

/** Há mensagem a caminho do agent: o "digitando…" aparece e o campo espera, como no turno. */
export function isWaitingForAgent(visible: PendingMessage[]): boolean {
  return visible.some((item) => item.receiver === "agent" && item.failure === null);
}

/** Quantas estão a caminho: entram no contador "N/30" antes de a salva chegar. */
export function countInFlight(visible: PendingMessage[]): number {
  return visible.filter((item) => item.failure === null).length;
}
