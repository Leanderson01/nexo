/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { DecisionRecord } from "../../src/domain/decision-record";
import type { HandoffReason } from "../../src/domain/enums";
import type { MessagePart } from "../../src/domain/message-parts";
import type { PendingAction } from "../../src/domain/pending-action";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";

// Painel de métricas (T17, §7.6): a query lê conversas, turnos, rascunhos e mensagens e
// entrega as regras de src/domain/metrics.ts. Aqui: só analista, a leitura do banco e o período.

const modules = import.meta.glob("../**/*.ts");

const ANA = "ana.ribeiro@nexo.com.br";
const PEDRO = "pedro.santos@nexo.com.br";
const RAFAEL = "rafael.lima@nexo.com.br";
const DAY = 24 * 60 * 60 * 1000;

function newTest() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof newTest>;

async function loginAs(t: TestConvex, email: string) {
  const subject = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email });
    const sessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + 60_000,
    });
    return `${userId}|${sessionId}`;
  });
  return t.withIdentity({ subject });
}

async function personId(t: TestConvex, email: string): Promise<Id<"people">> {
  return await t.run(async (ctx) => {
    const person = await ctx.db
      .query("people")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!person) throw new Error(`pessoa ${email} não está no seed`);
    return person._id;
  });
}

function decisionRecord(overrides: Partial<DecisionRecord>): DecisionRecord {
  return {
    understanding: null,
    policies: [],
    actions: [],
    confidence: { value: 0.8, level: "high", reason: "Teste." },
    rationale: "Teste.",
    outcome: "answered",
    usage: {
      models: [],
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0.002,
      latencyMs: 3000,
    },
    createdAt: Date.now(),
    ...overrides,
  };
}

interface FakeConversation {
  handoff?: HandoffReason;
  /** Mensagens em ordem; cada resposta do agent ganha um turno com o registro dado. */
  messages: { role: Doc<"messages">["role"]; parts: MessagePart[]; decision?: DecisionRecord }[];
  drafts?: { action: PendingAction; status: Doc<"pendingActions">["status"] }[];
}

async function insertConversation(t: TestConvex, employeeId: Id<"people">, fake: FakeConversation) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const conversationId = await ctx.db.insert("conversations", {
      employeeId,
      status: fake.handoff ? "waiting_analyst" : "agent",
      handoff: fake.handoff ? { reason: fake.handoff, summary: "Resumo.", at: now } : undefined,
      employeeMessageCount: 1,
      agentBusy: false,
      clarificationAttempts: 0,
      lastMessageAt: now,
    });
    for (const [index, message] of fake.messages.entries()) {
      const messageId = await ctx.db.insert("messages", {
        conversationId,
        role: message.role,
        parts: message.parts,
        status: "complete",
        createdAt: now + index,
      });
      if (message.decision) {
        await ctx.db.insert("decisions", { conversationId, messageId, ...message.decision });
      }
    }
    for (const [index, draft] of (fake.drafts ?? []).entries()) {
      await ctx.db.insert("pendingActions", {
        conversationId,
        draftNumber: 900 + index,
        action: draft.action,
        status: draft.status,
        handoffOnConfirm: false,
        createdAt: now,
      });
    }
  });
}

const text = (value: string): MessagePart[] => [{ type: "text", text: value }];
const article: MessagePart = { type: "article", slug: "vpn", title: "VPN", excerpt: "" };

