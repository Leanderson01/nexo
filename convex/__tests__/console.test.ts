/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import type { HandoffReason } from "../../src/domain/enums";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

// Console do analista (T12): fila, conversa, assumir, responder, devolver e encerrar.

const modules = import.meta.glob("../**/*.ts");

const ANA = "ana.ribeiro@nexo.com.br";
const CARLOS = "carlos.mendes@nexo.com.br";
const PEDRO = "pedro.santos@nexo.com.br";
const MARIANA = "mariana.costa@nexo.com.br";
const RAFAEL = "rafael.lima@nexo.com.br";
const JULIANA = "juliana.alves@nexo.com.br";

const MINUTE = 60_000;

function newTest() {
  return convexTest(schema, modules);
}
type TestConvex = ReturnType<typeof newTest>;

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

/** O seed já traz a conversa do Pedro aguardando analista (crítico INC-20420). */
async function setup() {
  const t = newTest();
  await t.mutation(internal.seed.run, {});
  const pedroConversationId = await t.run(async (ctx) => {
    const conversation = await ctx.db.query("conversations").first();
    if (!conversation) throw new Error("o seed não criou a conversa do Pedro");
    return conversation._id;
  });
  return { t, pedroConversationId };
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

/** Conversa de outro funcionário, num estado escolhido, com uma mensagem dele. */
async function insertConversation(
  t: TestConvex,
  email: string,
  options: {
    status: "agent" | "waiting_analyst" | "closed";
    reason?: HandoffReason;
    minutesAgo: number;
    text: string;
  },
): Promise<Id<"conversations">> {
  const employeeId = await personId(t, email);
  return await t.run(async (ctx) => {
    const at = Date.now() - options.minutesAgo * MINUTE;
    const conversationId = await ctx.db.insert("conversations", {
      employeeId,
      status: options.status,
      handoff: options.reason
        ? { reason: options.reason, summary: "Resumo do caso.", at }
        : undefined,
      subject: options.text,
      employeeMessageCount: 1,
      agentBusy: false,
      clarificationAttempts: 0,
      lastMessageAt: at,
    });
    await ctx.db.insert("messages", {
      conversationId,
      role: "user",
      authorId: employeeId,
      parts: [{ type: "text", text: options.text }],
      status: "complete",
      createdAt: at - 1,
    });
    return conversationId;
  });
}

/** Assumir também marca como lido: a mensagem seguinte precisa cair em outro milissegundo. */
async function nextMillisecond() {
  await new Promise((resolve) => setTimeout(resolve, 2));
}

async function conversationStatus(t: TestConvex, conversationId: Id<"conversations">) {
  return await t.run(async (ctx) => (await ctx.db.get(conversationId))?.status);
}

async function lastEvent(t: TestConvex, conversationId: Id<"conversations">) {
  return await t.run(async (ctx) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation_createdAt", (q) => q.eq("conversationId", conversationId))
      .order("desc")
      .collect();
    return messages.find((message) => message.role === "system")?.parts[0];
  });
}

describe("acesso", () => {
  test("só analista usa as funções do console", async () => {
    const { t, pedroConversationId } = await setup();
    const pedro = await loginAs(t, PEDRO);

    await expect(pedro.query(api.console.listConversations, { tab: "all" })).rejects.toThrow(
      "Acesso restrito a analistas.",
    );
    await expect(
      pedro.query(api.console.getConversation, { conversationId: pedroConversationId }),
    ).rejects.toThrow("Acesso restrito a analistas.");
    await expect(
      pedro.mutation(api.console.assign, { conversationId: pedroConversationId }),
    ).rejects.toThrow("Acesso restrito a analistas.");
    await expect(t.query(api.console.listConversations, { tab: "all" })).rejects.toThrow(
      "Sessão expirada",
    );
  });
});

