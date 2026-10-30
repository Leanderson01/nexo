/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import {
  criticalDraftDecision,
  overdueTicketDecision,
} from "../../src/features/decision-panel/fixtures";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");

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

/** Seed + uma conversa da Mariana com uma resposta do agent e o registro do turno. */
async function setup(record = overdueTicketDecision) {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});

  const decisionId: Id<"decisions"> = await t.run(async (ctx) => {
    const mariana = await ctx.db
      .query("people")
      .withIndex("by_email", (q) => q.eq("email", "mariana.costa@nexo.com.br"))
      .unique();
    if (!mariana) throw new Error("seed sem a Mariana");

    const conversationId = await ctx.db.insert("conversations", {
      employeeId: mariana._id,
      status: "agent",
      employeeMessageCount: 1,
      agentBusy: false,
      clarificationAttempts: 0,
      lastMessageAt: record.createdAt,
    });
    const messageId = await ctx.db.insert("messages", {
      conversationId,
      role: "assistant",
      parts: [{ type: "text", text: "Seu chamado INC-20311 está vencido." }],
      status: "complete",
      createdAt: record.createdAt,
    });
    return await ctx.db.insert("decisions", { conversationId, messageId, ...record });
  });

  return { t, decisionId };
}

describe("decisionPanel.get", () => {
  test("o funcionário dono da conversa lê o registro, sem os ids internos", async () => {
    const { t, decisionId } = await setup();
    const mariana = await loginAs(t, "mariana.costa@nexo.com.br");

    const record = await mariana.query(api.decisionPanel.get, { decisionId });
    expect(record).toEqual(overdueTicketDecision);
  });

  test("devolve a prioridade calculada quando o registro tem", async () => {
    const { t, decisionId } = await setup(criticalDraftDecision);
    const mariana = await loginAs(t, "mariana.costa@nexo.com.br");

    const record = await mariana.query(api.decisionPanel.get, { decisionId });
    expect(record?.derived?.priority?.value).toBe("CRITICAL");
  });

  test("outro funcionário não lê: recebe o mesmo 'não encontrado'", async () => {
    const { t, decisionId } = await setup();
    const pedro = await loginAs(t, "pedro.santos@nexo.com.br");

    expect(await pedro.query(api.decisionPanel.get, { decisionId })).toBeNull();
  });

  test("qualquer analista lê", async () => {
    const { t, decisionId } = await setup();
    const ana = await loginAs(t, "ana.ribeiro@nexo.com.br");

    expect(await ana.query(api.decisionPanel.get, { decisionId })).toEqual(overdueTicketDecision);
  });

  test("id malformado ou inexistente dá null; sem sessão, recusa", async () => {
    const { t, decisionId } = await setup();
    const mariana = await loginAs(t, "mariana.costa@nexo.com.br");

    expect(await mariana.query(api.decisionPanel.get, { decisionId: "nao-e-um-id" })).toBeNull();
    await t.run(async (ctx) => ctx.db.delete(decisionId));
    expect(await mariana.query(api.decisionPanel.get, { decisionId })).toBeNull();

    await expect(t.query(api.decisionPanel.get, { decisionId })).rejects.toThrow("Sessão expirada");
  });
});
