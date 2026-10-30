import type { MessageRole } from "@/domain/enums";
import type { ReceiptStatus } from "@/domain/read-receipts";

// O que o chat do funcionário confirma (UX1): as respostas do agent e do analista. Regras
// puras; a confirmação em si está em `useEmployeeReceiptAcks`.

export interface AckMessage {
  role: MessageRole;
  createdAt: number;
  receipt: ReceiptStatus | null;
}

export type EmployeeAck = "delivered" | "read";

export interface AckTarget {
  /** O instante da resposta mais recente: confirmar vale para ela e as anteriores. */
  upTo: number;
  receipt: ReceiptStatus;
}

/** A resposta mais recente que leva ✓ (o streaming ainda não leva), ou null. */
export function latestIncoming(messages: AckMessage[]): AckTarget | null {
  const incoming = messages.findLast(
    (message) => message.role !== "user" && message.receipt !== null,
  );
  if (!incoming || incoming.receipt === null) return null;
  return { upTo: incoming.createdAt, receipt: incoming.receipt };
}

/**
 * Qual confirmação mandar: "leu" com a aba visível (a conversa está aberta na tela) e "chegou"
 * com ela escondida. Nada quando a resposta já está nesse ponto.
 */
export function ackToSend(target: AckTarget, pageVisible: boolean): EmployeeAck | null {
  if (pageVisible) return target.receipt === "read" ? null : "read";
  return target.receipt === "sent" ? "delivered" : null;
}
