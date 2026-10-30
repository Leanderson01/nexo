import { describe, expect, it } from "vitest";

import { maskSensitiveData } from "@/domain/sensitive-data";

import { buildSeedTickets, SEED_PEOPLE } from "../../../../convex/seedData";
import { POLICY_NAMES, TOOL_NAMES, type Scenario, type TextRule } from "../scenario";
import { EXTRA_SCENARIOS, SCENARIOS, SPEC_SCENARIOS } from "../scenarios";

// Os cenários são uma especificação: estes testes garantem que ela fala do seed real
// (pessoas, chamados e donos) e que o roteiro é coerente antes de qualquer LLM rodar.

const SEED_TICKETS = buildSeedTickets(Date.now());
const OWNER_BY_CODE = new Map(SEED_TICKETS.map((ticket) => [ticket.code, ticket.ownerEmail]));
const EMPLOYEE_EMAILS = SEED_PEOPLE.filter((p) => p.role === "employee").map((p) => p.email);
const TICKET_CODE = /\b(?:INC|REQ)-\d{5}\b/g;

/** Todo texto do cenário: mensagens, expectativas e os padrões das regras. */
function allStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value instanceof RegExp) return [value.source];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(allStrings);
  return [];
}

function codesCitedIn(scenario: Scenario): Set<string> {
  const withoutDeclaration = { ...scenario, tickets: undefined };
  return new Set(allStrings(withoutDeclaration).flatMap((text) => text.match(TICKET_CODE) ?? []));
}

function allTextRules(value: unknown): TextRule[] {
  if (Array.isArray(value)) return value.flatMap(allTextRules);
  if (value === null || typeof value !== "object" || value instanceof RegExp) return [];
  if ("pattern" in value && value.pattern instanceof RegExp) return [value as TextRule];
  return Object.values(value).flatMap(allTextRules);
}

function byId(id: string): Scenario {
  const scenario = SCENARIOS.find((s) => s.id === id);
  if (!scenario) throw new Error(`Cenário ${id} não existe`);
  return scenario;
}

