import { describe, expect, test } from "vitest";

import type { NewTicket, TicketSummary } from "@/domain/ticket";

import { HttpTicketGateway, type TicketGatewayAttempt } from "../http-ticket-gateway";

// O gateway contra um `fetch` falso: cada teste diz o que o "legado" responde em cada
// tentativa e confere o que o gateway mandou e devolveu. `sleep` não espera de verdade.

type FakeReply = Response | "network_error" | "hang";

interface SentRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const summary: TicketSummary = {
  code: "INC-20402",
  kind: "INC",
  category: "network_vpn",
  priority: "HIGH",
  status: "in_progress",
  title: "VPN cai a cada 10 minutos",
  createdAt: 1,
  lastActivityAt: 2,
};

const newTicket: NewTicket = {
  kind: "INC",
  category: "software",
  title: "Excel fecha sozinho",
  description: "O Excel fecha ao abrir planilhas grandes.",
  affected: "Somente você",
  prioritySignals: { impact: "individual", blocked: false, deadlineToday: false },
  priority: "MEDIUM",
  priorityReason: "Atrapalha, mas há alternativa",
};

/** Monta um gateway cujo `fetch` responde, em ordem, com `replies`. */
function setup(replies: FakeReply[], timeoutMs = 2000) {
  const sent: SentRequest[] = [];
  const sleeps: number[] = [];
  const attempts: TicketGatewayAttempt[] = [];

  const fakeFetch: typeof fetch = async (input, init) => {
    sent.push({
      url: String(input),
      headers: init?.headers as Record<string, string>,
      body: JSON.parse(String(init?.body)),
    });
    const reply = replies[sent.length - 1];
    if (reply === undefined) throw new Error("O teste não previu esta tentativa.");
    if (reply === "network_error") throw new TypeError("fetch failed");
    if (reply === "hang") {
      // Nunca responde: só o abort do timeout encerra a espera.
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    }
    return reply;
  };

  const gateway = new HttpTicketGateway({
    baseUrl: "https://legado.example.convex.site/",
    serviceKey: "chave-secreta",
    employeeId: "people-rafael",
    fetch: fakeFetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0.5,
    timeoutMs,
    onAttempt: (attempt) => attempts.push(attempt),
  });
  return { gateway, sent, sleeps, attempts };
}

const unavailable503 = () =>
  jsonResponse(503, { ok: false, error: { kind: "unavailable", message: "fora do ar" } });