describe("listConversations", () => {
  async function setupQueue() {
    const context = await setup();
    const { t } = context;
    const mariana = await insertConversation(t, MARIANA, {
      status: "waiting_analyst",
      reason: "requested",
      minutesAgo: 90,
      text: "Quero falar com uma pessoa sobre a VPN",
    });
    const rafael = await insertConversation(t, RAFAEL, {
      status: "agent",
      minutesAgo: 5,
      text: "Como troco minha senha?",
    });
    const juliana = await insertConversation(t, JULIANA, {
      status: "closed",
      reason: "overdue",
      minutesAgo: 600,
      text: "Meu monitor não chegou",
    });
    return { ...context, mariana, rafael, juliana };
  }

  test("críticas primeiro, depois quem espera há mais tempo; com o agent no fim", async () => {
    const { t, pedroConversationId, mariana, rafael } = await setupQueue();
    const ana = await loginAs(t, ANA);

    const { items } = await ana.query(api.console.listConversations, { tab: "all" });

    // Pedro (crítico, 32 min) vem antes da Mariana (pedido, 90 min); a encerrada não entra.
    expect(items.map((item) => item._id)).toEqual([pedroConversationId, mariana, rafael]);
    expect(items[0]).toMatchObject({
      employeeName: "Pedro Santos",
      status: "waiting_analyst",
      reason: "critical",
      ticket: { code: "INC-20420", priority: "CRITICAL" },
      lastMessage: { role: "assistant" },
      unread: 0,
    });
  });

  test("abas filtram e os contadores são os totais", async () => {
    const { t, rafael, juliana } = await setupQueue();
    const ana = await loginAs(t, ANA);

    const withAgent = await ana.query(api.console.listConversations, { tab: "with_agent" });
    const closed = await ana.query(api.console.listConversations, { tab: "closed" });

    expect(withAgent.items.map((item) => item._id)).toEqual([rafael]);
    expect(closed.items.map((item) => item._id)).toEqual([juliana]);
    expect(withAgent.counts).toEqual({
      all: 3,
      for_you: 2,
      with_agent: 1,
      mine: 0,
      closed: 1,
    });
  });

  test("filtra por motivo", async () => {
    const { t, mariana } = await setupQueue();
    const ana = await loginAs(t, ANA);

    const { items } = await ana.query(api.console.listConversations, {
      tab: "all",
      reason: "requested",
    });

    expect(items.map((item) => item._id)).toEqual([mariana]);
  });

  test("busca por nome sem acento e maiúscula, ou pelo código do chamado", async () => {
    const { t, pedroConversationId, juliana } = await setupQueue();
    const ana = await loginAs(t, ANA);

    const byName = await ana.query(api.console.listConversations, {
      tab: "closed",
      search: "JULIÁNA",
    });
    const byCode = await ana.query(api.console.listConversations, {
      tab: "all",
      search: "inc-20420",
    });

    expect(byName.items.map((item) => item._id)).toEqual([juliana]);
    expect(byCode.items.map((item) => item._id)).toEqual([pedroConversationId]);
  });

  test("'Minhas' traz só o que o analista assumiu", async () => {
    const { t, pedroConversationId } = await setupQueue();
    const ana = await loginAs(t, ANA);
    const carlos = await loginAs(t, CARLOS);
    await ana.mutation(api.console.assign, { conversationId: pedroConversationId });

    const anaMine = await ana.query(api.console.listConversations, { tab: "mine" });
    const carlosMine = await carlos.query(api.console.listConversations, { tab: "mine" });

    expect(anaMine.items.map((item) => item._id)).toEqual([pedroConversationId]);
    expect(anaMine.items[0]).toMatchObject({ isMine: true, assignedAnalystName: "Ana Ribeiro" });
    expect(carlosMine.items).toEqual([]);
  });
});

