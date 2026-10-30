import { describe, expect, test } from "vitest";

import {
  computeMetrics,
  confirmedArticle,
  periodStart,
  resolvedWithoutQueue,
  transferReasons,
  type MetricsConversation,
  type MetricsDecision,
  type MetricsMessage,
} from "../metrics";

function decision(overrides: Partial<MetricsDecision> = {}): MetricsDecision {
  return {
    confidence: 0.9,
    costUsd: 0.001,
    latencyMs: 2000,
    shortCircuit: false,
    corrections: [],
    ...overrides,
  };
}

function conversation(overrides: Partial<MetricsConversation> = {}): MetricsConversation {
  return {
    handoffReason: null,
    decisions: [decision()],
    drafts: [],
    articleConfirmed: false,
    ...overrides,
  };
}

const user = (text: string): MetricsMessage => ({ role: "user", parts: [{ type: "text", text }] });
const articleReply: MetricsMessage = {
  role: "assistant",
  parts: [
    { type: "text", text: "Reinicie o cliente da VPN. Isso resolveu?" },
    { type: "article", slug: "vpn-809", title: "VPN erro 809", excerpt: "" },
  ],
};

describe("periodStart", () => {
  const now = Date.UTC(2026, 9, 30, 15, 0);

  test("hoje começa à meia-noite de São Paulo (03:00 UTC)", () => {
    expect(periodStart("today", now)).toBe(Date.UTC(2026, 9, 30, 3, 0));
  });

  test("7 e 30 dias são corridos a partir de agora", () => {
    expect(periodStart("7d", now)).toBe(Date.UTC(2026, 9, 23, 15, 0));
    expect(periodStart("30d", now)).toBe(Date.UTC(2026, 8, 30, 15, 0));
  });
});

describe("confirmedArticle", () => {
  test('"Sim" logo depois do card de artigo confirma', () => {
    expect(confirmedArticle([user("vpn 809"), articleReply, user("Sim")])).toBe(true);
    expect(confirmedArticle([articleReply, user("sim, resolveu!")])).toBe(true);
  });

  test('"Não", "simples" ou "sim" sem artigo antes não confirmam', () => {
    expect(confirmedArticle([articleReply, user("Não")])).toBe(false);
    expect(confirmedArticle([articleReply, user("simples assim não deu")])).toBe(false);
    expect(confirmedArticle([user("oi"), { role: "assistant", parts: [] }, user("Sim")])).toBe(
      false,
    );
  });

  test('só vale a resposta logo depois do artigo: "Sim" dois turnos depois não conta', () => {
    expect(
      confirmedArticle([articleReply, user("Não"), { role: "assistant", parts: [] }, user("Sim")]),
    ).toBe(false);
  });

  test("eventos do sistema entre o artigo e a resposta não atrapalham", () => {
    const event: MetricsMessage = {
      role: "system",
      parts: [{ type: "event", kind: "ticket_updated", ticketCode: "INC-20311" }],
    };
    expect(confirmedArticle([articleReply, event, user("Sim")])).toBe(true);
  });
});

describe("resolvedWithoutQueue (§7.6)", () => {
  test("sem transferência e sem chamado criado: resolvida", () => {
    expect(resolvedWithoutQueue(conversation())).toBe(true);
  });

  test("transferida ou com chamado criado: não resolvida", () => {
    expect(resolvedWithoutQueue(conversation({ handoffReason: "requested" }))).toBe(false);
    expect(
      resolvedWithoutQueue(
        conversation({ drafts: [{ kind: "create_ticket", status: "confirmed" }] }),
      ),
    ).toBe(false);
  });

  test("rascunho de criação pendente, cancelado ou de atualização não é chamado criado", () => {
    const drafts = [
      { kind: "create_ticket", status: "pending" },
      { kind: "create_ticket", status: "cancelled" },
      { kind: "update_ticket", status: "confirmed" },
    ] as const;
    expect(resolvedWithoutQueue(conversation({ drafts: [...drafts] }))).toBe(true);
  });

  test('artigo confirmado com "Sim" conta como resolvida mesmo com chamado ou transferência', () => {
    expect(
      resolvedWithoutQueue(conversation({ handoffReason: "requested", articleConfirmed: true })),
    ).toBe(true);
  });
});

