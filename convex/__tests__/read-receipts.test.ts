/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

// Confirmação de leitura (UX1): quem confirma o quê, idempotência e ausência de brecha.

const modules = import.meta.glob("../**/*.ts");

const SECRET = "segredo-de-teste";
const MARIANA = "mariana.costa@nexo.com.br";
const RAFAEL = "rafael.lima@nexo.com.br";
const ANA = "ana.ribeiro@nexo.com.br";
const CARLOS = "carlos.mendes@nexo.com.br";

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

  async function send(text: string) {
    const result = await mariana.mutation(api.messages.sendUserMessage, { conversationId, text });
    if (!result.ok) throw new Error(`envio recusado: ${result.error}`);
    return result.value;
  }

  async function userReceipt(): Promise<string | null> {
    const messages = await mariana.query(api.messages.list, { conversationId });
    return messages?.findLast((message) => message.role === "user")?.receipt ?? null;
  }

  async function conversationDoc() {
    return await t.run(async (ctx) => ctx.db.get(conversationId));
  }

  return { t, mariana, conversationId, send, userReceipt, conversationDoc };
}

/** Passa a conversa para a fila dos analistas, como o agent faz numa transferência. */
async function transfer(t: TestConvex, conversationId: Id<"conversations">) {
  await t.mutation(api.agent.transfer, {
    secret: SECRET,
    conversationId,
    reason: "requested",
    summary: "Quer falar com uma pessoa.",
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("AGENT_SERVER_SECRET", SECRET);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("mensagem do funcionário para o agent", () => {
  test("✓ salva → ✓✓ chegou (contexto carregado) → ✓✓ azul (ENTENDER)", async () => {
    const { t, send, userReceipt } = await setup();
    const sent = await send("A VPN caiu");
    if (!sent.assistantMessageId) throw new Error("o turno não começou");
    expect(await userReceipt()).toBe("sent");

    vi.advanceTimersByTime(5);
    await t.mutation(api.agent.markUserMessageDelivered, {
      secret: SECRET,
      assistantMessageId: sent.assistantMessageId,
    });
    expect(await userReceipt()).toBe("delivered");

    await t.mutation(api.agent.markUserMessageRead, {
      secret: SECRET,
      assistantMessageId: sent.assistantMessageId,
    });
    expect(await userReceipt()).toBe("read");
  });

  test("é idempotente: confirmar de novo não escreve", async () => {
    const { t, send, conversationDoc } = await setup();
    const sent = await send("A VPN caiu");
    if (!sent.assistantMessageId) throw new Error("o turno não começou");
    const args = { secret: SECRET, assistantMessageId: sent.assistantMessageId };

    await t.mutation(api.agent.markUserMessageRead, args);
    const first = await conversationDoc();
    vi.advanceTimersByTime(1_000);
    await t.mutation(api.agent.markUserMessageRead, args);
    await t.mutation(api.agent.markUserMessageDelivered, args);
    const second = await conversationDoc();

    expect(second?.agentReadAt).toBe(first?.agentReadAt);
    expect(second?.agentDeliveredAt).toBe(first?.agentDeliveredAt);
  });

  test("sem o segredo do servidor, recusa", async () => {
    const { t, mariana, send } = await setup();
    const sent = await send("A VPN caiu");
    if (!sent.assistantMessageId) throw new Error("o turno não começou");

    await expect(
      t.mutation(api.agent.markUserMessageRead, {
        secret: "errado",
        assistantMessageId: sent.assistantMessageId,
      }),
    ).rejects.toThrow(/segredo/);
    await expect(
      mariana.mutation(api.agent.markUserMessageDelivered, {
        secret: "",
        assistantMessageId: sent.assistantMessageId,
      }),
    ).rejects.toThrow(/segredo/);
  });
});

describe("mensagem do funcionário para o analista", () => {
  async function setupWithAnalyst() {
    const context = await setup();
    await transfer(context.t, context.conversationId);
    vi.advanceTimersByTime(10);
    const sent = await context.send("Ainda sem VPN");
    return { ...context, sent };
  }

  test("o receptor é o analista: o turno não começa", async () => {
    const { sent, t } = await setupWithAnalyst();
    expect(sent.assistantMessageId).toBeNull();
    const saved = await t.run(async (ctx) => ctx.db.get(sent.userMessageId));
    expect(saved?.receiver).toBe("analyst");
  });

  test("a fila de quem pode atender pede a confirmação; chegou e depois leu", async () => {
    const { t, conversationId, userReceipt } = await setupWithAnalyst();
    const ana = await loginAs(t, ANA);

    const queue = await ana.query(api.console.listConversations, { tab: "for_you" });
    const pending = queue.undelivered.find((entry) => entry.conversationId === conversationId);
    if (!pending) throw new Error("a fila não pediu a confirmação");
    expect(await userReceipt()).toBe("sent");

    await ana.mutation(api.console.markDelivered, { conversationId, upTo: pending.upTo });
    expect(await userReceipt()).toBe("delivered");
    const after = await ana.query(api.console.listConversations, { tab: "for_you" });
    expect(after.undelivered.some((entry) => entry.conversationId === conversationId)).toBe(false);

    vi.advanceTimersByTime(10);
    await ana.mutation(api.console.markRead, { conversationId });
    expect(await userReceipt()).toBe("read");
  });

  test("com outro analista atendendo, a confirmação de quem só acompanha não vale", async () => {
    const { t, conversationId, userReceipt } = await setupWithAnalyst();
    const ana = await loginAs(t, ANA);
    const carlos = await loginAs(t, CARLOS);
    await ana.mutation(api.console.assign, { conversationId });
    vi.advanceTimersByTime(10);
    await t.run(async (ctx) => {
      // Mensagem nova depois de a Ana assumir (e ler).
      const conversation = await ctx.db.get(conversationId);
      if (!conversation) throw new Error("sem conversa");
      await ctx.db.insert("messages", {
        conversationId,
        role: "user",
        authorId: conversation.employeeId,
        parts: [{ type: "text", text: "Alô?" }],
        status: "complete",
        receiver: "analyst",
        createdAt: Date.now(),
      });
    });
    vi.advanceTimersByTime(10);

    const carlosQueue = await carlos.query(api.console.listConversations, { tab: "all" });
    expect(carlosQueue.undelivered.some((entry) => entry.conversationId === conversationId)).toBe(
      false,
    );
    await carlos.mutation(api.console.markDelivered, { conversationId, upTo: Date.now() });
    await carlos.mutation(api.console.markRead, { conversationId });
    expect(await userReceipt()).toBe("sent");
  });

  test("funcionário não confirma pelo analista, e sem sessão nada passa", async () => {
    const { t, mariana, conversationId } = await setupWithAnalyst();
    await expect(
      mariana.mutation(api.console.markDelivered, { conversationId, upTo: Date.now() }),
    ).rejects.toThrow(/analistas/);
    await expect(
      t.mutation(api.console.markDelivered, { conversationId, upTo: Date.now() }),
    ).rejects.toThrow(/Sessão/);
  });

  test("a marca não passa de agora (o cliente não confirma o futuro)", async () => {
    const { t, conversationId, conversationDoc } = await setupWithAnalyst();
    const ana = await loginAs(t, ANA);
    const future = Date.now() + 60 * 60_000;
    await ana.mutation(api.console.markDelivered, { conversationId, upTo: future });
    const deliveredAt = (await conversationDoc())?.analystDeliveredAt ?? future;
    // O relógio da mutation pode andar 1 ms; o que importa é não aceitar a hora pedida.
    expect(deliveredAt).toBeLessThan(Date.now() + 1_000);
  });
});

describe("respostas para o funcionário", () => {
  async function setupWithReply() {
    const context = await setup();
    const sent = await context.send("A VPN caiu");
    if (!sent.assistantMessageId) throw new Error("o turno não começou");
    await context.t.mutation(api.messages.finalize, {
      secret: SECRET,
      messageId: sent.assistantMessageId,
      parts: [{ type: "text", text: "Vamos ver." }],
    });
    const ana = await loginAs(context.t, ANA);

    async function replyReceipt() {
      const messages = await ana.query(api.console.listMessages, {
        conversationId: context.conversationId,
      });
      return messages?.findLast((message) => message.role === "assistant")?.receipt ?? null;
    }
    return { ...context, assistantMessageId: sent.assistantMessageId, replyReceipt };
  }

  test("o console vê ✓, ✓✓ quando o chat recebe e azul quando o funcionário lê", async () => {
    const { t, mariana, conversationId, replyReceipt } = await setupWithReply();
    const createdAt = await t.run(
      async (ctx) =>
        (
          await ctx.db
            .query("messages")
            .withIndex("by_conversation_createdAt", (q) => q.eq("conversationId", conversationId))
            .order("desc")
            .first()
        )?.createdAt ?? 0,
    );
    vi.advanceTimersByTime(10);
    expect(await replyReceipt()).toBe("sent");

    await mariana.mutation(api.messages.markDelivered, { conversationId, upTo: createdAt });
    expect(await replyReceipt()).toBe("delivered");

    await mariana.mutation(api.messages.markRead, { conversationId, upTo: createdAt });
    expect(await replyReceipt()).toBe("read");
  });

  test("o chat aberto em outra conversa confirma o chegou; o leu continua da conversa aberta", async () => {
    const { t, mariana, conversationId, replyReceipt } = await setupWithReply();
    vi.advanceTimersByTime(10);
    expect(await replyReceipt()).toBe("sent");

    // A lista do chat (qualquer conversa aberta) aponta a resposta que falta confirmar.
    const pending = await mariana.query(api.messages.listUndelivered, {});
    const entry = pending.find((item) => item.conversationId === conversationId);
    if (!entry) throw new Error("a resposta não apareceu para confirmar");
    await mariana.mutation(api.messages.markDelivered, entry);
    expect(await replyReceipt()).toBe("delivered");
    expect(
      (await mariana.query(api.messages.listUndelivered, {})).some(
        (item) => item.conversationId === conversationId,
      ),
    ).toBe(false);

    // Outro funcionário não vê as conversas da Mariana.
    const rafael = await loginAs(t, RAFAEL);
    expect(await rafael.query(api.messages.listUndelivered, {})).toEqual([]);
  });

  test("streaming não leva ✓", async () => {
    const { t, send, conversationId } = await setup();
    await send("A VPN caiu");
    const ana = await loginAs(t, ANA);
    const messages = await ana.query(api.console.listMessages, { conversationId });
    expect(messages?.at(-1)?.status).toBe("streaming");
    expect(messages?.at(-1)?.receipt).toBeNull();
  });

  test("é idempotente e só anda para a frente", async () => {
    const { mariana, conversationId, conversationDoc } = await setupWithReply();
    vi.advanceTimersByTime(10);
    const now = Date.now();
    await mariana.mutation(api.messages.markRead, { conversationId, upTo: now });
    await mariana.mutation(api.messages.markRead, { conversationId, upTo: now - 5 });
    await mariana.mutation(api.messages.markDelivered, { conversationId, upTo: now - 5 });
    const conversation = await conversationDoc();
    expect(conversation?.employeeReadAt).toBe(now);
    expect(conversation?.employeeDeliveredAt).toBe(now);
  });

  test("só o dono da conversa confirma; outro funcionário não muda nada", async () => {
    const { t, conversationId, conversationDoc } = await setupWithReply();
    const rafael = await loginAs(t, RAFAEL);
    await rafael.mutation(api.messages.markRead, { conversationId, upTo: Date.now() });
    await rafael.mutation(api.messages.markDelivered, { conversationId, upTo: Date.now() });
    const conversation = await conversationDoc();
    expect(conversation?.employeeReadAt).toBeUndefined();
    expect(conversation?.employeeDeliveredAt).toBeUndefined();
  });

  test("analista não confirma pelo funcionário, e sem sessão nada passa", async () => {
    const { t, conversationId } = await setupWithReply();
    const ana = await loginAs(t, ANA);
    await expect(
      ana.mutation(api.messages.markRead, { conversationId, upTo: Date.now() }),
    ).rejects.toThrow(/funcionários/);
    await expect(
      t.mutation(api.messages.markDelivered, { conversationId, upTo: Date.now() }),
    ).rejects.toThrow(/Sessão/);
  });
});
