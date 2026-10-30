/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

// Notificações em tempo real (T17, §11.6): o analista atualiza um chamado e o dono recebe o
// evento no chat (só ele, uma vez só) e o toast (`notifications.latestSupportUpdate`).

const modules = import.meta.glob("../**/*.ts");

const ANA = "ana.ribeiro@nexo.com.br";
const MARIANA = "mariana.costa@nexo.com.br";
const PEDRO = "pedro.santos@nexo.com.br";

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

async function insertConversation(
  t: TestConvex,
  employeeId: Id<"people">,
  status: "agent" | "closed",
  lastMessageAt = Date.now(),
): Promise<Id<"conversations">> {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("conversations", {
        employeeId,
        status,
        employeeMessageCount: 1,
        agentBusy: false,
        clarificationAttempts: 0,
        lastMessageAt,
      }),
  );
}

/** Eventos `ticket_updated` gravados em uma conversa. */
async function ticketEvents(t: TestConvex, conversationId: Id<"conversations">) {
  return await t.run(async (ctx) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation_createdAt", (q) => q.eq("conversationId", conversationId))
      .collect();
    return messages
      .filter((message) => message.role === "system")
      .flatMap((message) => message.parts)
      .filter((part) => part.type === "event" && part.kind === "ticket_updated");
  });
}

async function setup() {
  const t = newTest();
  await t.mutation(internal.seed.run, {});
  const marianaId = await personId(t, MARIANA);
  const pedroId = await personId(t, PEDRO);
  // A conversa do Pedro já vem do seed; a Mariana tem uma encerrada e uma em andamento.
  const marianaClosed = await insertConversation(t, marianaId, "closed", Date.now() + 1);
  const marianaOngoing = await insertConversation(t, marianaId, "agent", Date.now() - 1);
  const pedroConversation = await t.run(async (ctx) => {
    const conversation = await ctx.db
      .query("conversations")
      .withIndex("by_employee_lastMessage", (q) => q.eq("employeeId", pedroId))
      .first();
    if (!conversation) throw new Error("o seed não criou a conversa do Pedro");
    return conversation._id;
  });
  return { t, marianaId, marianaClosed, marianaOngoing, pedroConversation };
}

describe("console.registerTicketUpdate", () => {
  test("grava a atualização do analista e avisa só a conversa em andamento do dono", async () => {
    const { t, marianaId, marianaClosed, marianaOngoing, pedroConversation } = await setup();
    const ana = await loginAs(t, ANA);

    const result = await ana.mutation(api.console.registerTicketUpdate, {
      employeeId: marianaId,
      code: "INC-20311",
      text: "Peguei o chamado, vou acessar o notebook remotamente.",
      status: "in_progress",
    });
    expect(result).toEqual({ ok: true, value: null });

    expect(await ticketEvents(t, marianaOngoing)).toEqual([
      {
        type: "event",
        kind: "ticket_updated",
        ticketCode: "INC-20311",
        ticketStatus: "in_progress",
        actorName: "Ana Ribeiro",
      },
    ]);
    // A encerrada (mesmo sendo a mais recente) e a conversa de outra pessoa não recebem nada.
    expect(await ticketEvents(t, marianaClosed)).toEqual([]);
    expect(await ticketEvents(t, pedroConversation)).toEqual([]);

    const ticket = await t.run(async (ctx) =>
      ctx.db
        .query("tickets")
        .withIndex("by_code", (q) => q.eq("code", "INC-20311"))
        .unique(),
    );
    expect(ticket?.status).toBe("in_progress");
  });

  test("sem status, o evento sai sem status; o texto é mascarado", async () => {
    const { t, marianaId, marianaOngoing } = await setup();
    const ana = await loginAs(t, ANA);

    await ana.mutation(api.console.registerTicketUpdate, {
      employeeId: marianaId,
      code: "REQ-10442",
      text: "Sua senha é Abc12345, troque no primeiro acesso.",
    });

    const [event] = await ticketEvents(t, marianaOngoing);
    expect(event).toEqual({
      type: "event",
      kind: "ticket_updated",
      ticketCode: "REQ-10442",
      actorName: "Ana Ribeiro",
    });
    const latest = await (
      await loginAs(t, MARIANA)
    ).query(api.notifications.latestSupportUpdate, {});
    expect(latest?.text).not.toContain("Abc12345");
  });

  test("erros esperados: texto vazio, chamado de outra pessoa e chamado fechado", async () => {
    const { t, marianaId } = await setup();
    const ana = await loginAs(t, ANA);
    const update = (code: string, text = "Atualização.") =>
      ana.mutation(api.console.registerTicketUpdate, { employeeId: marianaId, code, text });

    expect(await update("INC-20311", "   ")).toEqual({ ok: false, error: "empty" });
    expect(await update("INC-20420")).toEqual({ ok: false, error: "not_found" });

    await t.run(async (ctx) => {
      const ticket = await ctx.db
        .query("tickets")
        .withIndex("by_code", (q) => q.eq("code", "INC-20150"))
        .unique();
      if (ticket) await ctx.db.patch(ticket._id, { status: "closed" });
    });
    expect(await update("INC-20150")).toEqual({ ok: false, error: "closed" });
  });

  test("só analista registra atualização", async () => {
    const { t, marianaId } = await setup();
    const mariana = await loginAs(t, MARIANA);
    await expect(
      mariana.mutation(api.console.registerTicketUpdate, {
        employeeId: marianaId,
        code: "INC-20311",
        text: "Eu mesma resolvi.",
        status: "resolved",
      }),
    ).rejects.toThrow(/analistas/);
  });
});

