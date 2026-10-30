import { describe, expect, it } from "vitest";

import type { TicketSignals } from "@/domain/understanding";

import { deriveSignalsPriority } from "../derive-signals-priority";

const COMPLETE: TicketSignals = {
  kind: "INC",
  category: "software",
  impact: "individual",
  blocked: false,
  deadlineToday: false,
};

describe("deriveSignalsPriority", () => {
  it("com todos os sinais, deriva a prioridade", () => {
    expect(deriveSignalsPriority(COMPLETE)).toEqual({
      priority: "MEDIUM",
      reason: "Atrapalha, mas há alternativa",
    });
  });

  it("equipe parada é Crítica mesmo sem saber da urgência", () => {
    const signals: TicketSignals = {
      ...COMPLETE,
      impact: "team",
      blocked: true,
      deadlineToday: null,
    };
    expect(deriveSignalsPriority(signals)?.priority).toBe("CRITICAL");
  });

  it("urgência nula conta como sem compromisso hoje", () => {
    expect(deriveSignalsPriority({ ...COMPLETE, deadlineToday: null })?.priority).toBe("MEDIUM");
  });

  it.each(["impact", "blocked"] as const)("sem %s, não deriva", (field) => {
    expect(
      deriveSignalsPriority({ ...COMPLETE, impact: "team", blocked: true, [field]: null }),
    ).toBe(null);
  });

  it('sem o tipo, "caiu para o time todo" continua Crítica', () => {
    const signals: TicketSignals = { ...COMPLETE, kind: null, impact: "team", blocked: true };
    expect(deriveSignalsPriority(signals)?.priority).toBe("CRITICAL");
  });

  it("sem o tipo, compromisso hoje continua Alta", () => {
    expect(deriveSignalsPriority({ ...COMPLETE, kind: null, deadlineToday: true })?.priority).toBe(
      "HIGH",
    );
  });

  it("sem o tipo, não chuta entre Média e Baixa", () => {
    expect(deriveSignalsPriority({ ...COMPLETE, kind: null })).toBe(null);
  });

  it("a categoria não entra na prioridade", () => {
    expect(deriveSignalsPriority({ ...COMPLETE, category: null })).not.toBeNull();
  });
});
