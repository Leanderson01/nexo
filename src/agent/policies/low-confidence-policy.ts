import type { ConfidenceLevel } from "@/domain/enums";
import { CONFIDENCE_LEVEL_LABELS } from "@/domain/labels";

import type { Policy, PolicyResult, TurnContext } from "./policy";

// Limites da §6.2.
export const HIGH_CONFIDENCE_MIN = 0.75;
export const MEDIUM_CONFIDENCE_MIN = 0.5;
/** Esclarecimentos já feitos a partir dos quais a confiança baixa vira transferência. */
export const MAX_CLARIFICATION_ATTEMPTS = 2;

/** Alta (≥ 0,75), média (0,5 a 0,75) ou baixa (< 0,5). Também serve ao `DecisionRecord`. */
export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= HIGH_CONFIDENCE_MIN) return "high";
  if (confidence >= MEDIUM_CONFIDENCE_MIN) return "medium";
  return "low";
}

/**
 * §6.3, item 5: aplica os níveis de confiança da §6.2.
 * - alta: segue normalmente;
 * - média: `ask_clarification`;
 * - baixa: `ask_clarification`, ou `handoff` (`low_confidence`) se já houve 2 esclarecimentos.
 *
 * `ask_clarification` significa também "incremente `clarificationAttempts`": o pipeline soma 1
 * sempre que o turno seguir esta ação. A política só lê o contador (é pura).
 */
export const lowConfidencePolicy: Policy = {
  name: "LowConfidencePolicy",
  evaluate(ctx: TurnContext): PolicyResult {
    const { confidence, confidenceReason } = ctx.understanding;
    const level = confidenceLevel(confidence);
    const attempts = ctx.clarificationAttempts;
    const label = `Confiança ${CONFIDENCE_LEVEL_LABELS[level].toLowerCase()} (${formatConfidence(confidence)})`;

    if (level === "high") {
      return { outcome: "not_applicable", note: `${label}.` };
    }
    if (level === "low" && attempts >= MAX_CLARIFICATION_ATTEMPTS) {
      return {
        outcome: "triggered",
        action: { kind: "handoff", reason: "low_confidence" },
        explanation: `${label} depois de ${attempts} esclarecimentos: ${confidenceReason} Transfere para um analista.`,
      };
    }
    return {
      outcome: "triggered",
      action: { kind: "ask_clarification" },
      explanation: `${label}: ${confidenceReason} O agent faz uma pergunta de esclarecimento (tentativa ${attempts + 1}).`,
    };
  },
};

/** 0.62 vira "0,62". */
function formatConfidence(confidence: number): string {
  return confidence.toFixed(2).replace(".", ",");
}
