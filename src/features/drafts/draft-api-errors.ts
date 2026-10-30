import type { EditDraftError } from "../../../convex/pendingActions";
import type { StartRetryError } from "../../../convex/retry";

// Erros esperados das rotas do rascunho e do "Tentar de novo" (§6.5, §9): status HTTP e o
// texto que a tela mostra. Mesmo formato das rotas do chat: `{ error: { code, message } }`.

export type DraftApiErrorCode =
  | EditDraftError
  | StartRetryError
  | "unauthorized"
  | "invalid_body"
  /** O legado não respondeu depois do retry; a conversa já mostra o erro com "Tentar de novo". */
  | "ticketing_unavailable"
  /** O serviço de chamados recusou (ex.: prazo de reabertura passou); a conversa explica. */
  | "ticketing_rejected"
  | "unavailable";

export interface DraftApiErrorBody {
  error: { code: DraftApiErrorCode; message: string };
}

export const DRAFT_API_ERRORS: Record<DraftApiErrorCode, { status: number; message: string }> = {
  unauthorized: { status: 401, message: "Sua sessão expirou. Entre novamente." },
  invalid_body: { status: 400, message: "Não entendemos o pedido. Recarregue a página." },
  not_found: { status: 404, message: "Não encontramos esse rascunho nesta conversa." },
  not_pending: { status: 409, message: "Este rascunho já foi confirmado, cancelado ou trocado." },
  closed: { status: 409, message: "Esta conversa foi encerrada. Comece uma nova conversa." },
  busy: { status: 409, message: "Espere o Nexo Assist terminar de responder." },
  invalid_draft: {
    status: 422,
    message: "Preencha título, descrição e quem é afetado (sem passar do tamanho).",
  },
  not_agent: { status: 409, message: "A conversa está com um analista agora." },
  nothing_to_retry: { status: 409, message: "Não há nada para tentar de novo." },
  daily_limit_reached: {
    status: 429,
    message:
      "O Nexo Assist atingiu o limite de uso de hoje. Você pode falar com um analista ou tentar amanhã.",
  },
  ticketing_unavailable: {
    status: 503,
    message: "O sistema de chamados está instável. O rascunho continua aqui.",
  },
  ticketing_rejected: { status: 409, message: "O sistema de chamados recusou o pedido." },
  unavailable: {
    status: 503,
    message: "Não conseguimos falar com o servidor agora. Tente de novo em instantes.",
  },
};

/** Erros que a conversa já explica numa mensagem do assistente: a tela não repete o aviso. */
export const ERRORS_SHOWN_IN_CONVERSATION: readonly DraftApiErrorCode[] = [
  "ticketing_unavailable",
  "ticketing_rejected",
];

export type DraftNoticeTone = "error" | "warning";

/**
 * Recusas por limite ou pelo estado do rascunho e da conversa: nada quebrou, o aviso é âmbar.
 * Os demais (servidor fora, rascunho inválido, não encontrado) são erro, em vermelho.
 */
const WARNING_CODES: readonly DraftApiErrorCode[] = [
  "not_pending",
  "closed",
  "busy",
  "not_agent",
  "nothing_to_retry",
  "daily_limit_reached",
];

export function draftNoticeTone(code: DraftApiErrorCode): DraftNoticeTone {
  return WARNING_CODES.includes(code) ? "warning" : "error";
}

export function draftApiError(code: DraftApiErrorCode): Response {
  const { status, message } = DRAFT_API_ERRORS[code];
  const body: DraftApiErrorBody = { error: { code, message } };
  return Response.json(body, { status });
}
