import { estimateTranscriptionCostUsd } from "@/agent/llm/models";
import type { PersonRole } from "@/domain/enums";
import { maxAudioBytes, toAcceptedAudioType } from "@/features/voice/audio-format";
import { tidyTranscript } from "@/features/voice/punctuation";
import { transcribeApiError } from "@/features/voice/transcribe-errors";
import type { Transcriber } from "./transcriber";

// Corpo de `POST /api/transcribe`, separado do `route.ts` para ser testado sem o Next:
// a sessão e o provedor entram como dependências.
//
// Contrato:
// - Corpo: o áudio cru (binário), com o tipo no `Content-Type` ("audio/webm;codecs=opus",
//   "audio/ogg", "audio/mp4", "audio/wav"...). Sem multipart: é um arquivo só, e o gravador
//   manda o Blob direto no `fetch`.
// - 200: `{ text, durationSeconds, estimatedCostUsd }`, com o texto já pontuado.
// - Erro: `{ error: { code, message } }` (tabela em `transcribe-errors.ts`).
//
// Limite de duração (§12.3), conferido duas vezes no servidor:
// 1. antes do provedor, pelo tamanho: acima de `maxAudioBytes(maxSeconds)` nem chamamos o Whisper;
// 2. depois, pela duração que o Whisper mede: acima do limite, recusamos e não devolvemos o texto.

export interface TranscribeDeps {
  /** Papel da pessoa logada, ou null sem sessão. */
  findCallerRole: () => Promise<PersonRole | null>;
  transcribe: Transcriber;
  /** Modelo de transcrição, para o custo. */
  model: string;
  /** `TRANSCRIPTION_MAX_SECONDS`. */
  maxSeconds: number;
  /** Limite diário de transcrição (§12.3): false quando o dia já esgotou. */
  isWithinDailyLimit: () => Promise<boolean>;
  /** Soma a transcrição ao uso do dia (segundos e quantidade). */
  recordUsage: (seconds: number) => Promise<void>;
}

export interface TranscribeResponse {
  text: string;
  durationSeconds: number;
  estimatedCostUsd: number;
}

/** O gravador corta em 60 s, mas o arquivo pode sair um pouco mais longo. */
const DURATION_TOLERANCE_SECONDS = 1;

export async function handleTranscribe(request: Request, deps: TranscribeDeps): Promise<Response> {
  const role = await deps.findCallerRole();
  if (role === null) return transcribeApiError("unauthorized");
  if (role !== "employee") return transcribeApiError("forbidden");

  const mediaType = toAcceptedAudioType(request.headers.get("content-type"));
  if (!mediaType) return transcribeApiError("unsupported_type");

  const maxBytes = maxAudioBytes(deps.maxSeconds);
  const declaredBytes = Number(request.headers.get("content-length") ?? 0);
  if (declaredBytes > maxBytes) return transcribeApiError("too_long");

  const audio = new Uint8Array(await request.arrayBuffer());
  if (audio.byteLength === 0) return transcribeApiError("empty_audio");
  if (audio.byteLength > maxBytes) return transcribeApiError("too_long");

  // Antes de gastar com o provedor.
  if (!(await deps.isWithinDailyLimit())) return transcribeApiError("daily_limit_reached");

  let transcription;
  try {
    transcription = await deps.transcribe(audio, mediaType);
  } catch (error) {
    console.error("[transcribe] falha no provedor de transcrição", error);
    return transcribeApiError("provider_failed");
  }

  // Sem a duração do provedor, o custo sai pelo mínimo cobrado (10 s).
  const durationSeconds = transcription.durationSeconds ?? 0;

  // Registra mesmo quando o texto sai vazio ou longo demais: o provedor cobrou do mesmo jeito.
  await deps.recordUsage(durationSeconds);

  if (durationSeconds > deps.maxSeconds + DURATION_TOLERANCE_SECONDS) {
    return transcribeApiError("too_long");
  }

  const text = tidyTranscript(transcription.text);
  if (text === "") return transcribeApiError("not_understood");

  const response: TranscribeResponse = {
    text,
    durationSeconds,
    estimatedCostUsd: estimateTranscriptionCostUsd(deps.model, durationSeconds),
  };
  return Response.json(response);
}
