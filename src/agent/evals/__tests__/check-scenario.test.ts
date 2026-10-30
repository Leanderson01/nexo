import { describe, expect, it } from "vitest";

import type { DecisionRecord, ToolCallTrace } from "@/domain/decision-record";
import type { MessagePart } from "@/domain/message-parts";

import { checkScenario } from "../check-scenario";
import {
  confirmDraft,
  pick,
  say,
  type FinalStateExpectation,
  type ObservedFinalState,
  type ObservedScenario,
  type ObservedStep,
  type Scenario,
  type ScenarioStep,
  type TurnExpectation,
} from "../scenario";

// ---------- Fábricas do que o runner observaria ----------

function decision(overrides: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    understanding: {
      intent: "ticket_status",
      summary: "Quer saber do chamado do notebook",
      entities: { system: null, errorCode: null, os: null, device: "notebook", ticketRef: null },
      signals: { kind: null, category: null, impact: null, blocked: null, deadlineToday: null },
    },
    policies: [
      { name: "OutOfScopePolicy", outcome: "not_applicable" },
      { name: "OverdueTicketPolicy", outcome: "triggered", explanation: "INC-20311 vencido" },
    ],
    actions: [],
    confidence: { value: 0.9, level: "high", reason: "pedido claro" },
    rationale: "O chamado está vencido.",
    outcome: "answered",
    usage: { models: [], inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, latencyMs: 0 },
    createdAt: 0,
    ...overrides,
  };
}

function toolCall(tool: string, overrides: Partial<ToolCallTrace> = {}): ToolCallTrace {
  return {
    tool,
    label: tool,
    inputSummary: "",
    outputSummary: "",
    status: "ok",
    attempts: 1,
    latencyMs: 10,
    ...overrides,
  };
}

function step(
  text: string,
  parts: MessagePart[] = [],
  record: DecisionRecord | null = decision(),
): ObservedStep {
  return { decision: record, reply: { text, parts: [{ type: "text", text }, ...parts] } };
}

const QUIET_FINAL: ObservedFinalState = {
  conversationStatus: "agent",
  handoffReason: null,
  proposedAction: null,
  ticketsCreated: [],
  storedTexts: [],
};

function scenario(steps: ScenarioStep[], final: FinalStateExpectation = {}): Scenario {
  return {
    id: "teste",
    title: "Cenário de teste",
    source: "extra",
    reference: "teste",
    employeeEmail: "mariana.costa@nexo.com.br",
    tickets: { ofEmployee: [], ofOthers: [] },
    steps,
    final,
  };
}

function checkOneTurn(expect: TurnExpectation, observed: ObservedStep): string[] {
  const observedScenario: ObservedScenario = { steps: [observed], final: QUIET_FINAL };
  return checkScenario(scenario([say("E o meu chamado do notebook?", expect)]), observedScenario);
}

// ---------- Testes ----------

describe("checkScenario: cenário cumprido", () => {
  it("não devolve falhas quando tudo bate", () => {
    const expectation: TurnExpectation = {
      outcome: "answered",
      intent: ["ticket_status", "question"],
      confidenceLevel: "high",
      policiesTriggered: ["OverdueTicketPolicy"],
      policiesNotTriggered: ["OutOfScopePolicy"],
      toolsCalled: [{ tool: "listMyTickets", status: "ok", attempts: 1 }],
      toolsForbidden: ["requestHandoff"],
      parts: {
        mustInclude: [{ type: "ticket", code: "INC-20311" }, { type: "quickReplies" }],
        mustNotInclude: [{ type: "handoff" }],
      },
      text: {
        mustMatch: [{ description: "dizer que está vencido", pattern: /vencid/i }],
        mustNotMatch: [{ description: "citar o INC-20388", pattern: /INC-20388/ }],
      },
      mustNotExpose: ["INC-20388"],
    };
    const observed = step(
      "Seu chamado INC-20311 está vencido.",
      [
        { type: "ticket", code: "INC-20311" },
        { type: "quickReplies", options: [{ label: "Chamar analista", value: "sim" }] },
      ],
      decision({ actions: [toolCall("listMyTickets", { outputSummary: "1 chamado: INC-20311" })] }),
    );

    expect(checkOneTurn(expectation, observed)).toEqual([]);
  });

  it("aceita estado final que bate com as expectativas", () => {
    const final: FinalStateExpectation = {
      conversationStatus: "waiting_analyst",
      handoffReason: "critical",
      proposedAction: { kind: "create_ticket", status: "confirmed", priority: "CRITICAL" },
      ticketsCreated: [{ kind: "INC", priority: "CRITICAL", reopenedFrom: null }],
    };
    const observed: ObservedScenario = {
      steps: [step("Rascunho pronto."), { decision: null, reply: null }],
      final: {
        conversationStatus: "waiting_analyst",
        handoffReason: "critical",
        proposedAction: {
          status: "confirmed",
          action: {
            kind: "create_ticket",
            ticket: {
              kind: "INC",
              category: "software",
              title: "Sistema de vendas fora do ar",
              description: "O sistema de vendas caiu para a equipe.",
              affected: "Equipe Comercial",
              prioritySignals: { impact: "team", blocked: true, deadlineToday: false },
              priority: "CRITICAL",
              priorityReason: "Parado para uma equipe/empresa",
            },
          },
        },
        ticketsCreated: [
          {
            code: "INC-20421",
            kind: "INC",
            category: "software",
            priority: "CRITICAL",
            title: "Sistema de vendas fora do ar",
            description: "O sistema de vendas caiu para a equipe.",
          },
        ],
        storedTexts: [],
      },
    };

    expect(checkScenario(scenario([say("Caiu tudo"), confirmDraft()], final), observed)).toEqual(
      [],
    );
  });
});