describe("lista de cenários", () => {
  it("tem os 13 cenários da §13.2 e marca os extras", () => {
    expect(SPEC_SCENARIOS).toHaveLength(13);
    expect(SPEC_SCENARIOS.every((s) => s.source === "spec")).toBe(true);
    expect(EXTRA_SCENARIOS.length).toBeGreaterThan(0);
    expect(EXTRA_SCENARIOS.every((s) => s.source === "extra")).toBe(true);
  });

  it("não repete ids", () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("todo cenário tem passos e alguma expectativa", () => {
    for (const scenario of SCENARIOS) {
      const hasTurnExpectation = scenario.steps.some((s) => s.kind === "message" && s.expect);
      expect(scenario.steps.length, scenario.id).toBeGreaterThan(0);
      expect(hasTurnExpectation || Object.keys(scenario.final).length > 0, scenario.id).toBe(true);
    }
  });
});

describe("consistência com o seed", () => {
  it.each(SCENARIOS.map((s) => [s.id, s] as const))(
    "%s: o funcionário existe no seed",
    (_, scenario) => {
      expect(EMPLOYEE_EMAILS).toContain(scenario.employeeEmail);
    },
  );

  it.each(SCENARIOS.map((s) => [s.id, s] as const))(
    "%s: os chamados declarados existem e têm o dono certo",
    (_, scenario) => {
      for (const code of scenario.tickets.ofEmployee) {
        expect(OWNER_BY_CODE.get(code), code).toBe(scenario.employeeEmail);
      }
      for (const code of scenario.tickets.ofOthers) {
        expect(OWNER_BY_CODE.has(code), code).toBe(true);
        expect(OWNER_BY_CODE.get(code), code).not.toBe(scenario.employeeEmail);
      }
    },
  );

  it.each(SCENARIOS.map((s) => [s.id, s] as const))(
    "%s: todo código citado está declarado em `tickets`",
    (_, scenario) => {
      const declared = [...scenario.tickets.ofEmployee, ...scenario.tickets.ofOthers];
      expect(declared.sort()).toEqual([...codesCitedIn(scenario)].sort());
    },
  );
});

describe("cenários de privacidade", () => {
  it("o INC-20388 pedido pela Mariana é de outra pessoa", () => {
    const scenario = byId("mariana-pede-chamado-alheio");
    expect(scenario.tickets.ofOthers).toEqual(["INC-20388"]);
    expect(OWNER_BY_CODE.get("INC-20388")).not.toBe(scenario.employeeEmail);
  });

  it("a impressora pedida pela Juliana é de outra pessoa", () => {
    const scenario = byId("extra-chamado-alheio-por-descricao");
    expect(OWNER_BY_CODE.get("INC-20395")).not.toBe(scenario.employeeEmail);
  });

  it("o prompt injection protege todos os chamados que não são da Mariana", () => {
    const scenario = byId("prompt-injection");
    const notHers = SEED_TICKETS.filter((t) => t.ownerEmail !== scenario.employeeEmail)
      .map((t) => t.code)
      .sort();
    const step = scenario.steps[0];
    expect([...scenario.tickets.ofOthers].sort()).toEqual(notHers);
    expect(step.kind === "message" ? [...(step.expect?.mustNotExpose ?? [])].sort() : []).toEqual(
      notHers,
    );
  });
});

describe("coerência do roteiro", () => {
  it("toda opção rápida escolhida foi exigida na resposta anterior", () => {
    for (const scenario of SCENARIOS) {
      scenario.steps.forEach((step, index) => {
        if (step.kind !== "message" || step.via !== "quickReply") return;
        const previous = scenario.steps[index - 1];
        const offered =
          previous?.kind === "message" &&
          (previous.expect?.parts?.mustInclude ?? []).some(
            (part) => part.type === "quickReplies" && part.includesLabel === step.text,
          );
        expect(offered, `${scenario.id}, passo ${index + 1}`).toBe(true);
      });
    }
  });

  it("botões de rascunho vêm depois de um turno que propõe rascunho", () => {
    for (const scenario of SCENARIOS) {
      scenario.steps.forEach((step, index) => {
        if (step.kind === "message") return;
        const previous = scenario.steps[index - 1];
        const proposesDraft =
          previous?.kind === "message" && previous.expect?.outcome === "draft_proposed";
        expect(proposesDraft, `${scenario.id}, passo ${index + 1}`).toBe(true);
      });
    }
  });

  it("só cita políticas e tools conhecidas", () => {
    const policies: readonly string[] = POLICY_NAMES;
    const tools: readonly string[] = TOOL_NAMES;
    for (const scenario of SCENARIOS) {
      for (const step of scenario.steps) {
        if (step.kind !== "message" || !step.expect) continue;
        const { policiesTriggered = [], policiesNotTriggered = [] } = step.expect;
        const { toolsCalled = [], toolsForbidden = [] } = step.expect;
        for (const name of [...policiesTriggered, ...policiesNotTriggered]) {
          expect(policies).toContain(name);
        }
        for (const name of [...toolsCalled.map((t) => t.tool), ...toolsForbidden]) {
          expect(tools).toContain(name);
        }
      }
    }
  });

  it("nenhuma regra de texto usa a flag g", () => {
    const rules = SCENARIOS.flatMap(allTextRules);
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.filter((rule) => rule.pattern.global)).toEqual([]);
  });

  it("o legado fora do ar liga 100% de falha só nesse cenário", () => {
    expect(byId("legado-fora-do-ar").setup?.env?.TICKETING_FAILURE_RATE).toBe("1");
    const others = SCENARIOS.filter((s) => s.id !== "legado-fora-do-ar");
    expect(others.filter((s) => s.setup !== undefined)).toEqual([]);
  });

  it("a senha colada do cenário é de fato mascarada pelo domínio", () => {
    const step = byId("extra-senha-mascarada").steps[0];
    const text = step.kind === "message" ? step.text : "";
    const result = maskSensitiveData(text);
    expect(result.masked).toBe(true);
    expect(result.text).not.toContain("Nexo@2026");
  });
});
