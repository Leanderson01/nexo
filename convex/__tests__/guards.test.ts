/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "../_generated/api";
import { requireAnalyst, requireEmployee } from "../lib/guards";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");

/** Cria o usuário do Convex Auth com o e-mail e devolve um cliente logado como ele. */
async function loginAs(t: ReturnType<typeof convexTest>, email: string) {
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

describe("guards", () => {
  test("requireEmployee aceita funcionário e recusa analista", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.run, {});

    const mariana = await loginAs(t, "mariana.costa@nexo.com.br");
    const person = await mariana.run((ctx) => requireEmployee(ctx));
    expect(person.name).toBe("Mariana Costa");

    const ana = await loginAs(t, "ana.ribeiro@nexo.com.br");
    await expect(ana.run((ctx) => requireEmployee(ctx))).rejects.toThrow(
      "Acesso restrito a funcionários.",
    );
  });

  test("requireAnalyst aceita analista e recusa funcionário", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.run, {});

    const carlos = await loginAs(t, "carlos.mendes@nexo.com.br");
    const person = await carlos.run((ctx) => requireAnalyst(ctx));
    expect(person.level).toBe("N2");

    const pedro = await loginAs(t, "pedro.santos@nexo.com.br");
    await expect(pedro.run((ctx) => requireAnalyst(ctx))).rejects.toThrow(
      "Acesso restrito a analistas.",
    );
  });

  test("sem sessão, os dois guards recusam", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.run, {});
    await expect(t.run((ctx) => requireEmployee(ctx))).rejects.toThrow("Sessão expirada");
    await expect(t.run((ctx) => requireAnalyst(ctx))).rejects.toThrow("Sessão expirada");
  });
});