describe("não lidas", () => {
  test("contam as mensagens do funcionário depois da transferência e da última leitura", async () => {
    const { t, pedroConversationId } = await setup();
    const ana = await loginAs(t, ANA);
    const pedro = await loginAs(t, PEDRO);
    const unread = async () => {
      const { items } = await ana.query(api.console.listConversations, { tab: "for_you" });
      return items[0]?.unread;
    };

    expect(await unread()).toBe(0);
    for (const text of ["Alguém aí?", "Continua parado."]) {
      await pedro.mutation(api.messages.sendUserMessage, {
        conversationId: pedroConversationId,
        text,
      });
    }
    expect(await unread()).toBe(2);

    await ana.mutation(api.console.markRead, { conversationId: pedroConversationId });
    expect(await unread()).toBe(0);
  });

  test("quem só acompanha uma conversa de outro analista não marca como lida", async () => {
    const { t, pedroConversationId } = await setup();
    const ana = await loginAs(t, ANA);
    const carlos = await loginAs(t, CARLOS);
    const pedro = await loginAs(t, PEDRO);
    await ana.mutation(api.console.assign, { conversationId: pedroConversationId });
    await nextMillisecond();
    await pedro.mutation(api.messages.sendUserMessage, {
      conversationId: pedroConversationId,
      text: "Ok, aguardando.",
    });

    await carlos.mutation(api.console.markRead, { conversationId: pedroConversationId });

    const { items } = await ana.query(api.console.listConversations, { tab: "mine" });
    expect(items[0]?.unread).toBe(1);
  });
});

describe("getConversation e listMessages", () => {
  test("trazem o funcionário, o resumo da transferência e o histórico", async () => {
    const { t, pedroConversationId } = await setup();
    const ana = await loginAs(t, ANA);

    const conversation = await ana.query(api.console.getConversation, {
      conversationId: pedroConversationId,
    });
    const messages = await ana.query(api.console.listMessages, {
      conversationId: pedroConversationId,
    });

    expect(conversation).toMatchObject({
      status: "waiting_analyst",
      employee: { name: "Pedro Santos", department: "Operações", email: PEDRO },
      handoff: { reason: "critical", ticketCode: "INC-20420" },
      isMine: false,
      assignedAnalyst: null,
      summary: { ticketCodes: ["INC-20420"], articleTitles: [], clarifyingQuestions: 0 },
    });
    expect(messages?.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "assistant",
      "system",
    ]);
  });

  test("id malformado ou inexistente devolve null", async () => {
    const { t } = await setup();
    const ana = await loginAs(t, ANA);

    expect(await ana.query(api.console.getConversation, { conversationId: "nada" })).toBeNull();
    expect(await ana.query(api.console.listMessages, { conversationId: "nada" })).toBeNull();
  });
});

describe("assign", () => {
  test("passa para with_analyst, grava quem assumiu e mostra o evento", async () => {
    const { t, pedroConversationId } = await setup();
    const ana = await loginAs(t, ANA);

    const result = await ana.mutation(api.console.assign, { conversationId: pedroConversationId });

    expect(result).toEqual({ ok: true, value: null });
    const conversation = await ana.query(api.console.getConversation, {
      conversationId: pedroConversationId,
    });
    expect(conversation).toMatchObject({
      status: "with_analyst",
      isMine: true,
      assignedAnalyst: { name: "Ana Ribeiro", level: "N1" },
    });
    expect(await lastEvent(t, pedroConversationId)).toEqual({
      type: "event",
      kind: "assigned",
      actorName: "Ana Ribeiro (Suporte N1)",
    });
  });

  test("não assume duas vezes: o segundo analista recebe a transição inválida", async () => {
    const { t, pedroConversationId } = await setup();
    const ana = await loginAs(t, ANA);
    const carlos = await loginAs(t, CARLOS);
    await ana.mutation(api.console.assign, { conversationId: pedroConversationId });

    const result = await carlos.mutation(api.console.assign, {
      conversationId: pedroConversationId,
    });

    expect(result).toEqual({ ok: false, error: "invalid_transition" });
  });

  test("conversa com o agent não pode ser assumida", async () => {
    const { t } = await setup();
    const ana = await loginAs(t, ANA);
    const conversationId = await insertConversation(t, RAFAEL, {
      status: "agent",
      minutesAgo: 1,
      text: "Oi",
    });

    const result = await ana.mutation(api.console.assign, { conversationId });

    expect(result).toEqual({ ok: false, error: "invalid_transition" });
  });
});

