/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "../_generated/api";
import { MAX_EXCERPT_LENGTH } from "../knowledge/ranking";
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

async function setupAsMariana() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  return { t, mariana: await loginAs(t, "mariana.costa@nexo.com.br") };
}

describe("knowledge.articles.search", () => {
  test.each([
    ["VPN erro 809", "vpn-erro-809"],
    ["minha VPN dá erro 809", "vpn-erro-809"],
    ["senha do SAP bloqueada", "senha-sap-bloqueada"],
    ["esqueci a senha de rede", "redefinir-senha-de-rede"],
    ["como instalo o Figma", "instalar-software"],
    ["preciso de um segundo monitor", "solicitar-equipamento"],
    ["configurar email no celular", "email-corporativo-no-celular"],
    ["wi-fi da empresa", "wifi-corporativo"],
    ["horário do suporte", "horario-service-desk"],
    ["HORARIO DO SUPORTE", "horario-service-desk"],
  ])("%s → %s em primeiro", async (phrase, expectedSlug) => {
    const { mariana } = await setupAsMariana();
    const results = await mariana.query(api.knowledge.articles.search, { query: phrase });
    expect(results[0]?.slug).toBe(expectedSlug);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  test("devolve conditions e um trecho com o termo buscado", async () => {
    const { mariana } = await setupAsMariana();
    const [vpn] = await mariana.query(api.knowledge.articles.search, { query: "VPN erro 809" });

    expect(vpn.title).toBe("VPN com erro 809");
    expect(vpn.conditions).toEqual([{ field: "os", appliesTo: ["Windows 10"] }]);
    expect(vpn.excerpt).toContain("cliente de VPN");
    expect(vpn.excerpt.length).toBeLessThanOrEqual(MAX_EXCERPT_LENGTH);
    expect(vpn).not.toHaveProperty("searchText");
  });

  test("frase sem nada a ver ou só com palavras vazias não devolve artigo", async () => {
    const { mariana } = await setupAsMariana();
    expect(await mariana.query(api.knowledge.articles.search, { query: "de que a o" })).toEqual([]);
    expect(
      await mariana.query(api.knowledge.articles.search, { query: "receita de bolo" }),
    ).toEqual([]);
  });

  test("analista também pode buscar", async () => {
    const { t } = await setupAsMariana();
    const ana = await loginAs(t, "ana.ribeiro@nexo.com.br");
    const results = await ana.query(api.knowledge.articles.search, { query: "VPN erro 809" });
    expect(results[0]?.slug).toBe("vpn-erro-809");
  });

  test("sem sessão, recusa", async () => {
    const { t } = await setupAsMariana();
    await expect(t.query(api.knowledge.articles.search, { query: "VPN" })).rejects.toThrow(
      "Sessão expirada",
    );
  });
});

describe("knowledge.articles.getBySlug", () => {
  test("devolve o artigo, ou null se o slug não existe", async () => {
    const { mariana } = await setupAsMariana();
    const article = await mariana.query(api.knowledge.articles.getBySlug, {
      slug: "wifi-corporativo",
    });
    expect(article?.title).toBe("Conectar ao Wi-Fi corporativo");
    expect(article).not.toHaveProperty("searchText");

    expect(
      await mariana.query(api.knowledge.articles.getBySlug, { slug: "nao-existe" }),
    ).toBeNull();
  });

  test("sem sessão, recusa", async () => {
    const { t } = await setupAsMariana();
    await expect(
      t.query(api.knowledge.articles.getBySlug, { slug: "wifi-corporativo" }),
    ).rejects.toThrow("Sessão expirada");
  });
});
