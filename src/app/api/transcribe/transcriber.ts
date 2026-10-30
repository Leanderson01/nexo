import type { LlmConfig } from "@/agent/llm/models";
import { createLlmModels } from "@/agent/llm/provider";
import type { AcceptedAudioType } from "@/features/voice/audio-format";

// Transcrição com o Whisper do Groq, chamando o modelo do provider direto (sem Mastra).
// `verbose_json` faz o Groq devolver a duração do áudio, que usamos no custo e no limite.

export interface Transcription {
  text: string;
  /** Duração medida pelo provedor; null se ele não informar. */
  durationSeconds: number | null;
}

export type Transcriber = (
  audio: Uint8Array,
  mediaType: AcceptedAudioType,
) => Promise<Transcription>;

/** `fetch` só é trocado nos testes, para simular o Groq. */
export function createGroqTranscriber(config: LlmConfig, fetchImpl?: typeof fetch): Transcriber {
  const { transcription } = createLlmModels(config, fetchImpl);
  return async (audio, mediaType) => {
    const result = await transcription.doGenerate({
      audio,
      mediaType,
      providerOptions: { groq: { language: "pt", responseFormat: "verbose_json" } },
    });
    return { text: result.text, durationSeconds: result.durationInSeconds ?? null };
  };
}
