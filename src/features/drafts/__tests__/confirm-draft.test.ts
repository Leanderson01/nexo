// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { HttpTicketGateway } from "@/agent/gateways/http-ticket-gateway";
import type { PendingAction } from "@/domain/pending-action";
import type { NewTicket } from "@/domain/ticket";
import { internal } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import schema from "../../../../convex/schema";
import { cancelDraft } from "../cancel-draft";
import { confirmDraft } from "../confirm-draft";
import type { ConvexCaller } from "../convex-caller";

// Confirmar e cancelar de ponta a ponta: Convex de teste + `HttpTicketGateway` de verdade,
// com o `fetch` apontado para a API HTTP do serviço de chamados (`t.fetch`). O "legado fora
// do ar" é o fetch respondendo 503.

const modules = import.meta.glob("../../../../convex/**/*.ts");

const AGENT_SECRET = "segredo-de-teste";
const SERVICE_KEY = "chave-de-teste";
const MARIANA = "mariana.costa@nexo.com.br";

type Test = TestConvex<typeof schema>;

const excelTicket: NewTicket = {
  kind: "INC",
  category: "software",
  title: "Excel fecha sozinho",
  description: "O Excel fecha ao abrir planilhas grandes.",
  affected: "Somente você",
  prioritySignals: { impact: "individual", blocked: true, deadlineToday: false },
  priority: "HIGH",
  priorityReason: "Impede uma pessoa de trabalhar",
};

const stockTicket: NewTicket = {
  ...excelTicket,
  title: "Sistema de estoque fora do ar",
  affected: "Equipe de Operações",
  prioritySignals: { impact: "team", blocked: true, deadlineToday: false },
  priority: "CRITICAL",
  priorityReason: "Parado para uma equipe/empresa",
};

/** O serviço de chamados visto pelo gateway; `down` simula o legado fora do ar. */
function fakeLegacy(t: Test) {
  const state = { down: false, calls: [] as string[] };
  const fetchViaConvexTest = async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(url instanceof Request ? url.url : url).pathname;
    state.calls.push(path);
    if (state.down) return new Response("indisponível", { status: 503 });
    return await t.fetch(path, init);
  };
  return { state, fetch: fetchViaConvexTest as typeof fetch };
}

async function setup(options: { action?: PendingAction; handoffOnConfirm?: boolean } = {}) {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});

  const { employeeId, subject } = await t.run(async (ctx) => {
    const person = await ctx.db
      .query("people")
      .withIndex("by_email", (q) => q.eq("email", MARIANA))
      .unique();
    if (!person) throw new Error("Mariana não está no seed");
    const userId = await ctx.db.insert("users", { email: MARIANA });
    const sessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + 60_000,
    });
    return { employeeId: person._id, subject: `${userId}|${sessionId}` };
  });

  const { conversationId, pendingActionId } = await t.run(async (ctx) => {
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
    return { conversationId, pendingActionId };
  });

  const legacy = fakeLegacy(t);
  // Mesmas chamadas do ConvexHttpClient; só a assinatura genérica do convex-test difere.
  const convex = t.withIdentity({ subject }) as unknown as ConvexCaller;
  const input = {
    convex,
    agentSecret: AGENT_SECRET,
    createGateway: (id: string) =>
      new HttpTicketGateway({
        baseUrl: "https://servico.test",
        serviceKey: SERVICE_KEY,
        employeeId: id,
        fetch: legacy.fetch,
        sleep: async () => {},
      }),
    conversationId: conversationId as string,
    pendingActionId: pendingActionId as string,
  };
  return { t, legacy, input, conversationId, pendingActionId, employeeId };
}

async function ticketsCreatedBy(t: Test, employeeId: Id<"people">, title: string) {
  return await t.run(async (ctx) => {
    const tickets = await ctx.db.query("tickets").collect();
    return tickets.filter((ticket) => ticket.ownerId === employeeId && ticket.title === title);
  });
}

async function messagesOf(t: Test, conversationId: Id<"conversations">) {
  return await t.run((ctx) =>
    ctx.db
      .query("messages")
      .withIndex("by_conversation_createdAt", (q) => q.eq("conversationId", conversationId))
      .collect(),
  );
}

