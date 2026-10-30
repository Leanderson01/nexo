import type { CreateConversationError } from "../../../convex/conversations";
import type { SendUserMessageError } from "../../../convex/messages";

// Erros esperados das rotas do chat: o código vem do `Result` da mutation; aqui ficam o
// status HTTP e o texto que a tela mostra. A mesma tabela serve à rota e ao cliente.

export type ChatApiErrorCode =
  | SendUserMessageError
  | CreateConversationError
  | "unauthorized"
  | "forbidden"
  | "invalid_body"
  | "unavailable";

export interface ChatApiErrorBody {
  error: { code: ChatApiErrorCode; message: string };
}

export const CHAT_API_ERRORS: Record<ChatApiErrorCode, { status: number; message: string }> = {
  not_found: { status: 404, message: "Não encontramos essa conversa." },
  closed: { status: 409, message: "Esta conversa foi encerrada. Comece uma nova conversa." },
  busy: { status: 409, message: "Espere o Nexo Assist terminar de responder." },
  limit_reached: {
    status: 409,
    message: "Esta conversa chegou ao limite de mensagens. Comece uma nova conversa.",
  },
  empty: { status: 400, message: "Escreva alguma coisa antes de enviar." },
  conversation_limit_reached: {
    status: 429,
    message:
      "Você chegou ao limite de conversas novas de hoje. Continue uma conversa do histórico ou volte amanhã.",
  },
  invalid_body: { status: 400, message: "Não entendemos o pedido. Recarregue a página." },
  unauthorized: { status: 401, message: "Sua sessão expirou. Entre novamente." },
  forbidden: { status: 403, message: "O chat é só para funcionários." },
  unavailable: {
    status: 503,
    message: "Não conseguimos falar com o servidor agora. Tente de novo em instantes.",
  },
};

/**
 * Recusas por limite ou pelo estado da conversa: nada quebrou, tentar de novo agora não muda
 * nada. O aviso fica âmbar e sem "Tentar de novo"; os demais erros ficam vermelhos, com ele.
 */
const NOT_RETRYABLE: readonly ChatApiErrorCode[] = [
  "conversation_limit_reached",
  "limit_reached",
  "closed",
  "busy",
  "forbidden",
];

export function isRetryableChatError(code: ChatApiErrorCode): boolean {
  return !NOT_RETRYABLE.includes(code);
}

export function chatApiError(code: ChatApiErrorCode): Response {
  const { status, message } = CHAT_API_ERRORS[code];
  const body: ChatApiErrorBody = { error: { code, message } };
  return Response.json(body, { status });
}
