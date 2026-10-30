/// <reference types="vite/client" />
import { convexTest, type TestConvex as SchemaTestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { PendingAction } from "../../src/domain/pending-action";
import type { NewTicket } from "../../src/domain/ticket";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

// Escritas do rascunho fora do LLM (T11): edição do funcionário e confirmação, falha e
// cancelamento pelo servidor (com o segredo), sempre conferindo o dono.

const modules = import.meta.glob("../**/*.ts");

const AGENT_SECRET = "segredo-de-teste";
const MARIANA = "mariana.costa@nexo.com.br";
const RAFAEL = "rafael.lima@nexo.com.br";

type TestConvex = SchemaTestConvex<typeof schema>;

const excelTicket: NewTicket = {
  kind: "INC",
  category: "software",
  title: "Excel fecha sozinho",
  description: "O Excel fecha ao abrir planilhas grandes.",
  affected: "Somente você",
  prioritySignals: { impact: "individual", blocked: false, deadlineToday: false },
  priority: "MEDIUM",
  priorityReason: "Atrapalha, mas há alternativa",
};

const stockTicket: NewTicket = {
  kind: "INC",
  category: "software",
  title: "Sistema de estoque fora do ar",
  description: "Ninguém da equipe consegue dar baixa nos pedidos.",
  affected: "Equipe de Operações",
  prioritySignals: { impact: "team", blocked: true, deadlineToday: false },
  priority: "CRITICAL",
  priorityReason: "Parado para uma equipe/empresa",
};

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
  const person = await t.run((ctx) =>
    ctx.db
      .query("people")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique(),
  );
  if (!person) throw new Error(`${email} não está no seed`);
  return person._id;
}

/** Conversa da Mariana em `agent` com um rascunho pendente, como o AGIR da T10 deixaria. */
async function setup(options: { action?: PendingAction; handoffOnConfirm?: boolean } = {}) {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const employeeId = await personId(t, MARIANA);
  const mariana = await loginAs(t, MARIANA);

  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const conversationId = await ctx.db.insert("conversations", {
      employeeId,
      status: "agent",
      employeeMessageCount: 1,
      agentBusy: false,
      clarificationAttempts: 0,
      lastMessageAt: now,
    });
    const pendingActionId = await ctx.db.insert("pendingActions", {
      conversationId,
      draftNumber: 381,
      action: options.action ?? { kind: "create_ticket", ticket: excelTicket },
      status: "pending",
      handoffOnConfirm: options.handoffOnConfirm ?? false,
      createdAt: now,
    });
    await ctx.db.patch(conversationId, { pendingActionId });
    await ctx.db.insert("messages", {
      conversationId,
      role: "assistant",
      parts: [{ type: "draft", pendingActionId }],
      status: "complete",
      createdAt: now,
    });
    return { conversationId, pendingActionId };
  });

  const serverArgs = {
    secret: AGENT_SECRET,
    employeeId,
    conversationId: ids.conversationId as string,
    pendingActionId: ids.pendingActionId as string,
  };
  return { t, mariana, employeeId, serverArgs, ...ids };
}

async function messagesOf(t: TestConvex, conversationId: Id<"conversations">) {
  return await t.run((ctx) =>
    ctx.db
      .query("messages")
      .withIndex("by_conversation_createdAt", (q) => q.eq("conversationId", conversationId))
      .collect(),
  );
}