describe("computeMetrics", () => {
  test("sem dados: zeros e médias nulas, sem dividir por zero", () => {
    const metrics = computeMetrics([]);
    expect(metrics.conversations).toBe(0);
    expect(metrics.resolvedWithoutQueue).toEqual({ count: 0, rate: null });
    expect(metrics.averageConfidence).toBeNull();
    expect(metrics.averageCostPerConversationUsd).toBeNull();
    expect(metrics.averageResponseMs).toBeNull();
    expect(metrics.handoffs).toEqual({
      total: 0,
      conversations: 0,
      byReason: { requested: 0, critical: 0, overdue: 0, low_confidence: 0 },
    });
    expect(metrics.correctionsByRule.foreign_ticket_code).toBe(0);
  });

  test("conversa sem decisão e sem transferência (abandonada) fica fora de tudo", () => {
    const metrics = computeMetrics([conversation(), conversation({ decisions: [] })]);
    expect(metrics.conversations).toBe(1);
    expect(metrics.resolvedWithoutQueue).toEqual({ count: 1, rate: 1 });
  });

  test("conversa transferida sem nenhum turno entra nas transferências, mas não no custo", () => {
    const metrics = computeMetrics([
      conversation({ decisions: [decision({ costUsd: 0.004 })] }),
      conversation({ decisions: [], handoffReason: "requested" }),
    ]);
    expect(metrics.conversations).toBe(2);
    expect(metrics.resolvedWithoutQueue.rate).toBe(0.5);
    expect(metrics.handoffs.byReason.requested).toBe(1);
    expect(metrics.averageCostPerConversationUsd).toBeCloseTo(0.004);
  });

  test("taxa, transferências por motivo, rascunhos e duplicados evitados", () => {
    const metrics = computeMetrics([
      conversation(),
      conversation({ handoffReason: "critical" }),
      conversation({ handoffReason: "low_confidence" }),
      conversation({
        drafts: [
          { kind: "update_ticket", status: "superseded" },
          { kind: "update_ticket", status: "confirmed" },
        ],
      }),
      conversation({
        drafts: [
          { kind: "reopen_ticket", status: "cancelled" },
          { kind: "create_ticket", status: "confirmed" },
        ],
      }),
    ]);
    expect(metrics.conversations).toBe(5);
    expect(metrics.resolvedWithoutQueue).toEqual({ count: 2, rate: 0.4 });
    expect(metrics.handoffs.total).toBe(2);
    expect(metrics.handoffs.byReason).toEqual({
      requested: 0,
      critical: 1,
      overdue: 0,
      low_confidence: 1,
    });
    // O rascunho substituído não conta; o cancelado conta (a proposta foi feita).
    expect(metrics.drafts).toEqual({ total: 3, duplicatesAvoided: 2, ticketsCreated: 1 });
  });

  test("médias de confiança (ignora turno sem entendimento), custo e latência", () => {
    const metrics = computeMetrics([
      conversation({
        decisions: [
          decision({ confidence: 0.8, costUsd: 0.002, latencyMs: 1000 }),
          decision({ confidence: null, costUsd: 0, latencyMs: 3000 }),
        ],
      }),
      conversation({
        decisions: [decision({ confidence: 0.6, costUsd: 0.004, latencyMs: 2000 })],
      }),
    ]);
    expect(metrics.turns).toBe(3);
    expect(metrics.averageConfidence).toBeCloseTo(0.7);
    expect(metrics.totalCostUsd).toBeCloseTo(0.006);
    expect(metrics.averageCostPerConversationUsd).toBeCloseTo(0.003);
    expect(metrics.averageResponseMs).toBe(2000);
  });

  test("curtos-circuitos e correções por regra", () => {
    const metrics = computeMetrics([
      conversation({
        decisions: [
          decision({ shortCircuit: true }),
          decision({ corrections: ["foreign_ticket_code", "no_ticket_found_offer"] }),
          decision({ corrections: ["foreign_ticket_code"] }),
        ],
      }),
    ]);
    expect(metrics.shortCircuits).toBe(1);
    expect(metrics.correctionsByRule).toEqual({
      foreign_ticket_code: 2,
      draft_claim_without_draft: 0,
      critical_without_draft: 0,
      no_ticket_found_offer: 1,
      tool_call_as_text: 0,
      empty_reply: 0,
      quick_replies_as_text: 0,
    });
  });
});

describe("transferências por motivo: cada transferência conta", () => {
  const transfer = (reason: "requested" | "critical" | "overdue" | "low_confidence") =>
    ({
      role: "system",
      parts: [
        { type: "handoff", reason, outOfHours: false },
        { type: "event", kind: "transferred" },
      ],
    }) satisfies MetricsMessage;

  test("transferReasons lê o motivo de cada parte handoff, em ordem", () => {
    expect(
      transferReasons([
        user("quero falar com alguém"),
        transfer("requested"),
        { role: "system", parts: [{ type: "event", kind: "returned_to_agent" }] },
        transfer("low_confidence"),
      ]),
    ).toEqual(["requested", "low_confidence"]);
  });

  test("conversa transferida, devolvida e transferida de novo soma as duas", () => {
    const metrics = computeMetrics([
      conversation({ handoffReason: "low_confidence", transfers: ["requested", "low_confidence"] }),
      conversation({ handoffReason: "critical", transfers: ["critical"] }),
    ]);
    expect(metrics.handoffs.total).toBe(3);
    expect(metrics.handoffs.conversations).toBe(2);
    expect(metrics.handoffs.byReason).toEqual({
      requested: 1,
      critical: 1,
      overdue: 0,
      low_confidence: 1,
    });
  });

  test("sem histórico de transferências, conta o último motivo uma vez", () => {
    const metrics = computeMetrics([conversation({ handoffReason: "overdue", transfers: [] })]);
    expect(metrics.handoffs.total).toBe(1);
    expect(metrics.handoffs.byReason.overdue).toBe(1);
  });
});