describe("sendAnalystMessage", () => {
  test("só quem assumiu responde; a mensagem chega ao funcionário com nome e nível", async () => {
    const { t, pedroConversationId } = await setup();
    const ana = await loginAs(t, ANA);
    const carlos = await loginAs(t, CARLOS);
    const pedro = await loginAs(t, PEDRO);
    const conversationId = pedroConversationId;

    expect(
      await ana.mutation(api.console.sendAnalystMessage, { conversationId, text: "Oi" }),
    ).toEqual({ ok: false, error: "not_assigned" });

    await ana.mutation(api.console.assign, { conversationId });
    expect(
      await carlos.mutation(api.console.sendAnalystMessage, { conversationId, text: "Oi" }),
    ).toEqual({ ok: false, error: "not_assigned" });
    expect(
      await ana.mutation(api.console.sendAnalystMessage, { conversationId, text: "   " }),
    ).toEqual({ ok: false, error: "empty" });
    expect(
      await ana.mutation(api.console.sendAnalystMessage, {
        conversationId,
        text: "Oi, Pedro! Já estou olhando o servidor.",
      }),
    ).toEqual({ ok: true, value: null });

    const messages = await pedro.query(api.messages.list, { conversationId });
    expect(messages?.at(-1)).toMatchObject({
      role: "analyst",
      parts: [{ type: "text", text: "Oi, Pedro! Já estou olhando o servidor." }],
      analyst: { name: "Ana Ribeiro", level: "N1" },
    });
  });

  test("mascara senha colada pelo analista", async () => {
    const { t, pedroConversationId } = await setup();
    const ana = await loginAs(t, ANA);
    await ana.mutation(api.console.assign, { conversationId: pedroConversationId });

    await ana.mutation(api.console.sendAnalystMessage, {
      conversationId: pedroConversationId,
      text: "Use a senha: Nexo@2026 para entrar",
    });

    const messages = await ana.query(api.console.listMessages, {
      conversationId: pedroConversationId,
    });
    const last = messages?.at(-1)?.parts[0];
    expect(last?.type === "text" && last.text.includes("Nexo@2026")).toBe(false);
  });
});

describe("returnToAgent", () => {
  test("de with_analyst: volta ao agent com a nota e o evento", async () => {
    const { t, pedroConversationId } = await setup();
    const ana = await loginAs(t, ANA);
    await ana.mutation(api.console.assign, { conversationId: pedroConversationId });

    const result = await ana.mutation(api.console.returnToAgent, {
      conversationId: pedroConversationId,
      note: "  Já reiniciei o servidor; confirme se voltou.  ",
    });

    expect(result).toEqual({ ok: true, value: null });
    const conversation = await t.run(async (ctx) => await ctx.db.get(pedroConversationId));
    expect(conversation).toMatchObject({
      status: "agent",
      returnNote: "Já reiniciei o servidor; confirme se voltou.",
    });
    expect(conversation?.assignedAnalystId).toBeUndefined();
    expect(await lastEvent(t, pedroConversationId)).toMatchObject({
      kind: "returned_to_agent",
    });
  });

  test("de waiting_analyst também vale (decisão 11); nota vazia não é gravada", async () => {
    const { t, pedroConversationId } = await setup();
    const ana = await loginAs(t, ANA);

    const result = await ana.mutation(api.console.returnToAgent, {
      conversationId: pedroConversationId,
      note: "   ",
    });

    expect(result).toEqual({ ok: true, value: null });
    const conversation = await t.run(async (ctx) => await ctx.db.get(pedroConversationId));
    expect(conversation?.status).toBe("agent");
    expect(conversation?.returnNote).toBeUndefined();
  });

  test("outro analista não devolve uma conversa que não é dele; com o agent é inválido", async () => {
    const { t, pedroConversationId } = await setup();
    const ana = await loginAs(t, ANA);
    const carlos = await loginAs(t, CARLOS);
    await ana.mutation(api.console.assign, { conversationId: pedroConversationId });

    expect(
      await carlos.mutation(api.console.returnToAgent, { conversationId: pedroConversationId }),
    ).toEqual({ ok: false, error: "not_assigned" });

    await ana.mutation(api.console.returnToAgent, { conversationId: pedroConversationId });
    expect(
      await ana.mutation(api.console.returnToAgent, { conversationId: pedroConversationId }),
    ).toEqual({ ok: false, error: "invalid_transition" });
  });
});

