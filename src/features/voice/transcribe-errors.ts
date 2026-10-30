// Erros esperados de `POST /api/transcribe`: status HTTP e o texto que a tela mostra.
// A mesma tabela serve à rota e ao gravador (que mostra `message` como veio).

export type TranscribeErrorCode =
  | "unauthorized"
  | "forbidden"
  | "unsupported_type"
  | "empty_audio"
  | "too_long"
  | "not_understood"
  | "provider_failed"
  | "unavailable";

export interface TranscribeErrorBody {
  error: { code: TranscribeErrorCode; message: string };
}

/** A frase da §11.1 para quando o áudio não vira texto. */
export const NOT_UNDERSTOOD_MESSAGE = "Não consegui entender o áudio, tente de novo ou digite.";

export const TRANSCRIBE_ERRORS: Record<TranscribeErrorCode, { status: number; message: string }> = {
  unauthorized: { status: 401, message: "Sua sessão expirou. Entre novamente." },
  forbidden: { status: 403, message: "A entrada por voz é só para funcionários." },
  unsupported_type: {
    status: 415,
    message: "Este formato de áudio não é aceito. Tente gravar de novo ou digite.",
  },
  empty_audio: { status: 400, message: NOT_UNDERSTOOD_MESSAGE },
  too_long: {
    status: 413,
    message: "O áudio passou do tempo máximo. Grave um trecho menor ou digite.",
  },
  not_understood: { status: 422, message: NOT_UNDERSTOOD_MESSAGE },
  provider_failed: {
    status: 502,
    message: "Não consegui transcrever agora. Tente de novo em instantes ou digite.",
  },
  unavailable: {
    status: 503,
    message: "A entrada por voz está indisponível agora. Digite sua mensagem.",
  },
};

export function transcribeApiError(code: TranscribeErrorCode): Response {
  const { status, message } = TRANSCRIBE_ERRORS[code];
  const body: TranscribeErrorBody = { error: { code, message } };
  return Response.json(body, { status });
}
