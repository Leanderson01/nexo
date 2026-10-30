import { err, ok, type Result } from "@/domain/result";
import { TRANSCRIBE_ERRORS, type TranscribeErrorBody } from "./transcribe-errors";

// Cliente de `POST /api/transcribe`: manda o Blob gravado como corpo, com o tipo dele.
// Devolve o texto ou a mensagem de erro pronta para a tela.

export async function transcribeAudio(audio: Blob): Promise<Result<string, string>> {
  try {
    const response = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": audio.type },
      body: audio,
    });
    const body: unknown = await response.json().catch(() => null);
    if (response.ok && hasText(body)) return ok(body.text);
    return err(hasError(body) ? body.error.message : TRANSCRIBE_ERRORS.provider_failed.message);
  } catch {
    // Sem rede ou servidor fora do ar.
    return err(TRANSCRIBE_ERRORS.provider_failed.message);
  }
}

function hasText(body: unknown): body is { text: string } {
  return (
    typeof body === "object" && body !== null && "text" in body && typeof body.text === "string"
  );
}

function hasError(body: unknown): body is TranscribeErrorBody {
  return (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "object" &&
    body.error !== null &&
    "message" in body.error &&
    typeof body.error.message === "string"
  );
}
