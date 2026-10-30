// Formatos de áudio aceitos na transcrição, compartilhados pela rota e pelo gravador.

/** Teto de gravação da §11.1. O servidor lê o seu de `TRANSCRIPTION_MAX_SECONDS`. */
export const MAX_RECORDING_SECONDS = 60;

/**
 * Tipos que o Whisper do Groq aceita (flac, mp3, mp4, m4a, ogg, wav, webm) e que os
 * navegadores gravam: Chrome e Edge gravam webm, o Firefox grava ogg e o Safari grava mp4.
 */
export const ACCEPTED_AUDIO_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
] as const;

export type AcceptedAudioType = (typeof ACCEPTED_AUDIO_TYPES)[number];

/** "audio/webm;codecs=opus" → "audio/webm"; devolve null para o que o Whisper não lê. */
export function toAcceptedAudioType(contentType: string | null): AcceptedAudioType | null {
  if (!contentType) return null;
  const base = contentType.split(";")[0].trim().toLowerCase();
  return ACCEPTED_AUDIO_TYPES.find((type) => type === base) ?? null;
}

/**
 * Bytes por segundo de áudio que ainda aceitamos: WAV de 24 kHz, 16 bits, mono. O gravador
 * do navegador usa Opus ou AAC, bem abaixo disso (~4 a 16 KB/s), então um arquivo maior que
 * `segundos × isto` com certeza passa do limite de duração.
 */
export const MAX_AUDIO_BYTES_PER_SECOND = 48_000;

export function maxAudioBytes(maxSeconds: number): number {
  return maxSeconds * MAX_AUDIO_BYTES_PER_SECOND;
}

/** Formatos que o gravador tenta, em ordem; o primeiro que o navegador suportar vence. */
export const RECORDING_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/webm",
] as const;

/** Sem nenhum da lista, devolve undefined e o navegador escolhe o padrão dele. */
export function pickRecordingMimeType(isTypeSupported: (type: string) => boolean) {
  return RECORDING_MIME_TYPES.find((type) => isTypeSupported(type));
}
