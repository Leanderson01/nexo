import { describe, expect, it } from "vitest";

import { IMPACTS, TICKET_KINDS, type Priority } from "../enums";
import { derivePriority, explainPriority, type PriorityInput } from "../priority";

// Resultado esperado de cada combinação, escrito à mão a partir da tabela da §3.5.
function expectedPriority(input: PriorityInput): Priority {
  const affectsGroup = input.impact !== "individual";
  if (affectsGroup && input.blocked) return "CRITICAL";
  if (input.blocked || input.deadlineToday) return "HIGH";
  return input.kind === "INC" ? "MEDIUM" : "LOW";
}

const allCombinations: PriorityInput[] = TICKET_KINDS.flatMap((kind) =>
  IMPACTS.flatMap((impact) =>
    [true, false].flatMap((blocked) =>
      [true, false].map((deadlineToday) => ({ kind, impact, blocked, deadlineToday })),
    ),
  ),
);

describe("derivePriority", () => {
  it("cobre as 24 combinações da matriz", () => {
    expect(allCombinations).toHaveLength(24);
  });

  it.each(allCombinations)("%o", (input) => {
    expect(derivePriority(input).priority).toBe(expectedPriority(input));
  });

  it("é Crítica quando a equipe ou a empresa está parada, mesmo sendo REQ", () => {
    const result = derivePriority({
      kind: "REQ",
      impact: "company",
      blocked: true,
      deadlineToday: false,
    });
    expect(result).toEqual({ priority: "CRITICAL", reason: "Parado para uma equipe/empresa" });
  });

  it("explica o compromisso de hoje antes do impedimento", () => {
    const result = derivePriority({
      kind: "INC",
      impact: "individual",
      blocked: true,
      deadlineToday: true,
    });
    expect(result).toEqual({ priority: "HIGH", reason: "Compromisso hoje em risco" });
  });

  it("é Alta para uma pessoa impedida", () => {
    const result = derivePriority({
      kind: "INC",
      impact: "individual",
      blocked: true,
      deadlineToday: false,
    });
    expect(result).toEqual({ priority: "HIGH", reason: "Impede uma pessoa de trabalhar" });
  });

  it("é Média para incidente com alternativa e Baixa para pedido sem urgência", () => {
    const base = { impact: "team", blocked: false, deadlineToday: false } as const;
    expect(derivePriority({ ...base, kind: "INC" }).priority).toBe("MEDIUM");
    expect(derivePriority({ ...base, kind: "REQ" }).priority).toBe("LOW");
  });
});

describe("explainPriority", () => {
  it("monta o texto do rascunho com o prazo", () => {
    const derived = derivePriority({
      kind: "INC",
      impact: "individual",
      blocked: true,
      deadlineToday: false,
    });
    expect(explainPriority(derived)).toBe(
      "Alta: impede uma pessoa de trabalhar. Prazo: 4 horas úteis.",
    );
  });

  it("usa o prazo corrido na Crítica e os dias úteis nas demais", () => {
    expect(
      explainPriority({ priority: "CRITICAL", reason: "Parado para uma equipe/empresa" }),
    ).toBe("Crítica: parado para uma equipe/empresa. Prazo: 1 hora corrida.");
    expect(explainPriority({ priority: "MEDIUM", reason: "Atrapalha, mas há alternativa" })).toBe(
      "Média: atrapalha, mas há alternativa. Prazo: 3 dias úteis.",
    );
    expect(explainPriority({ priority: "LOW", reason: "Pedido sem urgência" })).toBe(
      "Baixa: pedido sem urgência. Prazo: 5 dias úteis.",
    );
  });
});
