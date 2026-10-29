/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");

const DAY = 24 * 60 * 60 * 1000;

async function countAll(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => ({
    people: (await ctx.db.query("people").collect()).length,
    tickets: (await ctx.db.query("tickets").collect()).length,
    ticketUpdates: (await ctx.db.query("ticketUpdates").collect()).length,
    articles: (await ctx.db.query("articles").collect()).length,
    counters: (await ctx.db.query("counters").collect()).length,
    conversations: (await ctx.db.query("conversations").collect()).length,
    messages: (await ctx.db.query("messages").collect()).length,
    pendingActions: (await ctx.db.query("pendingActions").collect()).length,
  }));
}

describe("seed", () => {
  test("rodar duas vezes não duplica nada", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.run, {});
    const first = await countAll(t);
    await t.mutation(internal.seed.run, {});
    const second = await countAll(t);

    expect(first).toEqual({
      people: 6,
      tickets: 10,
      ticketUpdates: 18,
      articles: 8,
      counters: 3,
      conversations: 1,
      messages: 4,
      pendingActions: 1,
    });
    expect(second).toEqual(first);
  });

  test("rodar de novo recalcula as datas relativas a partir do novo agora", async () => {
    const t = convexTest(schema, modules);
    const firstRun = Date.UTC(2026, 9, 1, 15);
    const secondRun = firstRun + 5 * DAY;
    await t.mutation(internal.seed.run, { now: firstRun });
    await t.mutation(internal.seed.run, { now: secondRun });

    const overdue = await t.run((ctx) =>
      ctx.db
        .query("tickets")
        .withIndex("by_code", (q) => q.eq("code", "INC-20311"))
        .unique(),
    );
    expect(overdue?.lastActivityAt).toBe(secondRun - 6 * DAY);
  });

  test("não volta um contador que o app já avançou", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.run, {});
    await t.run(async (ctx) => {
      const inc = await ctx.db
        .query("counters")
        .withIndex("by_name", (q) => q.eq("name", "INC"))
        .unique();
      if (inc) await ctx.db.patch(inc._id, { value: 20425 });
    });
    await t.mutation(internal.seed.run, {});

    const inc = await t.run((ctx) =>
      ctx.db
        .query("counters")
        .withIndex("by_name", (q) => q.eq("name", "INC"))
        .unique(),
    );
    expect(inc?.value).toBe(20425);
  });

  test("segue os ajustes do TASKS.md: REQ-10442 há 3 dias e conversa do Pedro", async () => {
    const t = convexTest(schema, modules);
    const now = Date.UTC(2026, 9, 1, 15);
    await t.mutation(internal.seed.run, { now });

    const { req, conversation, pedro } = await t.run(async (ctx) => ({
      req: await ctx.db
        .query("tickets")
        .withIndex("by_code", (q) => q.eq("code", "REQ-10442"))
        .unique(),
      conversation: await ctx.db.query("conversations").first(),
      pedro: await ctx.db
        .query("people")
        .withIndex("by_email", (q) => q.eq("email", "pedro.santos@nexo.com.br"))
        .unique(),
    }));
    expect(req?.lastActivityAt).toBe(now - 3 * DAY);
    expect(conversation?.employeeId).toBe(pedro?._id);
    expect(conversation?.status).toBe("waiting_analyst");
    expect(conversation?.handoff).toMatchObject({ reason: "critical", ticketCode: "INC-20420" });
  });
});
