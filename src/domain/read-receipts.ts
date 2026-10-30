import type { MessageReceiver, MessageRole, MessageStatus } from "./enums";

// Confirmação de leitura no estilo do WhatsApp (UX1). Cada mensagem tem um receptor:
//   - mensagem do funcionário: o agent ou o analista (gravado no envio, em `receiver`);
//   - resposta do agent ou do analista: o funcionário.
// Para cada receptor a conversa guarda duas marcas d'água, "chegou até" e "leu até": uma
// mensagem chegou (✓✓ cinza) se foi criada até a marca de entrega e foi lida (✓✓ azul) se foi
// criada até a marca de leitura. Sem marca, só está salva no servidor (✓). O reloginho é do
// cliente: a mensagem otimista que ainda não foi salva.
//
// O que é "chegou" e "leu" para cada receptor:
//   - agent: chegou quando o turno carrega o contexto com a mensagem; leu quando o ENTENDER
//     termina (convex/agent.ts, marcado pelo pipeline com o segredo do servidor);
//   - analista: chegou quando a fila de um console que pode atendê-la recebe a mensagem; leu
//     quando quem pode atender abre a conversa com a aba visível (`analystReadAt`, o mesmo das
//     não lidas, T12);
//   - funcionário: chegou quando o chat dele recebe a mensagem, aberto em qualquer conversa
//     (decisão 32); leu quando a conversa está aberta e a aba visível.

export type ReceiptStatus = "sending" | "sent" | "delivered" | "read";

/** As marcas d'água de um receptor; null quando ainda não chegou ou não leu nada. */
export interface ReceiptMarks {
  deliveredAt: number | null;
  readAt: number | null;
}

/** As marcas d'água da conversa, como ficam gravadas (campos opcionais). */
export interface ConversationReceiptMarks {
  agentDeliveredAt?: number;
  agentReadAt?: number;
  analystDeliveredAt?: number;
  analystReadAt?: number;
  employeeDeliveredAt?: number;
  employeeReadAt?: number;
}

/** O que a mensagem precisa para saber o próprio ✓. */
export interface ReceiptMessage {
  role: MessageRole;
  status: MessageStatus;
  createdAt: number;
  /** Só nas mensagens do funcionário; ausente nas antigas, de antes da confirmação. */
  receiver?: MessageReceiver;
}

/** O ✓ de uma mensagem já salva, comparando o instante dela com as marcas do receptor. */
export function receiptStatus(
  createdAt: number,
  marks: ReceiptMarks,
): Exclude<ReceiptStatus, "sending"> {
  if (marks.readAt !== null && createdAt <= marks.readAt) return "read";
  if (marks.deliveredAt !== null && createdAt <= marks.deliveredAt) return "delivered";
  return "sent";
}

/**
 * As marcas do receptor da mensagem, ou null quando ela não leva ✓: eventos do sistema,
 * resposta do agent ainda em streaming e mensagens antigas do funcionário sem receptor.
 */
export function receiverMarks(
  message: ReceiptMessage,
  conversation: ConversationReceiptMarks,
): ReceiptMarks | null {
  switch (message.role) {
    case "user":
      if (message.receiver === "agent") {
        return marks(conversation.agentDeliveredAt, conversation.agentReadAt);
      }
      if (message.receiver === "analyst") {
        return marks(conversation.analystDeliveredAt, conversation.analystReadAt);
      }
      return null;
    case "assistant":
    case "analyst":
      if (message.status === "streaming") return null;
      return marks(conversation.employeeDeliveredAt, conversation.employeeReadAt);
    case "system":
      return null;
  }
}

/**
 * O ✓ de uma mensagem salva, ou null quando ela não leva confirmação. O tipo inclui o
 * reloginho (`sending`) porque as cópias otimistas do cliente usam o mesmo campo; o servidor
 * nunca o devolve.
 */
export function messageReceipt(
  message: ReceiptMessage,
  conversation: ConversationReceiptMarks,
): ReceiptStatus | null {
  const found = receiverMarks(message, conversation);
  return found ? receiptStatus(message.createdAt, found) : null;
}

/**
 * A marca nova depois de uma confirmação até `upTo`, ou null quando não muda nada (a marca
 * só anda para a frente: confirmar de novo, ou algo mais antigo, não escreve). Nunca passa de
 * `now`, para o cliente não confirmar o que ainda não existe.
 */
export function advanceMark(current: number | undefined, upTo: number, now: number): number | null {
  const next = Math.min(upTo, now);
  if (current !== undefined && next <= current) return null;
  return next;
}

function marks(deliveredAt: number | undefined, readAt: number | undefined): ReceiptMarks {
  return { deliveredAt: deliveredAt ?? null, readAt: readAt ?? null };
}