describe("checkScenario: falhas de turno", () => {
  it("aponta outcome e intenção diferentes", () => {
    const failures = checkOneTurn(
      { outcome: "handoff", intent: ["open_ticket", "update_ticket"] },
      step("Oi"),
    );
    expect(failures).toEqual([
      'Passo 1 ("E o meu chamado do notebook?"): outcome: esperado "handoff", observado "answered".',
      'Passo 1 ("E o meu chamado do notebook?"): intenção: esperado "open_ticket" ou "update_ticket", observado "ticket_status".',
    ]);
  });

  it("aponta o turno sem DecisionRecord", () => {
    const failures = checkOneTurn({ outcome: "answered" }, step("Oi", [], null));
    expect(failures).toEqual([
      'Passo 1 ("E o meu chamado do notebook?"): nenhum DecisionRecord foi registrado para o turno.',
    ]);
  });

  it("aponta política que deveria e que não deveria disparar", () => {
    const failures = checkOneTurn(
      {
        policiesTriggered: ["CriticalPolicy"],
        policiesNotTriggered: ["OverdueTicketPolicy"],
      },
      step("Oi"),
    );
    expect(failures).toEqual([
      'Passo 1 ("E o meu chamado do notebook?"): a política CriticalPolicy deveria ter disparado e não disparou.',
      'Passo 1 ("E o meu chamado do notebook?"): a política OverdueTicketPolicy não deveria ter disparado.',
    ]);
  });

  it("aponta tool ausente, chamada diferente do esperado, proibida e curto-circuito", () => {
    const record = decision({
      actions: [
        toolCall("listMyTickets", { status: "error", attempts: 1 }),
        toolCall("proposeTicketDraft"),
      ],
    });
    const failures = checkOneTurn(
      {
        toolsCalled: [
          { tool: "findSimilarTickets" },
          { tool: "listMyTickets", status: "error", attempts: 3 },
        ],
        toolsForbidden: ["proposeTicketDraft"],
        noToolCalls: true,
      },
      step("Oi", [], record),
    );
    expect(failures).toEqual([
      'Passo 1 ("E o meu chamado do notebook?"): a tool findSimilarTickets deveria ter sido chamada e não foi.',
      'Passo 1 ("E o meu chamado do notebook?"): a tool listMyTickets foi chamada, mas não como esperado (status "error" com 3 tentativa(s)); observado: status "error" com 1 tentativa(s).',
      'Passo 1 ("E o meu chamado do notebook?"): a tool proposeTicketDraft não pode ser chamada neste turno.',
      'Passo 1 ("E o meu chamado do notebook?"): o turno deveria curto-circuitar sem chamar tools, mas chamou: listMyTickets, proposeTicketDraft.',
    ]);
  });

  it("aponta prioridade derivada e nível de confiança", () => {
    const failures = checkOneTurn({ priority: "CRITICAL", confidenceLevel: "low" }, step("Oi"));
    expect(failures).toEqual([
      'Passo 1 ("E o meu chamado do notebook?"): nível de confiança: esperado "low", observado "high".',
      'Passo 1 ("E o meu chamado do notebook?"): prioridade derivada: esperado "CRITICAL", observado "nenhuma".',
    ]);
  });

  it("aponta partes que faltam e partes proibidas", () => {
    const failures = checkOneTurn(
      {
        parts: {
          mustInclude: [
            { type: "article", slug: "vpn-erro-809" },
            { type: "quickReplies", includesLabel: "Windows 11" },
          ],
          mustNotInclude: [{ type: "ticket", code: "INC-20388" }],
        },
      },
      step("Veja", [
        { type: "ticket", code: "INC-20388" },
        { type: "quickReplies", options: [{ label: "Windows 10", value: "10" }] },
      ]),
    );
    expect(failures).toEqual([
      'Passo 1 ("E o meu chamado do notebook?"): a resposta deveria ter o card do artigo "vpn-erro-809".',
      'Passo 1 ("E o meu chamado do notebook?"): a resposta deveria ter a opção rápida "Windows 11".',
      'Passo 1 ("E o meu chamado do notebook?"): a resposta não pode ter o card do chamado INC-20388.',
    ]);
  });

  it("aponta texto que deveria e que não pode aparecer", () => {
    const failures = checkOneTurn(
      {
        text: {
          mustMatch: [{ description: "perguntar se resolveu", pattern: /resolveu/i }],
          mustNotMatch: [{ description: "mandar reinstalar a VPN", pattern: /reinstal/i }],
        },
      },
      step("Reinstale o cliente da VPN."),
    );
    expect(failures).toEqual([
      'Passo 1 ("E o meu chamado do notebook?"): o texto deveria: perguntar se resolveu (padrão /resolveu/i não encontrado).',
      'Passo 1 ("E o meu chamado do notebook?"): o texto não pode: mandar reinstalar a VPN (encontrado "Reinstal").',
    ]);
  });

  it("aponta código exposto no texto, nas partes e na saída de tool", () => {
    const record = decision({
      actions: [toolCall("listMyTickets", { outputSummary: "INC-20311, INC-20388" })],
    });
    const failures = checkOneTurn(
      { mustNotExpose: ["INC-20388"] },
      step(
        "O INC-20388 é do Pedro.",
        [{ type: "ticketSelector", codes: ["INC-20388"], prompt: "" }],
        record,
      ),
    );
    expect(failures).toEqual([
      'Passo 1 ("E o meu chamado do notebook?"): o texto expõe o chamado INC-20388.',
      'Passo 1 ("E o meu chamado do notebook?"): as partes da resposta expõem o chamado INC-20388.',
      'Passo 1 ("E o meu chamado do notebook?"): a saída de uma tool expõe o chamado INC-20388.',
    ]);
  });

  it("aponta opção rápida escolhida que não foi oferecida", () => {
    const observed: ObservedScenario = {
      steps: [step("Qual é o seu Windows?"), step("Vou abrir um chamado.")],
      final: QUIET_FINAL,
    };
    const failures = checkScenario(scenario([say("VPN erro 809"), pick("Windows 11")]), observed);
    expect(failures).toEqual([
      'Passo 2 (escolhe "Windows 11"): a resposta anterior não ofereceu a opção rápida "Windows 11".',
    ]);
  });

  it("aponta passos faltando", () => {
    const failures = checkScenario(scenario([say("Oi"), say("Tchau")]), {
      steps: [step("Olá")],
      final: QUIET_FINAL,
    });
    expect(failures).toEqual(["O roteiro tem 2 passos, mas foram observados 1."]);
  });
});

