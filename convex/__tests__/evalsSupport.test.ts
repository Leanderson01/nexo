/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");

const SECRET = "segredo-dos-evals";
const RAFAEL = "rafael.lima@nexo.com.br";

afterEach(() => {
  vi.unstubAllEnvs();
});

async function seededWithLeftovers() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  // O que um cenário anterior deixaria: um chamado novo e uma conversa do Rafael.
  const conversationId = await t.run(async (ctx) => {
    const rafael = await ctx.db
      .query("people")
      .withIndex("by_email", (q) => q.eq("email", RAFAEL))
      .unique();
    if (!rafael) throw new Error("seed sem o Rafael");
    const ticketId = await ctx.db.insert("tickets", {
      code: "INC-20421",
      kind: "INC",
      category: "software",
      priority: "CRITICAL",
      priorityReason: "time todo parado",
      prioritySignals: { impact: "team", blocked: true, deadlineToday: false },
      status: "open",
      title: "Sistema de vendas fora do ar",
      description: "Caiu para o time todo",
      affected: "Comercial",
      ownerId: rafael._id,
      createdAt: 1,
      lastActivityAt: 1,
    });
    await ctx.db.insert("ticketUpdates", {
      ticketId,
      authorType: "agent",
      text: "Aberto",
      createdAt: 1,
    });
    await ctx.db.insert("idempotencyKeys", { key: "p1", ticketCode: "INC-20421", createdAt: 1 });
    const conversation = await ctx.db.insert("conversations", {
      employeeId: rafael._id,
      status: "waiting_analyst",
      employeeMessageCount: 1,
      agentBusy: false,
      clarificationAttempts: 0,
      lastMessageAt: 1,
    });
    await ctx.db.insert("messages", {
      conversationId: conversation,
      role: "user",
      authorId: rafael._id,
      parts: [{ type: "text", text: "O sistema de vendas caiu" }],
      status: "complete",
      createdAt: 1,
    });
    return conversation;
  });
  return { t, conversationId };
}

describe("evalsSupport", () => {
  test("sem EVALS_SECRET no deployment, recusa tudo", async () => {
    const { t, conversationId } = await seededWithLeftovers();

    await expect(
      t.mutation(api.evalsSupport.resetForScenario, { secret: "", employeeEmail: RAFAEL }),
    ).rejects.toThrow(/EVALS_SECRET/);
    await expect(t.query(api.evalsSupport.observe, { secret: "", conversationId })).rejects.toThrow(
      /EVALS_SECRET/,
    );
  });

  test("resetForScenario apaga chamados fora do seed e as conversas do funcionário", async () => {
    vi.stubEnv("EVALS_SECRET", SECRET);
    const { t } = await seededWithLeftovers();

    const result = await t.mutation(api.evalsSupport.resetForScenario, {
      secret: SECRET,
      employeeEmail: RAFAEL,
    });

    expect(result).toEqual({ deletedTickets: ["INC-20421"], deletedConversations: 1 });
    const remaining = await t.run(async (ctx) => ({
      tickets: (await ctx.db.query("tickets").collect()).length,
      ticketUpdates: (await ctx.db.query("ticketUpdates").collect()).length,
      keys: (await ctx.db.query("idempotencyKeys").collect()).length,
      conversations: (await ctx.db.query("conversations").collect()).length,
      messages: (await ctx.db.query("messages").collect()).length,
    }));
    // Volta ao seed: 10 chamados, 18 atualizações e só a conversa do Pedro (4 mensagens).
    expect(remaining).toEqual({
      tickets: 10,
      ticketUpdates: 18,
      keys: 0,
      conversations: 1,
      messages: 4,
    });
  });

  test("observe devolve a conversa, as mensagens e os chamados do funcionário", async () => {
    vi.stubEnv("EVALS_SECRET", SECRET);
    const { t, conversationId } = await seededWithLeftovers();

    const snapshot = await t.query(api.evalsSupport.observe, { secret: SECRET, conversationId });

    expect(snapshot.conversation.status).toBe("waiting_analyst");
    expect(snapshot.messages).toHaveLength(1);
    expect(snapshot.employeeTickets.map((ticket) => ticket.code)).toContain("INC-20421");
  });
});
