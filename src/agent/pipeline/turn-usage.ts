import { estimateCostUsd } from "@/agent/llm/models";

// Tokens e custo de um turno (§6.6, §6.7). Cada chamada ao modelo soma aqui; o
// `DecisionRecord` guarda o total e a lista de modelos usados.

/** O que o Mastra devolve em `totalUsage` (campos podem vir ausentes). */
export interface ModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
}

export interface UsageTotals {
  models: string[];
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export function emptyUsage(): UsageTotals {
  return { models: [], inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 };
}

/** Soma uma chamada ao modelo `model`; o custo usa o preço dele, com desconto do cache. */
export function addModelUsage(totals: UsageTotals, model: string, usage: ModelUsage): UsageTotals {
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  const cached = usage.cachedInputTokens ?? 0;
  return {
    models: totals.models.includes(model) ? totals.models : [...totals.models, model],
    inputTokens: totals.inputTokens + input,
    cachedInputTokens: totals.cachedInputTokens + cached,
    outputTokens: totals.outputTokens + output,
    estimatedCostUsd: totals.estimatedCostUsd + estimateCostUsd(model, input, output, cached),
  };
}
