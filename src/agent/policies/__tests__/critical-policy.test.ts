import { describe, expect, it } from "vitest";

import { deriveSignalsPriority } from "@/agent/pipeline/derive-signals-priority";

import { criticalPolicy } from "../critical-policy";
import { makeContext } from "./fixtures";

describe("criticalPolicy", () => {
  it('"O sistema de vendas caiu para o time todo" é Crítica e oferece transferência no rascunho', () => {
    const derivedPriority = deriveSignalsPriority({
      kind: "INC",
      category: "software",
      impact: "team",
      blocked: true,
      deadlineToday: null,
    });
    const result = criticalPolicy.evaluate(makeContext({ derivedPriority }));

    expect(result).toMatchObject({
      outcome: "triggered",
      action: { kind: "offer_handoff", reason: "critical" },
    });
    if (result.outcome === "triggered") {
      expect(result.explanation).toContain("Crítica: parado para uma equipe/empresa");
    }
  });

  it("não se aplica sem prioridade derivada", () => {
    expect(criticalPolicy.evaluate(makeContext())).toEqual({
      outcome: "not_applicable",
      note: "Sem sinais suficientes para derivar a prioridade.",
    });
  });

  it("não se aplica a prioridade Alta, e a nota mostra o porquê", () => {
    const ctx = makeContext({
      derivedPriority: { priority: "HIGH", reason: "Impede uma pessoa de trabalhar" },
    });
    expect(criticalPolicy.evaluate(ctx)).toEqual({
      outcome: "not_applicable",
      note: "Não é crítico. Alta: impede uma pessoa de trabalhar. Prazo: 4 horas úteis.",
    });
  });
});
