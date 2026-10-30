import type { LlmConfig } from "@/agent/llm/models";
import { createLlmModels } from "@/agent/llm/provider";
import type { AcceptedAudioType } from "@/features/voice/audio-format";

// Transcrição com o Whisper do Groq, chamando o modelo do provider direto (sem Mastra).
// `verbose_json` faz o Groq devolver a duração do áudio, que usamos no custo e no limite.
//
// `prompt` dá ao Whisper o vocabulário do suporte: sem ele, "VPN" saía "BPM"/"DPM" com ruído e
// "INC 4521" saía "Ink 4521". `temperature: 0` deixa a saída determinística (sem sorteio entre
// leituras). Medições em docs/decisoes/llm.md.

/**
 * Vocabulário do domínio. O Whisper lê só os últimos ~224 tokens do prompt e o trata como
 * "texto anterior": frase curta, natural, sem instruções.
 */
export const TRANSCRIPTION_PROMPT =
  "Atendimento de suporte de TI. Termos: VPN, SAP, Outlook, Teams, Wi-Fi, Windows 10, Windows 11, chamado, INC, REQ, Figma, impressora, notebook, senha, e-mail.";

/** Opções do Whisper no Groq que mandamos em toda transcrição. */
export const GROQ_TRANSCRIPTION_OPTIONS = {
  language: "pt",
  responseFormat: "verbose_json",
  prompt: TRANSCRIPTION_PROMPT,
  temperature: 0,
} as const;

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
      providerOptions: { groq: { ...GROQ_TRANSCRIPTION_OPTIONS } },
    });
    return { text: result.text, durationSeconds: result.durationInSeconds ?? null };
  };
}
