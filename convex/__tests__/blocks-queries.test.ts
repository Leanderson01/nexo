/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "../_generated/api";
import schema from "../schema";

// Leituras dos blocos do chat (T7): rascunho e rótulos dos chips, só para o dono da conversa.

const modules = import.meta.glob("../**/*.ts");

const MARIANA = "mariana.costa@nexo.com.br";
const PEDRO = "pedro.santos@nexo.com.br";

type TestConvex = ReturnType<typeof convexTest>;

/** Mesmo helper de guards.test.ts: cria o usuário do Convex Auth e devolve a sessão. */
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

/** A conversa do seed (do Pedro), com o rascunho D-380 já confirmado. */
async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const seeded = await t.run(async (ctx) => {
    const pendingAction = await ctx.db.query("pendingActions").first();
    if (!pendingAction) throw new Error("o seed não criou o rascunho");
    const assistantMessage = await ctx.db
      .query("messages")
      .withIndex("by_conversation_createdAt", (q) =>
        q.eq("conversationId", pendingAction.conversationId),
      )
      .filter((q) => q.eq(q.field("role"), "assistant"))
      .first();
    if (!assistantMessage) throw new Error("o seed não criou a resposta do agent");
    return { pendingActionId: pendingAction._id, messageId: assistantMessage._id };
  });
  return { t, ...seeded };
}

describe("pendingActions.get", () => {
  test("o dono da conversa lê o rascunho com o estado final", async () => {
    const { t, pendingActionId } = await setup();
    const pedro = await loginAs(t, PEDRO);

    const draft = await pedro.query(api.pendingActions.get, { pendingActionId });

    expect(draft).toMatchObject({
      id: pendingActionId,
      draftNumber: 380,
      status: "confirmed",
      resultTicketCode: "INC-20420",
      action: { kind: "create_ticket" },
    });
  });

  test("outro funcionário recebe null, como se não existisse", async () => {
    const { t, pendingActionId } = await setup();
    const mariana = await loginAs(t, MARIANA);

    expect(await mariana.query(api.pendingActions.get, { pendingActionId })).toBeNull();
  });

  test("id malformado devolve null e sem sessão é recusado", async () => {
    const { t, pendingActionId } = await setup();
    const pedro = await loginAs(t, PEDRO);

    expect(await pedro.query(api.pendingActions.get, { pendingActionId: "xyz" })).toBeNull();
    await expect(t.query(api.pendingActions.get, { pendingActionId })).rejects.toThrow();
  });
});

describe("decisions.getActionLabels", () => {
  async function withDecision() {
    const setupResult = await setup();
    await setupResult.t.run(async (ctx) => {
      const message = await ctx.db.get(setupResult.messageId);
      if (!message) throw new Error("mensagem sumiu");
      const decisionId = await ctx.db.insert("decisions", {
        conversationId: message.conversationId,
        messageId: message._id,
        understanding: null,
        policies: [],
        actions: [
          trace("listMyTickets", "consultou seus chamados"),
          trace("searchHelpCenter", "buscou na central de ajuda"),
        ],
        confidence: null,
        rationale: "Teste.",
        outcome: "draft_proposed",
        usage: { models: [], inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, latencyMs: 0 },
        createdAt: Date.now(),
      });
      await ctx.db.patch(message._id, { decisionId });
    });
    return setupResult;
  }

  test("o dono lê só os rótulos, na ordem das ações", async () => {
    const { t, messageId } = await withDecision();
    const pedro = await loginAs(t, PEDRO);

    expect(await pedro.query(api.decisions.getActionLabels, { messageId })).toEqual([
      "consultou seus chamados",
      "buscou na central de ajuda",
    ]);
  });

  test("mensagem sem registro de decisão devolve lista vazia", async () => {
    const { t, messageId } = await setup();
    const pedro = await loginAs(t, PEDRO);

    expect(await pedro.query(api.decisions.getActionLabels, { messageId })).toEqual([]);
  });

  test("outro funcionário recebe null", async () => {
    const { t, messageId } = await withDecision();
    const mariana = await loginAs(t, MARIANA);

    expect(await mariana.query(api.decisions.getActionLabels, { messageId })).toBeNull();
  });
});

function trace(tool: string, label: string) {
  return {
    tool,
    label,
    inputSummary: "",
    outputSummary: "",
    status: "ok" as const,
    attempts: 1,
    latencyMs: 10,
  };
}
