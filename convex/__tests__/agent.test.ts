/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { DecisionRecord } from "../../src/domain/decision-record";
import type { PendingAction } from "../../src/domain/pending-action";
import { HISTORY_WINDOW, SUMMARY_EVERY } from "../agent";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");

const SECRET = "segredo-de-teste";
const MARIANA = "mariana.costa@nexo.com.br";

type TestConvex = ReturnType<typeof convexTest>;

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

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const mariana = await loginAs(t, MARIANA);
  const created = await mariana.mutation(api.conversations.create, {});
  if (!created.ok) throw new Error("não criou a conversa");
  const conversationId = created.value.conversationId;

  async function send(text: string): Promise<Id<"messages">> {
    const result = await mariana.mutation(api.messages.sendUserMessage, { conversationId, text });
    if (!result.ok || !result.value.assistantMessageId) throw new Error("envio recusado");
    return result.value.assistantMessageId;
  }

  async function answer(messageId: Id<"messages">, text: string) {
    await t.mutation(api.messages.finalize, {
      secret: SECRET,
      messageId,
      parts: [{ type: "text", text }],
    });
  }

  return { t, conversationId, send, answer };
}

const REOPEN: PendingAction = { kind: "reopen_ticket", code: "INC-20150", reason: "Voltou." };

const RECORD: DecisionRecord = {
  understanding: null,
  policies: [],
  actions: [],
  confidence: null,
  rationale: "Teste.",
  outcome: "answered",
  usage: { models: [], inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, latencyMs: 1 },
  createdAt: 1,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("AGENT_SERVER_SECRET", SECRET);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("loadTurnContext", () => {
  test("traz o funcionário, o estado e o histórico até a mensagem do funcionário", async () => {
    const { t, conversationId, send } = await setup();
    const assistantMessageId = await send("Minha VPN não conecta");

    const context = await t.query(api.agent.loadTurnContext, {
      secret: SECRET,
      conversationId,
      assistantMessageId,
    });

    expect(context?.employee.name).toBe("Mariana Costa");
    expect(context?.conversation).toMatchObject({
      status: "agent",
      clarificationAttempts: 0,
      selectedTicketCode: null,
      pendingHandoffOffer: null,
    });
    expect(context?.pendingDraft).toBeNull();
    // A resposta em streaming fica de fora; a última é a mensagem do funcionário.
    expect(context?.recentMessages.map((m) => m.role)).toEqual(["user"]);
    expect(context?.messagesToSummarize).toEqual([]);
  });

  test("limita a janela às últimas 12 e pede resumo com 10 mensagens fora dele", async () => {
    const { t, conversationId, send, answer } = await setup();
    let assistantMessageId = await send("mensagem 0");
    for (let i = 1; i <= 6; i++) {
      vi.advanceTimersByTime(1000);
      await answer(assistantMessageId, `resposta ${i - 1}`);
      vi.advanceTimersByTime(1000);
      assistantMessageId = await send(`mensagem ${i}`);
    }

    const context = await t.query(api.agent.loadTurnContext, {
      secret: SECRET,
      conversationId,
      assistantMessageId,
    });

    expect(context?.messageCount).toBe(13);
    expect(context?.recentMessages).toHaveLength(HISTORY_WINDOW);
    expect(context?.messagesToSummarize.length).toBeGreaterThanOrEqual(SUMMARY_EVERY);
  });

  test("recusa sem o segredo", async () => {
    const { t, conversationId, send } = await setup();
    const assistantMessageId = await send("oi");
    await expect(
      t.query(api.agent.loadTurnContext, { secret: "errado", conversationId, assistantMessageId }),
    ).rejects.toThrow(/segredo/);
  });
});

describe("createDraft", () => {
  test("numera pelo contador, aponta a conversa e substitui o rascunho pendente", async () => {
    const { t, conversationId } = await setup();

    const first = await t.mutation(api.agent.createDraft, {
      secret: SECRET,
      conversationId,
      action: REOPEN,
      handoffOnConfirm: false,
    });
    const second = await t.mutation(api.agent.createDraft, {
      secret: SECRET,
      conversationId,
      action: REOPEN,
      handoffOnConfirm: true,
    });

    expect(second.draftNumber).toBe(first.draftNumber + 1);
    const rows = await t.run(async (ctx) => ({
      first: await ctx.db.get(first.pendingActionId as Id<"pendingActions">),
      second: await ctx.db.get(second.pendingActionId as Id<"pendingActions">),
      conversation: await ctx.db.get(conversationId),
    }));
    expect(rows.first?.status).toBe("superseded");
    expect(rows.second).toMatchObject({ status: "pending", handoffOnConfirm: true });
    expect(rows.conversation?.pendingActionId).toBe(second.pendingActionId);
  });
});

describe("saveTurnState", () => {
  test("grava o que veio, limpa com null e apaga a nota do analista", async () => {
    const { t, conversationId } = await setup();
    await t.run((ctx) => ctx.db.patch(conversationId, { returnNote: "Já reiniciei o servidor." }));

    await t.mutation(api.agent.saveTurnState, {
      secret: SECRET,
      conversationId,
      selectedTicketCode: "INC-20311",
      clarificationAttempts: 1,
      pendingHandoffOffer: { reason: "overdue", ticketCode: "INC-20311" },
      clearReturnNote: true,
    });
    await t.mutation(api.agent.saveTurnState, {
      secret: SECRET,
      conversationId,
      pendingHandoffOffer: null,
    });

    const conversation = await t.run((ctx) => ctx.db.get(conversationId));
    expect(conversation).toMatchObject({
      selectedTicketCode: "INC-20311",
      clarificationAttempts: 1,
    });
    expect(conversation?.pendingHandoffOffer).toBeUndefined();
    expect(conversation?.returnNote).toBeUndefined();
  });
});

describe("recordDecision e transfer", () => {
  test("grava o registro e transfere com o resumo e o banner", async () => {
    const { t, conversationId, send } = await setup();
    const messageId = await send("Quero falar com uma pessoa");

    const decisionId = await t.mutation(api.agent.recordDecision, {
      secret: SECRET,
      conversationId,
      messageId,
      record: RECORD,
    });
    const transferred = await t.mutation(api.agent.transfer, {
      secret: SECRET,
      conversationId,
      reason: "requested",
      summary: "Pediu um analista.",
    });
    const again = await t.mutation(api.agent.transfer, {
      secret: SECRET,
      conversationId,
      reason: "requested",
      summary: "De novo.",
    });

    expect(transferred).toEqual({ ok: true, value: null });
    expect(again).toEqual({ ok: false, error: "invalid_transition" });
    const state = await t.run(async (ctx) => ({
      decision: await ctx.db.get(decisionId),
      conversation: await ctx.db.get(conversationId),
    }));
    expect(state.decision?.messageId).toBe(messageId);
    expect(state.conversation?.status).toBe("waiting_analyst");
    expect(state.conversation?.handoff).toMatchObject({ reason: "requested" });
  });
});