describe("evento pelo serviço de chamados (addUpdate)", () => {
  const update = (employeeId: Id<"people">, authorType: "analyst" | "employee", key: string) => ({
    employeeId,
    code: "INC-20311",
    text: "Atualização.",
    authorType,
    idempotencyKey: key,
  });

  test("a mesma chave de idempotência não grava o evento duas vezes", async () => {
    const { t, marianaId, marianaOngoing } = await setup();

    await t.mutation(internal.ticketing.service.addUpdate, update(marianaId, "analyst", "k-1"));
    await t.mutation(internal.ticketing.service.addUpdate, update(marianaId, "analyst", "k-1"));

    expect(await ticketEvents(t, marianaOngoing)).toHaveLength(1);
  });

  test("atualização do próprio funcionário não vira evento", async () => {
    const { t, marianaId, marianaOngoing } = await setup();

    await t.mutation(internal.ticketing.service.addUpdate, update(marianaId, "employee", "k-2"));

    expect(await ticketEvents(t, marianaOngoing)).toEqual([]);
  });

  test("sem conversa em andamento, não grava evento (o toast ainda avisa)", async () => {
    const t = newTest();
    await t.mutation(internal.seed.run, {});
    const marianaId = await personId(t, MARIANA);
    const closed = await insertConversation(t, marianaId, "closed");

    await t.mutation(internal.ticketing.service.addUpdate, update(marianaId, "analyst", "k-3"));

    expect(await ticketEvents(t, closed)).toEqual([]);
    const latest = await (
      await loginAs(t, MARIANA)
    ).query(api.notifications.latestSupportUpdate, {});
    expect(latest?.code).toBe("INC-20311");
  });
});

describe("notifications.latestSupportUpdate", () => {
  test("devolve a atualização de analista mais recente nos chamados do funcionário", async () => {
    const { t, marianaId } = await setup();
    const mariana = await loginAs(t, MARIANA);
    const before = await mariana.query(api.notifications.latestSupportUpdate, {});

    const ana = await loginAs(t, ANA);
    await ana.mutation(api.console.registerTicketUpdate, {
      employeeId: marianaId,
      code: "INC-20311",
      text: "Em análise.",
      status: "in_progress",
    });

    const after = await mariana.query(api.notifications.latestSupportUpdate, {});
    expect(after).toMatchObject({
      code: "INC-20311",
      status: "in_progress",
      text: "Em análise.",
      authorName: "Ana Ribeiro",
    });
    expect(after?.id).not.toBe(before?.id);
  });

  test("não vê atualização de chamado alheio", async () => {
    const { t, marianaId } = await setup();
    const pedro = await loginAs(t, PEDRO);
    const before = await pedro.query(api.notifications.latestSupportUpdate, {});

    await (
      await loginAs(t, ANA)
    ).mutation(api.console.registerTicketUpdate, {
      employeeId: marianaId,
      code: "INC-20311",
      text: "Em análise.",
    });

    expect(await pedro.query(api.notifications.latestSupportUpdate, {})).toEqual(before);
  });

  test("só funcionário consulta", async () => {
    const { t } = await setup();
    const ana = await loginAs(t, ANA);
    await expect(ana.query(api.notifications.latestSupportUpdate, {})).rejects.toThrow(
      /funcionários/,
    );
  });
});