/** Banco sem a conversa do seed: os números saem só do que cada teste insere. */
async function emptySetup() {
  const t = newTest();
  await t.mutation(internal.seed.run, {});
  await t.run(async (ctx) => {
    for (const conversation of await ctx.db.query("conversations").collect()) {
      await ctx.db.delete(conversation._id);
    }
  });
  return t;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("metrics.dashboard", () => {
  test("só analista", async () => {
    const t = await emptySetup();
    const pedro = await loginAs(t, PEDRO);
    await expect(pedro.query(api.metrics.dashboard, { period: "today" })).rejects.toThrow(
      /analistas/,
    );
  });

  test("sem conversas: zeros e médias nulas", async () => {
    const t = await emptySetup();
    const ana = await loginAs(t, ANA);
    const { metrics, truncated } = await ana.query(api.metrics.dashboard, { period: "7d" });
    expect(truncated).toBe(false);
    expect(metrics.conversations).toBe(0);
    expect(metrics.resolvedWithoutQueue.rate).toBeNull();
    expect(metrics.averageResponseMs).toBeNull();
  });

  test("lê turnos, rascunhos e a confirmação do artigo de cada conversa", async () => {
    const t = await emptySetup();
    const rafael = await personId(t, RAFAEL);

    // 1. Dúvida resolvida pelo artigo, sem fila.
    await insertConversation(t, rafael, {
      messages: [
        { role: "user", parts: text("vpn 809") },
        {
          role: "assistant",
          parts: [...text("Isso resolveu?"), article],
          decision: decisionRecord({}),
        },
        { role: "user", parts: text("Sim") },
      ],
    });
    // 2. Transferida (crítico) depois de "Sim" ao artigo: conta como resolvida (§7.6, o "ou").
    await insertConversation(t, rafael, {
      handoff: "critical",
      messages: [
        { role: "assistant", parts: [article], decision: decisionRecord({ shortCircuit: true }) },
        { role: "user", parts: text("sim, resolveu") },
      ],
    });
    // 3. Chamado criado e atualização proposta (duplicado evitado), sem "Sim".
    await insertConversation(t, rafael, {
      messages: [
        {
          role: "assistant",
          parts: text("Confira o rascunho."),
          decision: decisionRecord({
            confidence: { value: 0.4, level: "low", reason: "Teste." },
            usage: {
              models: [],
              inputTokens: 0,
              outputTokens: 0,
              estimatedCostUsd: 0.004,
              latencyMs: 6000,
            },
            corrections: [{ rule: "draft_claim_without_draft", explanation: "Teste." }],
          }),
        },
      ],
      drafts: [
        {
          action: { kind: "update_ticket", code: "INC-20402", text: "Mais detalhes." },
          status: "cancelled",
        },
        {
          action: {
            kind: "create_ticket",
            ticket: {
              kind: "INC",
              category: "hardware",
              priority: "LOW",
              priorityReason: "Teste.",
              prioritySignals: { impact: "individual", blocked: false, deadlineToday: false },
              title: "Teclado",
              description: "Teclado falhando.",
              affected: "Somente você",
            },
          },
          status: "confirmed",
        },
      ],
    });
    // 4. Aberta e abandonada antes da primeira resposta: fica de fora.
    await insertConversation(t, rafael, { messages: [{ role: "user", parts: text("oi") }] });

    const ana = await loginAs(t, ANA);
    const { metrics } = await ana.query(api.metrics.dashboard, { period: "today" });

    expect(metrics.conversations).toBe(3);
    expect(metrics.resolvedWithoutQueue).toEqual({ count: 2, rate: 2 / 3 });
    expect(metrics.handoffs.byReason.critical).toBe(1);
    expect(metrics.drafts).toEqual({ total: 2, duplicatesAvoided: 1, ticketsCreated: 1 });
    expect(metrics.turns).toBe(3);
    expect(metrics.averageConfidence).toBeCloseTo((0.8 + 0.8 + 0.4) / 3);
    expect(metrics.averageCostPerConversationUsd).toBeCloseTo(0.008 / 3);
    expect(metrics.averageResponseMs).toBe(4000);
    expect(metrics.shortCircuits).toBe(1);
    expect(metrics.correctionsByRule.draft_claim_without_draft).toBe(1);
  });

  test("o período conta pela criação da conversa", async () => {
    const t = await emptySetup();
    const rafael = await personId(t, RAFAEL);
    const turn = { role: "assistant" as const, parts: text("Oi."), decision: decisionRecord({}) };

    await insertConversation(t, rafael, { messages: [turn] });
    const ana = await loginAs(t, ANA);
    const count = async (period: "today" | "7d" | "30d") =>
      (await ana.query(api.metrics.dashboard, { period })).metrics.conversations;
    expect(await count("today")).toBe(1);

    // Dez dias depois, a conversa saiu de "hoje" e de "7 dias", mas segue em "30 dias".
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 10 * DAY);
    expect(await count("today")).toBe(0);
    expect(await count("7d")).toBe(0);
    expect(await count("30d")).toBe(1);
  });
});
