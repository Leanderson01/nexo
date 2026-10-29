/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";
import { beforeAll, describe, expect, test } from "vitest";

import { api, internal } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");

// O Convex Auth assina o token com estas variáveis; no teste, geramos um par descartável.
beforeAll(async () => {
  const keys = await generateKeyPair("RS256", { extractable: true });
  process.env.JWT_PRIVATE_KEY = (await exportPKCS8(keys.privateKey)).replace(/\n/g, " ");
  process.env.JWKS = JSON.stringify({
    keys: [{ use: "sig", ...(await exportJWK(keys.publicKey)) }],
  });
  process.env.CONVEX_SITE_URL = "http://127.0.0.1:3211";
  process.env.SITE_URL = "http://localhost:3000";
});

function signInWith(t: ReturnType<typeof convexTest>, email: string) {
  return t.action(api.auth.signIn, {
    provider: "credentials",
    params: { email, password: "qualquer-coisa" },
  });
}

describe("login de demonstração", () => {
  test("e-mail do seed entra com qualquer senha e o usuário guarda o e-mail", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.run, {});

    const result = await signInWith(t, "Mariana.Costa@nexo.com.br ");
    expect(result.tokens?.token).toEqual(expect.any(String));

    const users = await t.run((ctx) => ctx.db.query("users").collect());
    expect(users.map((user) => user.email)).toEqual(["mariana.costa@nexo.com.br"]);
  });

  test("entrar de novo reaproveita o mesmo usuário", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.run, {});
    await signInWith(t, "rafael.lima@nexo.com.br");
    await signInWith(t, "rafael.lima@nexo.com.br");

    const users = await t.run((ctx) => ctx.db.query("users").collect());
    expect(users).toHaveLength(1);
  });

  test("e-mail fora do seed não autentica", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.run, {});

    await expect(signInWith(t, "intruso@nexo.com.br")).rejects.toThrow(
      "Não encontramos esse e-mail.",
    );
    const users = await t.run((ctx) => ctx.db.query("users").collect());
    expect(users).toHaveLength(0);
  });
});