describe("HttpTicketGateway", () => {
  test("manda a chave, o funcionário e o corpo para a rota da operação", async () => {
    const { gateway, sent } = setup([jsonResponse(200, { ok: true, value: [summary] })]);

    const result = await gateway.listMine({ onlyOpen: true });

    expect(result).toEqual({ ok: true, value: [summary] });
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://legado.example.convex.site/ticketing/listMine");
    expect(sent[0].headers.Authorization).toBe("Bearer chave-secreta");
    expect(sent[0].headers["X-Employee-Id"]).toBe("people-rafael");
    expect(sent[0].headers["Idempotency-Key"]).toBeUndefined();
    expect(sent[0].body).toEqual({ filter: { onlyOpen: true } });
  });

  test("falha na 1ª tentativa e dá certo na 2ª, depois de ~300 ms", async () => {
    const { gateway, sent, sleeps } = setup([
      unavailable503(),
      jsonResponse(200, { ok: true, value: [summary] }),
    ]);

    const result = await gateway.findSimilar({ description: "VPN caindo", category: null });

    expect(result).toEqual({ ok: true, value: [summary] });
    expect(sent).toHaveLength(2);
    expect(sleeps).toEqual([300]);
  });

  test("esgota as 3 tentativas e devolve unavailable", async () => {
    const { gateway, sent, sleeps } = setup([unavailable503(), "network_error", unavailable503()]);

    const result = await gateway.getMine("INC-20402");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unavailable");
    expect(sent).toHaveLength(3);
    expect(sleeps).toEqual([300, 900]);
  });

  test("o jitter varia a espera em até 20% para cada lado", async () => {
    async function sleepsWith(random: () => number): Promise<number[]> {
      const sleeps: number[] = [];
      const gateway = new HttpTicketGateway({
        baseUrl: "https://legado.example",
        serviceKey: "chave",
        employeeId: "people-rafael",
        fetch: async () => unavailable503(),
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        random,
      });
      await gateway.listMine();
      return sleeps;
    }

    expect(await sleepsWith(() => 0)).toEqual([240, 720]);
    expect(await sleepsWith(() => 1)).toEqual([360, 1080]);
  });

  test("não repete em 404 e repassa o erro do serviço", async () => {
    const { gateway, sent } = setup([
      jsonResponse(404, {
        ok: false,
        error: { kind: "not_found", message: "Chamado não encontrado entre os seus." },
      }),
    ]);

    const result = await gateway.getMine("INC-20311");

    expect(result).toEqual({
      ok: false,
      error: { kind: "not_found", message: "Chamado não encontrado entre os seus." },
    });
    expect(sent).toHaveLength(1);
  });

  test("não repete em 401 e devolve unavailable", async () => {
    const { gateway, sent } = setup([
      jsonResponse(401, { ok: false, error: { kind: "unavailable", message: "chave" } }),
    ]);

    const result = await gateway.listMine();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unavailable");
    expect(sent).toHaveLength(1);
  });

  test("timeout aborta a tentativa e conta como falha que vale repetir", async () => {
    const { gateway, sent, attempts } = setup(
      ["hang", jsonResponse(200, { ok: true, value: [] })],
      20,
    );

    const result = await gateway.listMine();

    expect(result).toEqual({ ok: true, value: [] });
    expect(sent).toHaveLength(2);
    expect(attempts[0]).toMatchObject({ attempt: 1, ok: false, errorKind: "unavailable" });
    expect(attempts[0].latencyMs).toBeGreaterThanOrEqual(15);
  });

  test("todas as tentativas de uma escrita levam a mesma chave de idempotência", async () => {
    const { gateway, sent } = setup([
      unavailable503(),
      "network_error",
      jsonResponse(200, { ok: true, value: { ...newTicket, code: "INC-20421", updates: [] } }),
    ]);

    const result = await gateway.create(newTicket, "pending-action-123");

    expect(result.ok).toBe(true);
    expect(sent.map((request) => request.headers["Idempotency-Key"])).toEqual([
      "pending-action-123",
      "pending-action-123",
      "pending-action-123",
    ]);
    expect(sent[0].body).toEqual({ ticket: newTicket });
  });

  test("markHandoff gera a chave a partir da conversa e do chamado", async () => {
    const { gateway, sent } = setup([jsonResponse(200, { ok: true, value: null })]);

    const result = await gateway.markHandoff("INC-20420", "conv-1");

    expect(result).toEqual({ ok: true, value: undefined });
    expect(sent[0].headers["Idempotency-Key"]).toBe("handoff:conv-1:INC-20420");
    expect(sent[0].body).toEqual({ code: "INC-20420", conversationId: "conv-1" });
  });

  test("o observador recebe cada tentativa, com o método e o resultado", async () => {
    const { gateway, attempts } = setup([
      unavailable503(),
      jsonResponse(409, { ok: false, error: { kind: "conflict", message: "fechado" } }),
    ]);

    await gateway.reopen("INC-20077", "Voltou a falhar", "pending-action-9");

    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({
      method: "reopen",
      attempt: 1,
      ok: false,
      errorKind: "unavailable",
    });
    expect(attempts[1]).toMatchObject({
      method: "reopen",
      attempt: 2,
      ok: false,
      errorKind: "conflict",
    });
    for (const attempt of attempts) expect(attempt.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("o observador marca ok na tentativa que deu certo, sem errorKind", async () => {
    const { gateway, attempts } = setup([jsonResponse(200, { ok: true, value: [] })]);

    await gateway.listMine();

    expect(attempts).toEqual([
      { method: "listMine", attempt: 1, ok: true, latencyMs: expect.any(Number) },
    ]);
  });
});
