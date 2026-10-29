/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { TURN_TIMEOUT_MS } from "../messages";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");

const AGENT_SECRET = "segredo-de-teste";
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

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const mariana = await loginAs(t, MARIANA);
  const created = await mariana.mutation(api.conversations.create, {});
  if (!created.ok) throw new Error("não criou a conversa");
  return { t, mariana, conversationId: created.value.conversationId };
}

async function sendOk(
  client: Awaited<ReturnType<typeof loginAs>>,
  conversationId: Id<"conversations">,
  text: string,
) {
  const result = await client.mutation(api.messages.sendUserMessage, { conversationId, text });
  if (!result.ok) throw new Error(`envio recusado: ${result.error}`);
  return result.value;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("AGENT_SERVER_SECRET", AGENT_SECRET);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("sendUserMessage", () => {
  test("em agent: salva mascarado, cria a resposta em streaming e marca agentBusy", async () => {
    const { t, mariana, conversationId } = await setup();

    const sent = await sendOk(mariana, conversationId, "  minha senha é Abc@12345, não entra  ");

    expect(sent.masked).toBe(true);
    expect(sent.savedText).not.toContain("Abc@12345");
    expect(sent.assistantMessageId).not.toBeNull();

    const messages = await mariana.query(api.messages.list, { conversationId });
    expect(messages?.map((m) => [m.role, m.status])).toEqual([
      ["user", "complete"],
      ["assistant", "streaming"],
    ]);
    expect(messages?.[0].parts).toEqual([{ type: "text", text: sent.savedText }]);

    const conversation = await t.run((ctx) => ctx.db.get(conversationId));
    expect(conversation?.agentBusy).toBe(true);
    expect(conversation?.employeeMessageCount).toBe(1);
    expect(conversation?.subject).toBe(sent.savedText);
  });

  test("recusa conversa alheia, inexistente e id malformado com o mesmo not_found", async () => {
    const { t, conversationId } = await setup();
    const pedro = await loginAs(t, PEDRO);

    for (const id of [conversationId, "id-que-nao-existe"]) {
      const result = await pedro.mutation(api.messages.sendUserMessage, {
        conversationId: id,
        text: "oi",
      });
      expect(result).toEqual({ ok: false, error: "not_found" });
    }
    expect(await pedro.query(api.messages.list, { conversationId })).toBeNull();
    expect(await pedro.query(api.conversations.get, { conversationId })).toBeNull();
  });

  test("recusa conversa encerrada", async () => {
    const { t, mariana, conversationId } = await setup();
    await t.run((ctx) => ctx.db.patch(conversationId, { status: "closed", closedAt: Date.now() }));

    const result = await mariana.mutation(api.messages.sendUserMessage, {
      conversationId,
      text: "oi",
    });
    expect(result).toEqual({ ok: false, error: "closed" });
  });

  test("recusa enquanto o agent responde (agentBusy)", async () => {
    const { mariana, conversationId } = await setup();
    await sendOk(mariana, conversationId, "primeira");

    const result = await mariana.mutation(api.messages.sendUserMessage, {
      conversationId,
      text: "segunda",
    });
    expect(result).toEqual({ ok: false, error: "busy" });
  });

  test("recusa depois de 30 mensagens do funcionário", async () => {
    const { t, mariana, conversationId } = await setup();
    await t.run((ctx) => ctx.db.patch(conversationId, { employeeMessageCount: 30 }));

    const result = await mariana.mutation(api.messages.sendUserMessage, {
      conversationId,
      text: "mais uma",
    });
    expect(result).toEqual({ ok: false, error: "limit_reached" });
  });

  test("recusa mensagem vazia ou só com espaços", async () => {
    const { mariana, conversationId } = await setup();

    const result = await mariana.mutation(api.messages.sendUserMessage, {
      conversationId,
      text: "   \n ",
    });
    expect(result).toEqual({ ok: false, error: "empty" });
  });

  test("com analista: salva a mensagem e não dispara o agent", async () => {
    const { t, mariana, conversationId } = await setup();
    await t.run((ctx) => ctx.db.patch(conversationId, { status: "with_analyst" }));

    const sent = await sendOk(mariana, conversationId, "Ainda está lento.");

    expect(sent.assistantMessageId).toBeNull();
    const messages = await mariana.query(api.messages.list, { conversationId });
    expect(messages?.map((m) => m.role)).toEqual(["user"]);
    const conversation = await t.run((ctx) => ctx.db.get(conversationId));
    expect(conversation?.agentBusy).toBe(false);
  });
});

describe("turno do agent", () => {
  test("appendDelta e finalize montam a resposta e liberam a conversa", async () => {
    const { t, mariana, conversationId } = await setup();
    const { assistantMessageId } = await sendOk(mariana, conversationId, "oi");
    const messageId = assistantMessageId!;

    await t.mutation(api.messages.appendDelta, { secret: AGENT_SECRET, messageId, delta: "Olá, " });
    await t.mutation(api.messages.appendDelta, {
      secret: AGENT_SECRET,
      messageId,
      delta: "Mariana!",
    });
    const finalized = await t.mutation(api.messages.finalize, {
      secret: AGENT_SECRET,
      messageId,
      parts: [{ type: "ticket", code: "INC-20311" }],
    });

    expect(finalized).toBe(true);
    const message = await t.run((ctx) => ctx.db.get(messageId));
    expect(message?.status).toBe("complete");
    expect(message?.parts).toEqual([
      { type: "text", text: "Olá, Mariana!" },
      { type: "ticket", code: "INC-20311" },
    ]);
    const conversation = await t.run((ctx) => ctx.db.get(conversationId));
    expect(conversation?.agentBusy).toBe(false);
  });

  test("fail grava o erro amigável e libera a conversa", async () => {
    const { t, mariana, conversationId } = await setup();
    const { assistantMessageId } = await sendOk(mariana, conversationId, "oi");

    await t.mutation(api.messages.fail, {
      secret: AGENT_SECRET,
      messageId: assistantMessageId!,
      message: "Não consegui responder agora.",
      retryable: true,
    });

    const message = await t.run((ctx) => ctx.db.get(assistantMessageId!));
    expect(message?.status).toBe("error");
    expect(message?.parts).toEqual([
      { type: "error", message: "Não consegui responder agora.", retryable: true },
    ]);
    const conversation = await t.run((ctx) => ctx.db.get(conversationId));
    expect(conversation?.agentBusy).toBe(false);
  });

  test("recusa o segredo errado", async () => {
    const { t, mariana, conversationId } = await setup();
    const { assistantMessageId } = await sendOk(mariana, conversationId, "oi");

    await expect(
      t.mutation(api.messages.appendDelta, {
        secret: "errado",
        messageId: assistantMessageId!,
        delta: "forjado",
      }),
    ).rejects.toThrow("Acesso negado");
    await expect(
      mariana.mutation(api.messages.finalize, {
        secret: "errado",
        messageId: assistantMessageId!,
        parts: [],
      }),
    ).rejects.toThrow("Acesso negado");
  });

  test("ignora escritas em mensagem já finalizada", async () => {
    const { t, mariana, conversationId } = await setup();
    const { assistantMessageId } = await sendOk(mariana, conversationId, "oi");
    const messageId = assistantMessageId!;
    await t.mutation(api.messages.finalize, { secret: AGENT_SECRET, messageId, parts: [] });

    const appended = await t.mutation(api.messages.appendDelta, {
      secret: AGENT_SECRET,
      messageId,
      delta: "atrasado",
    });
    const failed = await t.mutation(api.messages.fail, {
      secret: AGENT_SECRET,
      messageId,
      message: "erro",
      retryable: false,
    });

    expect([appended, failed]).toEqual([false, false]);
    const message = await t.run((ctx) => ctx.db.get(messageId));
    expect(message?.status).toBe("complete");
    expect(message?.parts).toEqual([]);
  });

  test("o timeout de 60 s marca erro e libera agentBusy", async () => {
    const { t, mariana, conversationId } = await setup();
    const { assistantMessageId } = await sendOk(mariana, conversationId, "oi");

    vi.advanceTimersByTime(TURN_TIMEOUT_MS - 1_000);
    const beforeTimeout = await t.run((ctx) => ctx.db.get(assistantMessageId!));
    expect(beforeTimeout?.status).toBe("streaming");

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const message = await t.run((ctx) => ctx.db.get(assistantMessageId!));
    expect(message?.status).toBe("error");
    expect(message?.parts[0]).toMatchObject({ type: "error", retryable: true });
    const conversation = await t.run((ctx) => ctx.db.get(conversationId));
    expect(conversation?.agentBusy).toBe(false);

    // Depois do timeout, o funcionário pode mandar de novo.
    const again = await mariana.mutation(api.messages.sendUserMessage, {
      conversationId,
      text: "de novo",
    });
    expect(again.ok).toBe(true);
  });

  test("o timeout não mexe num turno que já terminou", async () => {
    const { t, mariana, conversationId } = await setup();
    const { assistantMessageId } = await sendOk(mariana, conversationId, "oi");
    await t.mutation(api.messages.finalize, {
      secret: AGENT_SECRET,
      messageId: assistantMessageId!,
      parts: [{ type: "text", text: "pronto" }],
    });

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const message = await t.run((ctx) => ctx.db.get(assistantMessageId!));
    expect(message?.status).toBe("complete");
  });
});

describe("conversas", () => {
  test("create herda o resumo da conversa anterior do mesmo funcionário", async () => {
    const { t, mariana, conversationId } = await setup();
    await t.run((ctx) => ctx.db.patch(conversationId, { rollingSummary: "Falamos da VPN." }));

    const created = await mariana.mutation(api.conversations.create, {
      inheritSummaryFrom: conversationId,
    });
    if (!created.ok) throw new Error("não criou");
    const inherited = await t.run((ctx) => ctx.db.get(created.value.conversationId));
    expect(inherited?.rollingSummary).toBe("Falamos da VPN.");

    const pedro = await loginAs(t, PEDRO);
    const stolen = await pedro.mutation(api.conversations.create, {
      inheritSummaryFrom: conversationId,
    });
    expect(stolen).toEqual({ ok: false, error: "not_found" });
  });

  test("get devolve o limite e o analista; listMine só traz as do funcionário", async () => {
    const { t, mariana, conversationId } = await setup();
    const ana = await t.run((ctx) =>
      ctx.db
        .query("people")
        .withIndex("by_email", (q) => q.eq("email", "ana.ribeiro@nexo.com.br"))
        .unique(),
    );
    await t.run((ctx) =>
      ctx.db.patch(conversationId, { status: "with_analyst", assignedAnalystId: ana!._id }),
    );

    const conversation = await mariana.query(api.conversations.get, { conversationId });
    expect(conversation?.messageLimit).toBe(30);
    expect(conversation?.analyst).toEqual({ name: "Ana Ribeiro", level: "N1" });

    const mine = await mariana.query(api.conversations.listMine, {});
    expect(mine.map((c) => c._id)).toEqual([conversationId]);
  });

  test("requestAnalyst transfere a conversa e registra o evento", async () => {
    const { mariana, conversationId } = await setup();

    const result = await mariana.mutation(api.conversations.requestAnalyst, { conversationId });

    expect(result).toEqual({ ok: true, value: null });
    const conversation = await mariana.query(api.conversations.get, { conversationId });
    expect(conversation?.status).toBe("waiting_analyst");
    const messages = await mariana.query(api.messages.list, { conversationId });
    expect(messages?.at(-1)?.parts).toContainEqual({ type: "event", kind: "transferred" });

    const again = await mariana.mutation(api.conversations.requestAnalyst, { conversationId });
    expect(again).toEqual({ ok: false, error: "invalid_transition" });
  });
});
