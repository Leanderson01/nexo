// `fetch` para o provedor de LLM nos evals: no 429 do Groq, espera o tempo que a resposta
// pede (`retry-after`, em segundos) e repete, até `maxWaits` vezes (decisão 17). Só muda o
// transporte: o turno do agent continua sendo o mesmo do produto.

export interface RateLimitOptions {
  maxWaits: number;
  /** Espera quando a resposta não diz quanto esperar. */
  fallbackWaitMs: number;
  sleep: (ms: number) => Promise<void>;
  /** Chamado a cada espera, para o runner mostrar no terminal. */
  onWait?: (waitMs: number) => void;
}

export const DEFAULT_RATE_LIMIT: RateLimitOptions = {
  maxWaits: 6,
  fallbackWaitMs: 10_000,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export function rateLimitedFetch(
  baseFetch: typeof fetch,
  options: RateLimitOptions = DEFAULT_RATE_LIMIT,
): typeof fetch {
  return async (input, init) => {
    for (let waits = 0; ; waits++) {
      const response = await baseFetch(input, init);
      if (response.status !== 429 || waits >= options.maxWaits) return response;
      const waitMs = retryAfterMs(response.headers.get("retry-after"), options.fallbackWaitMs);
      options.onWait?.(waitMs);
      await options.sleep(waitMs);
    }
  };
}

/** `retry-after` em segundos (pode ter fração); valor ausente ou inválido usa o padrão. */
export function retryAfterMs(header: string | null, fallbackMs: number): number {
  const seconds = Number(header);
  if (header === null || header.trim() === "" || !Number.isFinite(seconds) || seconds < 0) {
    return fallbackMs;
  }
  return Math.ceil(seconds * 1000);
}
