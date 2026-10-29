// Configuração e custo dos modelos de LLM. Puro: não importa SDK nenhum, só lê o env recebido.
// Preços do Groq em 29/10/2026 (docs/decisoes/llm.md).

export const LLM_PROVIDERS = ["groq"] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export const DEFAULT_TRANSCRIPTION_MODEL = "whisper-large-v3-turbo";

export interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
  fastModel: string;
  mainModel: string;
  transcriptionModel: string;
}

type Env = Record<string, string | undefined>;

function requireEnv(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Variável de ambiente ${name} ausente (veja o .env.example).`);
  }
  return value;
}

function isLlmProvider(value: string): value is LlmProvider {
  return (LLM_PROVIDERS as readonly string[]).includes(value);
}

export function readLlmConfig(env: Env): LlmConfig {
  const provider = requireEnv(env, "LLM_PROVIDER");
  if (!isLlmProvider(provider)) {
    throw new Error(
      `LLM_PROVIDER=${provider} não é suportado (aceitos: ${LLM_PROVIDERS.join(", ")}).`,
    );
  }
  return {
    provider,
    apiKey: requireEnv(env, "GROQ_API_KEY"),
    fastModel: requireEnv(env, "LLM_MODEL_FAST"),
    mainModel: requireEnv(env, "LLM_MODEL_MAIN"),
    transcriptionModel: env.TRANSCRIPTION_MODEL?.trim() || DEFAULT_TRANSCRIPTION_MODEL,
  };
}

export interface TokenPrice {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
  // Fração do preço de entrada cobrada pelos tokens que vieram do cache de prompt.
  cachedInputFactor: number;
}

export const MODEL_PRICES: Readonly<Record<string, TokenPrice>> = {
  "openai/gpt-oss-20b": {
    inputPerMillionUsd: 0.075,
    outputPerMillionUsd: 0.3,
    cachedInputFactor: 0.5,
  },
  "openai/gpt-oss-120b": {
    inputPerMillionUsd: 0.15,
    outputPerMillionUsd: 0.6,
    cachedInputFactor: 0.5,
  },
};

export const TRANSCRIPTION_PRICES_PER_HOUR_USD: Readonly<Record<string, number>> = {
  "whisper-large-v3-turbo": 0.04,
  "whisper-large-v3": 0.111,
};

// O Groq cobra no mínimo 10 s por requisição de transcrição.
export const MIN_BILLED_TRANSCRIPTION_SECONDS = 10;

function priceOf(model: string): TokenPrice {
  const price = MODEL_PRICES[model];
  if (!price) {
    throw new Error(`Modelo ${model} sem preço em MODEL_PRICES.`);
  }
  return price;
}

// cachedInputTokens é a parte de inputTokens que veio do cache de prompt (já incluída nela).
export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens = 0,
): number {
  const price = priceOf(model);
  const cached = Math.min(cachedInputTokens, inputTokens);
  const uncached = inputTokens - cached;
  const inputCost = (uncached + cached * price.cachedInputFactor) * price.inputPerMillionUsd;
  const outputCost = outputTokens * price.outputPerMillionUsd;
  return (inputCost + outputCost) / 1_000_000;
}

export function estimateTranscriptionCostUsd(model: string, durationSeconds: number): number {
  const pricePerHour = TRANSCRIPTION_PRICES_PER_HOUR_USD[model];
  if (pricePerHour === undefined) {
    throw new Error(`Modelo de transcrição ${model} sem preço.`);
  }
  const billedSeconds = Math.max(durationSeconds, MIN_BILLED_TRANSCRIPTION_SECONDS);
  return (billedSeconds / 3600) * pricePerHour;
}
