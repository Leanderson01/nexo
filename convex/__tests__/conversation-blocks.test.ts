/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "../_generated/api";
import schema from "../schema";

// Leituras dos blocos escopadas pela conversa (T12): o analista lê os blocos de qualquer
// conversa, mas só chamados do funcionário daquela conversa; o funcionário, só os seus.

const modules = import.meta.glob("../**/*.ts");

const ANA = "ana.ribeiro@nexo.com.br";
const PEDRO = "pedro.santos@nexo.com.br";
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

/** A conversa do seed (do Pedro), com o rascunho D-380 e uma resposta do agent. */
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
    return {
      conversationId: pendingAction.conversationId,
      pendingActionId: pendingAction._id,
      messageId: assistantMessage._id,
    };
  });
  return { t, ...seeded };
}

describe("conversationBlocks.ticket", () => {
  test("o analista lê o chamado do funcionário da conversa, e só dele", async () => {
    const { t, conversationId } = await setup();
    const ana = await loginAs(t, ANA);

    const own = await ana.query(api.conversationBlocks.ticket, {
      conversationId,
      code: "INC-20420",
    });
    // INC-20311 é da Mariana: pela conversa do Pedro, não aparece.
    const other = await ana.query(api.conversationBlocks.ticket, {
      conversationId,
      code: "INC-20311",
    });

    expect(own?.code).toBe("INC-20420");
    expect(other).toBeNull();
  });

  test("o funcionário lê pela própria conversa e não pela de outra pessoa", async () => {
    const { t, conversationId } = await setup();
    const pedro = await loginAs(t, PEDRO);
    const mariana = await loginAs(t, MARIANA);

    const byOwner = await pedro.query(api.conversationBlocks.ticket, {
      conversationId,
      code: "INC-20420",
    });
    const byStranger = await mariana.query(api.conversationBlocks.ticket, {
      conversationId,
      code: "INC-20420",
    });

    expect(byOwner?.code).toBe("INC-20420");
    expect(byStranger).toBeNull();
  });

  test("id de conversa malformado devolve null", async () => {
    const { t } = await setup();
    const ana = await loginAs(t, ANA);

    expect(
      await ana.query(api.conversationBlocks.ticket, { conversationId: "x", code: "INC-20420" }),
    ).toBeNull();
  });
});

describe("conversationBlocks.tickets", () => {
  test("lista só os chamados do funcionário da conversa", async () => {
    const { t, conversationId } = await setup();
    const ana = await loginAs(t, ANA);
    const mariana = await loginAs(t, MARIANA);

    const tickets = await ana.query(api.conversationBlocks.tickets, { conversationId });

    expect(tickets?.map((ticket) => ticket.code).sort()).toEqual([
      "INC-20388",
      "INC-20395",
      "INC-20420",
    ]);
    expect(await mariana.query(api.conversationBlocks.tickets, { conversationId })).toBeNull();
  });
});

describe("conversationBlocks.pendingAction e actionLabels", () => {
  test("o analista lê o rascunho e os chips; outro funcionário não", async () => {
    const { t, pendingActionId, messageId } = await setup();
    const ana = await loginAs(t, ANA);
    const mariana = await loginAs(t, MARIANA);

    expect(
      await ana.query(api.conversationBlocks.pendingAction, { pendingActionId }),
    ).toMatchObject({ draftNumber: 380, status: "confirmed", resultTicketCode: "INC-20420" });
    expect(await ana.query(api.conversationBlocks.actionLabels, { messageId })).toEqual([]);

    expect(
      await mariana.query(api.conversationBlocks.pendingAction, { pendingActionId }),
    ).toBeNull();
    expect(await mariana.query(api.conversationBlocks.actionLabels, { messageId })).toBeNull();
  });

  test("sem sessão, lança", async () => {
    const { t, pendingActionId } = await setup();

    await expect(
      t.query(api.conversationBlocks.pendingAction, { pendingActionId }),
    ).rejects.toThrow("Sessão expirada");
  });
});
