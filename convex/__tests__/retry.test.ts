/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "../_generated/api";
import schema from "../schema";

// "Tentar de novo" (T11): repete o último turno que falhou ou a confirmação do rascunho.

const modules = import.meta.glob("../**/*.ts");

const AGENT_SECRET = "segredo-de-teste";
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

/** Conversa da Mariana com um turno que terminou em erro repetível. */
async function setupFailedTurn() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const mariana = await loginAs(t, MARIANA);
  const created = await mariana.mutation(api.conversations.create, {});
  if (!created.ok) throw new Error("não criou a conversa");
  const conversationId = created.value.conversationId;

  const sent = await mariana.mutation(api.messages.sendUserMessage, {
    conversationId,
    text: "Meu notebook não liga",
  });
  if (!sent.ok || !sent.value.assistantMessageId) throw new Error("envio recusado");
  const failedMessageId = sent.value.assistantMessageId;
  await t.mutation(api.messages.fail, {
    secret: AGENT_SECRET,
    messageId: failedMessageId,
    message: "Não consegui responder agora.",
    retryable: true,
  });

  const loaded = await mariana.query(api.retry.loadForEmployee, { conversationId });
  if (!loaded.ok) throw new Error("não achou a conversa");
  const startArgs = {
    secret: AGENT_SECRET,
    employeeId: loaded.value.employeeId,
    conversationId: conversationId as string,
  };
  return { t, mariana, conversationId, failedMessageId, startArgs };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("AGENT_SERVER_SECRET", AGENT_SECRET);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("retry.start", () => {
  test("turno: nova resposta em streaming com o último texto e o erro deixa de ser repetível", async () => {
    const { t, conversationId, failedMessageId, startArgs } = await setupFailedTurn();

    const started = await t.mutation(api.retry.start, startArgs);

    if (!started.ok || started.value.kind !== "turn") throw new Error("devia repetir o turno");
    const { assistantMessageId, userText } = started.value;
    expect(userText).toBe("Meu notebook não liga");
    const reply = await t.run((ctx) => ctx.db.get(assistantMessageId));
    expect(reply).toMatchObject({ role: "assistant", status: "streaming", parts: [] });
    const conversation = await t.run((ctx) => ctx.db.get(conversationId));
    expect(conversation?.agentBusy).toBe(true);
    const failed = await t.run((ctx) => ctx.db.get(failedMessageId));
    expect(failed?.parts).toEqual([
      { type: "error", message: "Não consegui responder agora.", retryable: false },
    ]);
  });

  test("o timeout de 60 s também vale para o turno repetido", async () => {
    const { t, conversationId, startArgs } = await setupFailedTurn();
    await t.mutation(api.retry.start, startArgs);

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const conversation = await t.run((ctx) => ctx.db.get(conversationId));
    expect(conversation?.agentBusy).toBe(false);
  });

  test("clique duplo: o segundo encontra o turno rodando", async () => {
    const { t, startArgs } = await setupFailedTurn();

    await t.mutation(api.retry.start, startArgs);
    const second = await t.mutation(api.retry.start, startArgs);

    expect(second).toEqual({ ok: false, error: "busy" });
  });

  test("sem erro repetível no fim, não há o que tentar", async () => {
    const { t, failedMessageId, startArgs } = await setupFailedTurn();
    await t.run((ctx) => ctx.db.patch(failedMessageId, { status: "complete", parts: [] }));

    const result = await t.mutation(api.retry.start, startArgs);

    expect(result).toEqual({ ok: false, error: "nothing_to_retry" });
  });

  test("conversa com analista não repete turno", async () => {
    const { t, conversationId, startArgs } = await setupFailedTurn();
    await t.run((ctx) => ctx.db.patch(conversationId, { status: "waiting_analyst" }));

    const result = await t.mutation(api.retry.start, startArgs);

    expect(result).toEqual({ ok: false, error: "not_agent" });
  });

  test("falha ao confirmar o rascunho: o plano é confirmar de novo", async () => {
    const { t, conversationId, failedMessageId, startArgs } = await setupFailedTurn();
    const pendingActionId = await t.run((ctx) =>
      ctx.db.insert("pendingActions", {
        conversationId,
        draftNumber: 381,
        action: { kind: "reopen_ticket", code: "INC-20150", reason: "Bloqueou de novo." },
        status: "pending",
        handoffOnConfirm: false,
        createdAt: Date.now(),
      }),
    );
    await t.run((ctx) => ctx.db.patch(failedMessageId, { failedPendingActionId: pendingActionId }));

    const result = await t.mutation(api.retry.start, startArgs);

    expect(result).toEqual({ ok: true, value: { kind: "confirm", pendingActionId } });
    const conversation = await t.run((ctx) => ctx.db.get(conversationId));
    expect(conversation?.agentBusy).toBe(false);
  });

  test("segredo errado é recusado", async () => {
    const { t, startArgs } = await setupFailedTurn();

    await expect(t.mutation(api.retry.start, { ...startArgs, secret: "chute" })).rejects.toThrow(
      /segredo/,
    );
  });
});