beforeEach(() => {
  vi.stubEnv("AGENT_SERVER_SECRET", AGENT_SECRET);
  vi.stubEnv("TICKETING_SERVICE_KEY", SERVICE_KEY);
  vi.stubEnv("TICKETING_FAILURE_RATE", "");
  vi.stubEnv("TICKETING_LATENCY_MS", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("confirmDraft", () => {
  test("cria o chamado e grava o card com o prazo da primeira resposta", async () => {
    const { t, input, conversationId, pendingActionId, employeeId } = await setup();

    const result = await confirmDraft(input);

    if (!result.ok) throw new Error(`confirmar falhou: ${result.error}`);
    expect(result.value).toMatchObject({ alreadyConfirmed: false, transferred: false });
    expect(result.value.ticketCode).toMatch(/^INC-\d{5}$/);

    const [ticket] = await ticketsCreatedBy(t, employeeId, excelTicket.title);
    expect(ticket).toMatchObject({
      code: result.value.ticketCode,
      priority: "HIGH",
      status: "open",
    });
    expect(ticket.lastActivityAt).toBe(ticket.createdAt);

    const reply = (await messagesOf(t, conversationId)).at(-1);
    expect(reply?.parts[1]).toEqual({ type: "ticket", code: result.value.ticketCode });
    expect(reply?.parts[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("(4 horas úteis)"),
    });
    const draft = await t.run((ctx) => ctx.db.get(pendingActionId));
    expect(draft).toMatchObject({ status: "confirmed", resultTicketCode: result.value.ticketCode });
  });

  test("clique duplo: duas confirmações ao mesmo tempo criam um chamado só", async () => {
    const { t, input, conversationId, employeeId } = await setup();

    const [first, second] = await Promise.all([confirmDraft(input), confirmDraft(input)]);

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.ticketCode).toBe(first.value.ticketCode);
    expect(await ticketsCreatedBy(t, employeeId, excelTicket.title)).toHaveLength(1);
    const cards = (await messagesOf(t, conversationId)).filter((m) =>
      m.parts.some((part) => part.type === "ticket"),
    );
    expect(cards).toHaveLength(1);
  });

  test("confirmar de novo depois de confirmado devolve o mesmo chamado sem gravar nada", async () => {
    const { input, legacy } = await setup();
    const first = await confirmDraft(input);
    const callsAfterFirst = legacy.state.calls.length;

    const again = await confirmDraft(input);

    expect(again).toEqual({
      ok: true,
      value: {
        ticketCode: first.ok ? first.value.ticketCode : "",
        alreadyConfirmed: true,
        transferred: false,
      },
    });
    expect(legacy.state.calls).toHaveLength(callsAfterFirst);
  });

  test("legado fora do ar: 3 tentativas, erro repetível e o rascunho continua pendente", async () => {
    const { t, input, legacy, conversationId, pendingActionId, employeeId } = await setup();
    legacy.state.down = true;

    const result = await confirmDraft(input);

    expect(result).toEqual({ ok: false, error: "ticketing_unavailable" });
    expect(legacy.state.calls).toEqual(Array(3).fill("/ticketing/create"));
    const draft = await t.run((ctx) => ctx.db.get(pendingActionId));
    expect(draft?.status).toBe("pending");
    const reply = (await messagesOf(t, conversationId)).at(-1);
    expect(reply).toMatchObject({
      role: "assistant",
      status: "error",
      failedPendingActionId: pendingActionId,
      parts: [{ type: "error", retryable: true }],
    });
    expect(await ticketsCreatedBy(t, employeeId, excelTicket.title)).toHaveLength(0);

    // O legado volta: o "Tentar de novo" confirma e cria um chamado só.
    legacy.state.down = false;
    const retried = await confirmDraft(input);
    expect(retried.ok).toBe(true);
    expect(await ticketsCreatedBy(t, employeeId, excelTicket.title)).toHaveLength(1);
  });

  test("recusa do serviço (chamado inexistente) vira erro sem repetir", async () => {
    const action: PendingAction = {
      kind: "update_ticket",
      code: "INC-99999",
      text: "Ainda falha.",
    };
    const { t, input, legacy, conversationId } = await setup({ action });

    const result = await confirmDraft(input);

    expect(result).toEqual({ ok: false, error: "ticketing_rejected" });
    expect(legacy.state.calls).toEqual(["/ticketing/addUpdate"]);
    const reply = (await messagesOf(t, conversationId)).at(-1);
    expect(reply?.parts).toEqual([expect.objectContaining({ type: "error", retryable: false })]);
  });

  test("crítico: cria, transfere com motivo critical e marca o chamado para o analista", async () => {
    const { t, input, conversationId, employeeId } = await setup({
      action: { kind: "create_ticket", ticket: stockTicket },
      handoffOnConfirm: true,
    });

    const result = await confirmDraft(input);

    expect(result.ok && result.value.transferred).toBe(true);
    const conversation = await t.run((ctx) => ctx.db.get(conversationId));
    expect(conversation?.status).toBe("waiting_analyst");
    expect(conversation?.handoff?.reason).toBe("critical");
    const [ticket] = await ticketsCreatedBy(t, employeeId, stockTicket.title);
    expect(ticket).toMatchObject({ priority: "CRITICAL", status: "awaiting_analyst" });
    const reply = (await messagesOf(t, conversationId)).find((m) => m.role === "assistant");
    expect(reply?.parts[0]).toMatchObject({ text: expect.stringContaining("1 hora corrida") });
  });

  test("com o agent respondendo, espera e não chama o serviço", async () => {
    const { t, input, legacy, conversationId } = await setup();
    await t.run((ctx) => ctx.db.patch(conversationId, { agentBusy: true }));

    const result = await confirmDraft(input);

    expect(result).toEqual({ ok: false, error: "busy" });
    expect(legacy.state.calls).toEqual([]);
  });
});

describe("cancelDraft", () => {
  test("crítico recusado: cancela e transfere mesmo assim, sem chamado", async () => {
    const { t, input, legacy, conversationId, pendingActionId } = await setup({
      action: { kind: "create_ticket", ticket: stockTicket },
      handoffOnConfirm: true,
    });

    const result = await cancelDraft(input);

    expect(result).toEqual({ ok: true, value: { alreadyCancelled: false, transferred: true } });
    expect(legacy.state.calls).toEqual([]);
    const draft = await t.run((ctx) => ctx.db.get(pendingActionId));
    expect(draft?.status).toBe("cancelled");
    const conversation = await t.run((ctx) => ctx.db.get(conversationId));
    expect(conversation?.status).toBe("waiting_analyst");
  });

  test("depois de confirmado, cancelar é recusado", async () => {
    const { input } = await setup();
    await confirmDraft(input);

    expect(await cancelDraft(input)).toEqual({ ok: false, error: "not_pending" });
  });
});
