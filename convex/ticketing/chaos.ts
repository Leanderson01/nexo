// Modo caos do legado simulado (§5.6): a API HTTP atrasa e falha de propósito, para o
// retry do `HttpTicketGateway` ter o que tratar. Configuração por variável de ambiente;
// valor ausente ou inválido desliga o caos.

export interface ChaosConfig {
  /** Chance de responder 503, de 0 a 1. */
  failureRate: number;
  /** Faixa da latência extra em ms, ou null para nenhuma. */
  latencyMs: { min: number; max: number } | null;
}

export const NO_CHAOS: ChaosConfig = { failureRate: 0, latencyMs: null };

type Env = Record<string, string | undefined>;

/** Lê `TICKETING_FAILURE_RATE` ("0.1") e `TICKETING_LATENCY_MS` ("200-1500"). */
export function readChaosConfig(env: Env): ChaosConfig {
  return {
    failureRate: parseFailureRate(env.TICKETING_FAILURE_RATE),
    latencyMs: parseLatencyRange(env.TICKETING_LATENCY_MS),
  };
}

function parseFailureRate(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return 0;
  const rate = Number(raw);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) return 0;
  return rate;
}

function parseLatencyRange(raw: string | undefined): ChaosConfig["latencyMs"] {
  const match = raw?.trim().match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) return null;
  const min = Number(match[1]);
  const max = Number(match[2]);
  if (min > max) return null;
  return { min, max };
}

/** Latência extra desta requisição, sorteada na faixa (0 sem faixa). */
export function pickLatencyMs(config: ChaosConfig, random: () => number): number {
  if (!config.latencyMs) return 0;
  const { min, max } = config.latencyMs;
  return Math.round(min + random() * (max - min));
}

/** Se esta requisição deve falhar com 503. */
export function shouldFail(config: ChaosConfig, random: () => number): boolean {
  return random() < config.failureRate;
}