describe("close", () => {
  test("encerra, grava o evento e o funcionário não manda mais mensagens", async () => {
    const { t, pedroConversationId } = await setup();
    const ana = await loginAs(t, ANA);
    const pedro = await loginAs(t, PEDRO);
    await ana.mutation(api.console.assign, { conversationId: pedroConversationId });

    const result = await ana.mutation(api.console.close, { conversationId: pedroConversationId });

    expect(result).toEqual({ ok: true, value: null });
    expect(await conversationStatus(t, pedroConversationId)).toBe("closed");
    expect(await lastEvent(t, pedroConversationId)).toMatchObject({ kind: "closed" });
    expect(
      await pedro.mutation(api.messages.sendUserMessage, {
        conversationId: pedroConversationId,
        text: "Oi?",
      }),
    ).toEqual({ ok: false, error: "closed" });
  });

  test("encerrada não encerra de novo; atendida por outro, só quem assumiu encerra", async () => {
    const { t, pedroConversationId } = await setup();
    const ana = await loginAs(t, ANA);
    const carlos = await loginAs(t, CARLOS);
    await ana.mutation(api.console.assign, { conversationId: pedroConversationId });

    expect(
      await carlos.mutation(api.console.close, { conversationId: pedroConversationId }),
    ).toEqual({ ok: false, error: "not_assigned" });
    await ana.mutation(api.console.close, { conversationId: pedroConversationId });
    expect(await ana.mutation(api.console.close, { conversationId: pedroConversationId })).toEqual({
      ok: false,
      error: "invalid_transition",
    });
  });

  test("conversa com o agent pode ser encerrada", async () => {
    const { t } = await setup();
    const ana = await loginAs(t, ANA);
    const conversationId = await insertConversation(t, RAFAEL, {
      status: "agent",
      minutesAgo: 1,
      text: "Oi",
    });

    expect(await ana.mutation(api.console.close, { conversationId })).toEqual({
      ok: true,
      value: null,
    });
  });
});

describe("ticketing.queries.employeeTicket", () => {
  test("o analista lê o detalhe com o histórico; o funcionário não usa", async () => {
    const { t } = await setup();
    const ana = await loginAs(t, ANA);
    const mariana = await loginAs(t, MARIANA);
    const marianaId = await personId(t, MARIANA);

    const detail = await ana.query(api.ticketing.queries.employeeTicket, {
      employeeId: marianaId,
      code: "INC-20311",
    });
    const fromOtherOwner = await ana.query(api.ticketing.queries.employeeTicket, {
      employeeId: marianaId,
      code: "INC-20420",
    });

    expect(detail?.code).toBe("INC-20311");
    expect(detail?.updates.length).toBeGreaterThan(0);
    expect(fromOtherOwner).toBeNull();
    await expect(
      mariana.query(api.ticketing.queries.employeeTicket, {
        employeeId: marianaId,
        code: "INC-20311",
      }),
    ).rejects.toThrow("Acesso restrito a analistas.");
  });
});
