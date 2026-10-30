import { describe, expect, it } from "vitest";

import { confidenceLevel, lowConfidencePolicy } from "../low-confidence-policy";
import { makeContext } from "./fixtures";

function evaluate(confidence: number, clarificationAttempts = 0) {
  return lowConfidencePolicy.evaluate(
    makeContext({
      clarificationAttempts,
      understanding: { confidence, confidenceReason: "Não disse qual sistema." },
    }),
  );
}

describe("confidenceLevel", () => {
  it.each([
    [1, "high"],
    [0.75, "high"],
    [0.74, "medium"],
    [0.5, "medium"],
    [0.49, "low"],
    [0, "low"],
  ])("%s é %s", (value, level) => {
    expect(confidenceLevel(value)).toBe(level);
  });
});

describe("lowConfidencePolicy", () => {
  it("confiança alta não se aplica", () => {
    expect(evaluate(0.9)).toEqual({ outcome: "not_applicable", note: "Confiança alta (0,90)." });
  });

  it("confiança média pede esclarecimento, mesmo depois de 2 tentativas", () => {
    expect(evaluate(0.6)).toMatchObject({ action: { kind: "ask_clarification" } });
    expect(evaluate(0.6, 2)).toMatchObject({ action: { kind: "ask_clarification" } });
  });

  it("explica o motivo e a tentativa", () => {
    const result = evaluate(0.3, 1);
    expect(result).toEqual({
      outcome: "triggered",
      action: { kind: "ask_clarification" },
      explanation:
        "Confiança baixa (0,30): Não disse qual sistema. O agent faz uma pergunta de esclarecimento (tentativa 2).",
    });
  });

  it("mensagem vaga 3 vezes: esclarece 2 e transfere por low_confidence", () => {
    expect(evaluate(0.3, 0)).toMatchObject({ action: { kind: "ask_clarification" } });
    expect(evaluate(0.3, 1)).toMatchObject({ action: { kind: "ask_clarification" } });
    expect(evaluate(0.3, 2)).toMatchObject({
      outcome: "triggered",
      action: { kind: "handoff", reason: "low_confidence" },
    });
  });
});
