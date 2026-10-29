/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import type { NewTicket } from "../../src/domain/ticket";

// A API HTTP do serviço de chamados de ponta a ponta, com `t.fetch`.

const modules = import.meta.glob("../**/*.ts");
const SERVICE_KEY = "chave-de-teste";

type Test = TestConvex<typeof schema>;

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

async function personId(t: Test, email: string): Promise<Id<"people">> {
  const person = await t.run((ctx) =>
    ctx.db
      .query("people")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique(),
  );
  if (!person) throw new Error(`Pessoa ${email} não está na seed.`);
  return person._id;
}

async function seeded(): Promise<{ t: Test; mariana: Id<"people"> }> {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  return { t, mariana: await personId(t, "mariana.costa@nexo.com.br") };
}

function post(
  t: Test,
  operation: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<Response> {
  return t.fetch(`/ticketing/${operation}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function authHeaders(employeeId: string, idempotencyKey?: string): Record<string, string> {
  return {
    Authorization: `Bearer ${SERVICE_KEY}`,
    "X-Employee-Id": employeeId,
    ...(idempotencyKey !== undefined && { "Idempotency-Key": idempotencyKey }),
  };
}

beforeEach(() => {
  vi.stubEnv("TICKETING_SERVICE_KEY", SERVICE_KEY);
  vi.stubEnv("TICKETING_FAILURE_RATE", "");
  vi.stubEnv("TICKETING_LATENCY_MS", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("API HTTP /ticketing", () => {
  test("cria um chamado e devolve 200 com o detalhe", async () => {
    const { t, mariana } = await seeded();

    const response = await post(
      t,
      "create",
      { ticket: excelTicket },
      authHeaders(mariana, "pending-1"),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, value: { code: "INC-20421", status: "open" } });
  });

  test("sem a chave certa responde 401", async () => {
    const { t, mariana } = await seeded();

    const response = await post(
      t,
      "listMine",
      {},
      {
        ...authHeaders(mariana),
        Authorization: "Bearer errada",
      },
    );

    expect(response.status).toBe(401);
  });

  test("funcionário desconhecido responde 401", async () => {
    const { t } = await seeded();

    const response = await post(t, "listMine", {}, authHeaders("nao-e-um-id"));

    expect(response.status).toBe(401);
  });

  test("chamado alheio e inexistente: o mesmo 404 com o mesmo corpo", async () => {
    const { t, mariana } = await seeded();

    const alien = await post(t, "getMine", { code: "INC-20402" }, authHeaders(mariana));
    const missing = await post(t, "getMine", { code: "INC-99999" }, authHeaders(mariana));

    expect(alien.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await alien.json()).toEqual(await missing.json());
  });

  test("escrita sem Idempotency-Key ou com corpo inválido responde 422", async () => {
    const { t, mariana } = await seeded();

    const withoutKey = await post(t, "create", { ticket: excelTicket }, authHeaders(mariana));
    const badBody = await post(
      t,
      "create",
      { ticket: { ...excelTicket, kind: "BUG" } },
      authHeaders(mariana, "pending-1"),
    );

    expect(withoutKey.status).toBe(422);
    expect(badBody.status).toBe(422);
    expect(await badBody.json()).toMatchObject({ ok: false, error: { kind: "validation" } });
  });

  test("reabrir fora do prazo responde 409", async () => {
    const { t } = await seeded();
    const rafael = await personId(t, "rafael.lima@nexo.com.br");

    const response = await post(
      t,
      "reopen",
      { code: "INC-20077", reason: "Voltou a cair." },
      authHeaders(rafael, "pending-1"),
    );

    expect(response.status).toBe(409);
  });

  test("modo caos com taxa 1 responde 503 depois de autenticar", async () => {
    vi.stubEnv("TICKETING_FAILURE_RATE", "1");
    const { t, mariana } = await seeded();

    const response = await post(t, "listMine", {}, authHeaders(mariana));
    const withoutKey = await post(t, "listMine", {}, {});

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, error: { kind: "unavailable" } });
    expect(withoutKey.status).toBe(401);
  });
});
