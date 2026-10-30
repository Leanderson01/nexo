import { describe, expect, it } from "vitest";

import type { Policy } from "../policy";
import { runPolicies } from "../run-policies";
import { MARIANA_NOTEBOOK, makeContext } from "./fixtures";

const POLICY_ORDER = [
  "OutOfScopePolicy",
  "ExplicitHandoffPolicy",
  "CriticalPolicy",
  "OverdueTicketPolicy",
  "LowConfidencePolicy",
];

describe("runPolicies", () => {
  it("lista todas as políticas na ordem da §6.3, inclusive as que não se aplicam", () => {
    const decision = runPolicies(makeContext());

    expect(decision.evaluations.map((evaluation) => evaluation.name)).toEqual(POLICY_ORDER);
    expect(
      decision.evaluations.every((evaluation) => evaluation.outcome === "not_applicable"),
    ).toBe(true);
    expect(decision.evaluations.every((evaluation) => evaluation.explanation)).toBe(true);
    expect(decision.decisiveAction).toBeNull();
    expect(decision.guidingActions).toEqual([]);
  });

  it('Mariana: "e o meu chamado do notebook?" segue para o AGIR com oferta de analista', () => {
    const decision = runPolicies(
      makeContext({
        understanding: { intent: "ticket_status", entities: entitiesWithRef("o do notebook") },
        focusedTicket: MARIANA_NOTEBOOK,
      }),
    );

    expect(decision.decisiveAction).toBeNull();
    expect(decision.guidingActions).toEqual([{ kind: "offer_handoff", reason: "overdue" }]);
    expect(decision.evaluations[3]).toMatchObject({
      name: "OverdueTicketPolicy",
      outcome: "triggered",
    });
  });

  it("redirecionamento curto-circuita e as demais continuam no painel", () => {
    const decision = runPolicies(
      makeContext({ understanding: { intent: "out_of_scope", summary: "Holerite veio errado" } }),
    );

    expect(decision.decisiveAction).toEqual({ kind: "redirect_out_of_scope", area: "hr" });
    expect(decision.evaluations).toHaveLength(5);
  });

  it("pedido explícito vence a baixa confiança esgotada (primeira na ordem)", () => {
    const decision = runPolicies(
      makeContext({
        clarificationAttempts: 2,
        understanding: { intent: "talk_to_analyst", confidence: 0.3 },
      }),
    );

    expect(decision.decisiveAction).toEqual({ kind: "handoff", reason: "requested" });
    expect(decision.evaluations[4]).toMatchObject({ outcome: "triggered" });
  });

  it("ação decisiva descarta as não decisivas", () => {
    const decision = runPolicies(
      makeContext({
        understanding: { intent: "talk_to_analyst" },
        focusedTicket: MARIANA_NOTEBOOK,
      }),
    );

    expect(decision.decisiveAction).toEqual({ kind: "handoff", reason: "requested" });
    expect(decision.guidingActions).toEqual([]);
  });

  it("crítico com confiança média: rascunho crítico antes do esclarecimento", () => {
    const decision = runPolicies(
      makeContext({
        derivedPriority: { priority: "CRITICAL", reason: "Parado para uma equipe/empresa" },
        understanding: { intent: "open_ticket", confidence: 0.6 },
      }),
    );

    expect(decision.guidingActions).toEqual([
      { kind: "offer_handoff", reason: "critical" },
      { kind: "ask_clarification" },
    ]);
  });

  it("baixa confiança esgotada transfere por low_confidence", () => {
    const decision = runPolicies(
      makeContext({
        clarificationAttempts: 2,
        understanding: { intent: "unclear", confidence: 0.2 },
      }),
    );
    expect(decision.decisiveAction).toEqual({ kind: "handoff", reason: "low_confidence" });
  });

  it("aceita outra lista de políticas", () => {
    const always: Policy = {
      name: "Sempre",
      evaluate: () => ({
        outcome: "triggered",
        action: { kind: "ask_clarification" },
        explanation: "sempre",
      }),
    };
    const decision = runPolicies(makeContext(), [always]);
    expect(decision.evaluations).toEqual([
      { name: "Sempre", outcome: "triggered", explanation: "sempre" },
    ]);
  });
});

function entitiesWithRef(ticketRef: string) {
  return { system: null, errorCode: null, os: null, device: null, ticketRef };
}