describe("checkScenario: falhas do estado final", () => {
  function checkFinal(final: FinalStateExpectation, observed: Partial<ObservedFinalState>) {
    return checkScenario(scenario([say("Oi")], final), {
      steps: [step("Olá")],
      final: { ...QUIET_FINAL, ...observed },
    });
  }

  it("aponta status da conversa e transferência", () => {
    expect(
      checkFinal({ conversationStatus: "waiting_analyst", handoffReason: "requested" }, {}),
    ).toEqual([
      'Estado final: status da conversa: esperado "waiting_analyst", observado "agent".',
      'Estado final: motivo da transferência: esperado "requested", observado "nenhum".',
    ]);
    expect(
      checkFinal(
        { handoffReason: null },
        { conversationStatus: "waiting_analyst", handoffReason: "low_confidence" },
      ),
    ).toEqual([
      'Estado final: a conversa não deveria ter sido transferida, mas foi (motivo "low_confidence").',
    ]);
  });

  it("aponta rascunho ausente, de outro tipo e com campos errados", () => {
    expect(
      checkFinal({ proposedAction: { kind: "reopen_ticket", code: "INC-20150" } }, {}),
    ).toEqual([
      'Estado final: deveria haver um rascunho "reopen_ticket", mas nenhum foi proposto.',
    ]);

    const update = {
      proposedAction: {
        status: "pending" as const,
        action: { kind: "update_ticket" as const, code: "INC-20311", text: "Continua lento." },
      },
    };
    expect(
      checkFinal({ proposedAction: { kind: "reopen_ticket", code: "INC-20150" } }, update),
    ).toEqual([
      'Estado final: tipo de rascunho: esperado "reopen_ticket", observado "update_ticket".',
    ]);
    expect(
      checkFinal(
        { proposedAction: { kind: "update_ticket", code: "INC-20395", status: "confirmed" } },
        update,
      ),
    ).toEqual([
      'Estado final: status do rascunho: esperado "confirmed", observado "pending".',
      'Estado final: chamado do rascunho: esperado "INC-20395", observado "INC-20311".',
    ]);
    expect(checkFinal({ proposedAction: null }, update)).toEqual([
      'Estado final: nenhum rascunho deveria ter sido proposto, mas há um "update_ticket".',
    ]);
  });

  it("aponta referência ao chamado antigo e descrição incompleta no rascunho", () => {
    const create = {
      proposedAction: {
        status: "pending" as const,
        action: {
          kind: "create_ticket" as const,
          ticket: {
            kind: "INC" as const,
            category: "network_vpn" as const,
            title: "Wi-Fi caindo na sala 3",
            description: "O Wi-Fi cai na sala 3.",
            affected: "Equipe Comercial",
            prioritySignals: { impact: "team" as const, blocked: false, deadlineToday: false },
            priority: "MEDIUM" as const,
            priorityReason: "Atrapalha, mas há alternativa",
          },
        },
      },
    };
    expect(
      checkFinal(
        {
          proposedAction: {
            kind: "create_ticket",
            category: "hardware",
            reopenedFrom: "INC-20077",
            descriptionMustMatch: [{ description: "citar o cabo", pattern: /cabo/ }],
          },
        },
        create,
      ),
    ).toEqual([
      'Estado final: categoria do rascunho: esperado "hardware", observado "network_vpn".',
      "Estado final: o rascunho deveria referenciar INC-20077, mas não cita nenhum.",
      "Estado final: a descrição do rascunho deveria: citar o cabo (padrão /cabo/ não encontrado).",
    ]);
  });

  it("aponta chamados criados a mais e com campos errados", () => {
    const created = {
      code: "INC-20421",
      kind: "INC" as const,
      category: "software" as const,
      priority: "HIGH" as const,
      reopenedFrom: "INC-20077",
      title: "t",
      description: "d",
    };
    expect(checkFinal({ ticketsCreated: [] }, { ticketsCreated: [created] })).toEqual([
      "Estado final: esperava 0 chamado(s) criado(s), observado 1 (INC-20421).",
    ]);
    expect(
      checkFinal(
        { ticketsCreated: [{ priority: "CRITICAL", reopenedFrom: null }] },
        { ticketsCreated: [created] },
      ),
    ).toEqual([
      'Estado final: prioridade do chamado criado INC-20421: esperado "CRITICAL", observado "HIGH".',
      "Estado final: o chamado criado INC-20421 não deveria referenciar chamado antigo, mas cita INC-20077.",
    ]);
  });

  it("aponta dado sensível gravado", () => {
    expect(
      checkFinal(
        {
          storedDataMustNotMatch: [{ description: "conter a senha colada", pattern: /Nexo@2026/ }],
        },
        { storedTexts: ["minha senha é Nexo@2026"] },
      ),
    ).toEqual([
      'Estado final: o que foi gravado não pode: conter a senha colada (encontrado "Nexo@2026").',
    ]);
  });
});