beforeEach(() => {
  vi.stubEnv("AGENT_SERVER_SECRET", AGENT_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("loadForEmployee", () => {
  test("o dono lê o rascunho com o estado da conversa", async () => {
    const { mariana, conversationId, pendingActionId, employeeId } = await setup();

    const loaded = await mariana.query(api.pendingActions.loadForEmployee, {
      conversationId,
      pendingActionId,
    });

    expect(loaded).toEqual({
      ok: true,
      value: expect.objectContaining({
        employeeId,
        status: "pending",
        conversationStatus: "agent",
        agentBusy: false,
        handoffOnConfirm: false,
      }),
    });
  });

  test("rascunho de outra pessoa ou id torto dá o mesmo not_found", async () => {
    const { t, conversationId, pendingActionId } = await setup();
    const rafael = await loginAs(t, RAFAEL);

    for (const args of [
      { conversationId, pendingActionId },
      { conversationId: "torto", pendingActionId: "torto" },
    ]) {
      const loaded = await rafael.query(api.pendingActions.loadForEmployee, args);
      expect(loaded).toEqual({ ok: false, error: "not_found" });
    }
  });
});

describe("edit", () => {
  test("sinais novos recalculam a prioridade em código, ignorando a do cliente", async () => {
    const { t, mariana, conversationId, pendingActionId } = await setup();

    const result = await mariana.mutation(api.pendingActions.edit, {
      conversationId,
      pendingActionId,
      action: {
        kind: "create_ticket",
        ticket: {
          ...excelTicket,
          title: "  Excel fecha para a equipe toda  ",
          prioritySignals: { impact: "team", blocked: true, deadlineToday: false },
          priority: "LOW",
          priorityReason: "inventado pelo cliente",
        },
      },
    });

    expect(result.ok).toBe(true);
    const stored = await t.run((ctx) => ctx.db.get(pendingActionId));
    expect(stored?.action).toEqual({
      kind: "create_ticket",
      ticket: {
        ...excelTicket,
        title: "Excel fecha para a equipe toda",
        prioritySignals: { impact: "team", blocked: true, deadlineToday: false },
        priority: "CRITICAL",
        priorityReason: "Parado para uma equipe/empresa",
      },
    });
  });

  test("sem mudar os sinais, a prioridade guardada fica", async () => {
    const { t, mariana, conversationId, pendingActionId } = await setup();

    await mariana.mutation(api.pendingActions.edit, {
      conversationId,
      pendingActionId,
      action: {
        kind: "create_ticket",
        ticket: {
          ...excelTicket,
          description: "Fecha ao abrir qualquer planilha.",
          priority: "LOW",
        },
      },
    });

    const stored = await t.run((ctx) => ctx.db.get(pendingActionId));
    expect(stored?.action.kind === "create_ticket" && stored.action.ticket.priority).toBe("MEDIUM");
  });

  test("campo vazio ou troca de tipo é recusado", async () => {
    const { mariana, conversationId, pendingActionId } = await setup();

    const emptyTitle = await mariana.mutation(api.pendingActions.edit, {
      conversationId,
      pendingActionId,
      action: { kind: "create_ticket", ticket: { ...excelTicket, title: "   " } },
    });
    const otherKind = await mariana.mutation(api.pendingActions.edit, {
      conversationId,
      pendingActionId,
      action: { kind: "reopen_ticket", code: "INC-20150", reason: "voltou" },
    });

    expect(emptyTitle).toEqual({ ok: false, error: "invalid_draft" });
    expect(otherKind).toEqual({ ok: false, error: "invalid_draft" });
  });

  test("na atualização só o texto muda, e a senha colada é mascarada", async () => {
    const action: PendingAction = {
      kind: "update_ticket",
      code: "INC-20395",
      text: "Ainda falha.",
    };
    const { t, mariana, conversationId, pendingActionId } = await setup({ action });

    await mariana.mutation(api.pendingActions.edit, {
      conversationId,
      pendingActionId,
      action: { kind: "update_ticket", code: "INC-99999", text: "Minha senha é Abc@12345" },
    });

    const stored = await t.run((ctx) => ctx.db.get(pendingActionId));
    expect(stored?.action).toMatchObject({ kind: "update_ticket", code: "INC-20395" });
    expect(JSON.stringify(stored?.action)).not.toContain("Abc@12345");
  });

  test("outra pessoa não edita e rascunho substituído não muda", async () => {
    const { t, conversationId, pendingActionId } = await setup();
    const rafael = await loginAs(t, RAFAEL);
    const mariana = await loginAs(t, MARIANA);
    const action = { kind: "create_ticket" as const, ticket: excelTicket };

    const byRafael = await rafael.mutation(api.pendingActions.edit, {
      conversationId,
      pendingActionId,
      action,
    });
    await t.run((ctx) => ctx.db.patch(pendingActionId, { status: "superseded" }));
    const superseded = await mariana.mutation(api.pendingActions.edit, {
      conversationId,
      pendingActionId,
      action,
    });

    expect(byRafael).toEqual({ ok: false, error: "not_found" });
    expect(superseded).toEqual({ ok: false, error: "not_pending" });
  });
});

describe("completeConfirm", () => {
  test("grava o card do chamado, confirma e limpa o rascunho da conversa", async () => {
    const { t, serverArgs, conversationId, pendingActionId } = await setup();

    const result = await t.mutation(api.pendingActions.completeConfirm, {
      ...serverArgs,
      ticketCode: "INC-20431",
      replyText: "Chamado aberto.",
    });

    expect(result).toEqual({ ok: true, value: { alreadyConfirmed: false, transferred: false } });
    const draft = await t.run((ctx) => ctx.db.get(pendingActionId));
    expect(draft).toMatchObject({ status: "confirmed", resultTicketCode: "INC-20431" });
    expect(draft?.resolvedAt).toBeTypeOf("number");
    const conversation = await t.run((ctx) => ctx.db.get(conversationId));
    expect(conversation?.pendingActionId).toBeUndefined();
    expect(conversation?.status).toBe("agent");
    const last = (await messagesOf(t, conversationId)).at(-1);
    expect(last).toMatchObject({
      role: "assistant",
      status: "complete",
      parts: [
        { type: "text", text: "Chamado aberto." },
        { type: "ticket", code: "INC-20431" },
      ],
    });
  });

  test("confirmar duas vezes grava uma mensagem só", async () => {
    const { t, serverArgs, conversationId } = await setup();
    const args = { ...serverArgs, ticketCode: "INC-20431", replyText: "Chamado aberto." };

    await t.mutation(api.pendingActions.completeConfirm, args);
    const second = await t.mutation(api.pendingActions.completeConfirm, args);

    expect(second).toEqual({ ok: true, value: { alreadyConfirmed: true, transferred: false } });
    const tickets = (await messagesOf(t, conversationId)).filter((m) =>
      m.parts.some((part) => part.type === "ticket"),
    );
    expect(tickets).toHaveLength(1);
  });

  test("crítico: confirma e transfere com motivo critical e o resumo do caso", async () => {
    const { t, serverArgs, conversationId } = await setup({
      action: { kind: "create_ticket", ticket: stockTicket },
      handoffOnConfirm: true,
    });

    const result = await t.mutation(api.pendingActions.completeConfirm, {
      ...serverArgs,
      ticketCode: "INC-20431",
      replyText: "Chamado aberto.",
    });

    expect(result).toEqual({ ok: true, value: { alreadyConfirmed: false, transferred: true } });
    const conversation = await t.run((ctx) => ctx.db.get(conversationId));
    expect(conversation?.status).toBe("waiting_analyst");
    expect(conversation?.handoff).toMatchObject({ reason: "critical", ticketCode: "INC-20431" });
    expect(conversation?.handoff?.summary).toContain("Sistema de estoque fora do ar");
    const roles = (await messagesOf(t, conversationId)).map((m) => [m.role, m.parts[0].type]);
    expect(roles.slice(-2)).toEqual([
      ["assistant", "text"],
      ["system", "handoff"],
    ]);
  });

  test("segredo errado é recusado e nada é gravado", async () => {
    const { t, serverArgs, pendingActionId } = await setup();

    await expect(
      t.mutation(api.pendingActions.completeConfirm, {
        ...serverArgs,
        secret: "chute",
        ticketCode: "INC-20431",
        replyText: "forjado",
      }),
    ).rejects.toThrow(/segredo/);
    const draft = await t.run((ctx) => ctx.db.get(pendingActionId));
    expect(draft?.status).toBe("pending");
  });

  test("funcionário que não é o dono e rascunho substituído são recusados", async () => {
    const { t, serverArgs, pendingActionId } = await setup();
    const rafaelId = await personId(t, RAFAEL);
    const args = { ...serverArgs, ticketCode: "INC-20431", replyText: "Chamado aberto." };

    const notOwner = await t.mutation(api.pendingActions.completeConfirm, {
      ...args,
      employeeId: rafaelId,
    });
    await t.run((ctx) => ctx.db.patch(pendingActionId, { status: "superseded" }));
    const superseded = await t.mutation(api.pendingActions.completeConfirm, args);

    expect(notOwner).toEqual({ ok: false, error: "not_found" });
    expect(superseded).toEqual({ ok: false, error: "not_pending" });
  });
});

describe("recordConfirmFailure", () => {
  test("mensagem de erro repetível ligada ao rascunho, que continua pendente", async () => {
    const { t, serverArgs, conversationId, pendingActionId } = await setup();

    await t.mutation(api.pendingActions.recordConfirmFailure, {
      ...serverArgs,
      message: "O sistema de chamados está instável.",
      retryable: true,
    });

    const last = (await messagesOf(t, conversationId)).at(-1);
    expect(last).toMatchObject({
      role: "assistant",
      status: "error",
      failedPendingActionId: pendingActionId,
      parts: [{ type: "error", message: "O sistema de chamados está instável.", retryable: true }],
    });
    const draft = await t.run((ctx) => ctx.db.get(pendingActionId));
    expect(draft?.status).toBe("pending");
  });
});

describe("cancel", () => {
  test("cancela com o evento visível e é idempotente", async () => {
    const { t, serverArgs, conversationId, pendingActionId } = await setup();

    const first = await t.mutation(api.pendingActions.cancel, serverArgs);
    const second = await t.mutation(api.pendingActions.cancel, serverArgs);

    expect(first).toEqual({ ok: true, value: { alreadyCancelled: false, transferred: false } });
    expect(second).toEqual({ ok: true, value: { alreadyCancelled: true, transferred: false } });
    const draft = await t.run((ctx) => ctx.db.get(pendingActionId));
    expect(draft?.status).toBe("cancelled");
    const events = (await messagesOf(t, conversationId)).filter((m) => m.role === "system");
    expect(events.map((m) => m.parts)).toEqual([[{ type: "event", kind: "draft_cancelled" }]]);
    const conversation = await t.run((ctx) => ctx.db.get(conversationId));
    expect(conversation?.pendingActionId).toBeUndefined();
    expect(conversation?.status).toBe("agent");
  });

  test("crítico recusado transfere mesmo assim (§6.3)", async () => {
    const { t, serverArgs, conversationId } = await setup({
      action: { kind: "create_ticket", ticket: stockTicket },
      handoffOnConfirm: true,
    });

    const result = await t.mutation(api.pendingActions.cancel, serverArgs);

    expect(result).toEqual({ ok: true, value: { alreadyCancelled: false, transferred: true } });
    const conversation = await t.run((ctx) => ctx.db.get(conversationId));
    expect(conversation?.status).toBe("waiting_analyst");
    expect(conversation?.handoff?.reason).toBe("critical");
    expect(conversation?.handoff?.summary).toContain("cancelou o rascunho");
  });

  test("confirmado não pode ser cancelado depois", async () => {
    const { t, serverArgs } = await setup();
    await t.mutation(api.pendingActions.completeConfirm, {
      ...serverArgs,
      ticketCode: "INC-20431",
      replyText: "Chamado aberto.",
    });

    const result = await t.mutation(api.pendingActions.cancel, serverArgs);

    expect(result).toEqual({ ok: false, error: "not_pending" });
  });
});
