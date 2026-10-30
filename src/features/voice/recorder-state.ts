import { SILENCE_WARNING_SECONDS, isVoiceLevel, meterLevel } from "./audio-level";
import { NOT_UNDERSTOOD_MESSAGE } from "./transcribe-errors";

// Estados do gravador do campo de mensagem (§11.1), sem React nem navegador:
// parado → pedindo permissão → gravando → transcrevendo → parado (texto no campo) ou erro.

export type RecorderState =
  | { status: "idle" }
  | { status: "requesting_permission" }
  | {
      status: "recording";
      startedAt: number;
      elapsedSeconds: number;
      /** Nível do microfone agora, de 0 a 1, para o medidor. */
      level: number;
      /** Já captou algo no nível de voz nesta gravação. */
      heardVoice: boolean;
    }
  | { status: "transcribing" }
  | { status: "error"; message: string };

export type RecorderEvent =
  | { type: "start_requested" }
  | { type: "recording_started"; now: number }
  /** `levelDbfs` é null quando o navegador não deixa medir o nível. */
  | { type: "tick"; now: number; levelDbfs: number | null }
  | { type: "stopped" }
  | { type: "cancelled" }
  | { type: "transcribed" }
  | { type: "failed"; message: string }
  | { type: "dismissed" };

export const IDLE: RecorderState = { status: "idle" };

export function recorderReducer(state: RecorderState, event: RecorderEvent): RecorderState {
  switch (event.type) {
    case "start_requested":
      return canStart(state) ? { status: "requesting_permission" } : state;
    case "recording_started":
      return state.status === "requesting_permission"
        ? {
            status: "recording",
            startedAt: event.now,
            elapsedSeconds: 0,
            level: 0,
            heardVoice: false,
          }
        : state;
    case "tick":
      return state.status === "recording" ? tick(state, event) : state;
    case "stopped":
      return state.status === "recording" ? { status: "transcribing" } : state;
    case "cancelled":
      return IDLE;
    case "transcribed":
      return state.status === "transcribing" ? IDLE : state;
    case "failed":
      return { status: "error", message: event.message };
    case "dismissed":
      return state.status === "error" ? IDLE : state;
  }
}

type Recording = Extract<RecorderState, { status: "recording" }>;

function tick(state: Recording, event: { now: number; levelDbfs: number | null }): Recording {
  const elapsedSeconds = (event.now - state.startedAt) / 1000;
  if (event.levelDbfs === null) return { ...state, elapsedSeconds };
  return {
    ...state,
    elapsedSeconds,
    level: meterLevel(event.levelDbfs),
    heardVoice: state.heardVoice || isVoiceLevel(event.levelDbfs),
  };
}

/**
 * Gravando há alguns segundos sem nenhum som no nível de voz: provavelmente o microfone está
 * mudo ou é o dispositivo errado. A tela avisa enquanto ainda dá para corrigir.
 */
export function shouldWarnSilence(state: RecorderState): boolean {
  return (
    state.status === "recording" &&
    !state.heardVoice &&
    state.elapsedSeconds >= SILENCE_WARNING_SECONDS
  );
}

/** Dá para começar a gravar parado ou depois de um erro (o erro some ao tentar de novo). */
export function canStart(state: RecorderState): boolean {
  return state.status === "idle" || state.status === "error";
}

/** Enquanto grava ou transcreve, o envio espera: o texto ainda vai chegar no campo. */
export function isBusy(state: RecorderState): boolean {
  return state.status !== "idle" && state.status !== "error";
}

/** Chegou ao teto: o gravador para sozinho e transcreve o que tem. */
export function shouldAutoStop(state: RecorderState, maxSeconds: number): boolean {
  return state.status === "recording" && state.elapsedSeconds >= maxSeconds;
}

/** 7.4 → "0:07"; 60 → "1:00". */
export function formatElapsed(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

/** O texto transcrito entra no fim do que já estava escrito, para a pessoa revisar. */
export function appendTranscript(current: string, transcript: string): string {
  const before = current.trimEnd();
  return before === "" ? transcript : `${before} ${transcript}`;
}

/** Falhas do lado do navegador, antes de o áudio chegar ao servidor. */
export type MicrophoneProblem =
  | "unsupported"
  | "permission_denied"
  | "no_microphone"
  | "microphone_busy"
  | "microphone_failed"
  | "empty"
  | "silent";

export const MICROPHONE_MESSAGES: Record<MicrophoneProblem, string> = {
  unsupported: "Seu navegador não grava áudio. Digite sua mensagem.",
  permission_denied:
    "O navegador bloqueou o microfone. Libere o acesso nas permissões do site ou digite sua mensagem.",
  no_microphone: "Não encontramos um microfone. Conecte um ou digite sua mensagem.",
  microphone_busy:
    "O microfone não respondeu: talvez outro programa esteja usando. Feche-o e tente de novo, ou digite sua mensagem.",
  microphone_failed: "Não conseguimos usar o microfone. Tente de novo ou digite sua mensagem.",
  empty: NOT_UNDERSTOOD_MESSAGE,
  silent:
    "Não captamos sua voz. Confira se o microfone certo está selecionado no navegador e tente de novo.",
};

/** Aviso enquanto grava e nada chega no nível de voz (ver `shouldWarnSilence`). */
export const SILENCE_WARNING =
  "Não estamos ouvindo sua voz. Confira se o microfone certo está selecionado no navegador.";

/**
 * Erros do `getUserMedia` pelo `name` da DOMException. Os nomes antigos do Chrome
 * (`PermissionDeniedError`, `DevicesNotFoundError`, `TrackStartError`) contam também.
 * `NotSupportedError` aparece quando não há dispositivo de áudio utilizável (o Chrome headless,
 * por exemplo): para a pessoa, é "sem microfone", não "navegador sem suporte".
 */
const PROBLEM_BY_ERROR_NAME: Record<string, MicrophoneProblem> = {
  NotAllowedError: "permission_denied",
  PermissionDeniedError: "permission_denied",
  SecurityError: "permission_denied",
  NotFoundError: "no_microphone",
  DevicesNotFoundError: "no_microphone",
  OverconstrainedError: "no_microphone",
  NotSupportedError: "no_microphone",
  NotReadableError: "microphone_busy",
  TrackStartError: "microphone_busy",
  AbortError: "microphone_busy",
  // O `getUserMedia` lança TypeError fora de HTTPS ou sem `navigator.mediaDevices`.
  TypeError: "unsupported",
};

/** Traduz o erro do `getUserMedia` (DOMException pelo `name`). */
export function microphoneProblemOf(error: unknown): MicrophoneProblem {
  const name = errorName(error);
  return (name && PROBLEM_BY_ERROR_NAME[name]) || "microphone_failed";
}

/** Nem todo ambiente faz a DOMException herdar de Error: lê o `name` de qualquer objeto. */
function errorName(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("name" in error)) return null;
  return typeof error.name === "string" ? error.name : null;
}
