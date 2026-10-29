import { createGroq, type GroqProvider } from "@ai-sdk/groq";

import type { LlmConfig } from "./models";

// Adapter do provedor de LLM (§5.8). A chave vem do nosso leitor de env (readLlmConfig),
// nunca do process.env implícito do SDK. `fetch` só é trocado nos testes.
export interface LlmModels {
  fast: ReturnType<GroqProvider>;
  main: ReturnType<GroqProvider>;
  transcription: ReturnType<GroqProvider["transcription"]>;
}

export function createLlmModels(config: LlmConfig, fetchImpl?: typeof fetch): LlmModels {
  const groq = createGroq({ apiKey: config.apiKey, fetch: fetchImpl });
  return {
    fast: groq(config.fastModel),
    main: groq(config.mainModel),
    transcription: groq.transcription(config.transcriptionModel),
  };
}
