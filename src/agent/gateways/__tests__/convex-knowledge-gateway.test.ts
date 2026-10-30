import { describe, expect, test } from "vitest";

import {
  ConvexKnowledgeGateway,
  type KnowledgeGatewayAttempt,
  type KnowledgeQueryClient,
} from "../convex-knowledge-gateway";
import type { ArticleMatch } from "../knowledge-gateway";

// O gateway contra um cliente do Convex falso: o teste diz o que a query devolve (ou se a
// chamada falha) e confere o resultado e o que foi informado ao observador.

const vpnMatch: ArticleMatch = {
  slug: "vpn-erro-809",
  title: "VPN com erro 809",
  body: "Reinstale o cliente de VPN. Vale apenas para Windows 10.",
  tags: ["vpn"],
  conditions: [{ field: "os", appliesTo: ["Windows 10"] }],
  excerpt: "Reinstale o cliente de VPN.",
};

/** Cliente que guarda os argumentos recebidos e responde `reply` (ou lança, se for erro). */
function fakeClient(reply: ArticleMatch[] | Error, calls: unknown[] = []): KnowledgeQueryClient {
  return {
    query: async (_query: unknown, args: unknown) => {
      calls.push(args);
      if (reply instanceof Error) throw reply;
      return reply;
    },
  } as KnowledgeQueryClient;
}

function setup(reply: ArticleMatch[] | Error) {
  const calls: unknown[] = [];
  const attempts: KnowledgeGatewayAttempt[] = [];
  const client = fakeClient(reply, calls);
  const gateway = new ConvexKnowledgeGateway({
    client,
    onAttempt: (attempt) => attempts.push(attempt),
  });
  return { gateway, calls, attempts };
}

describe("ConvexKnowledgeGateway", () => {
  test("devolve os artigos da query, com a frase do funcionário", async () => {
    const { gateway, calls, attempts } = setup([vpnMatch]);

    const result = await gateway.search("minha VPN dá erro 809");

    expect(result).toEqual({ ok: true, value: [vpnMatch] });
    expect(calls).toEqual([{ query: "minha VPN dá erro 809" }]);
    expect(attempts).toEqual([
      { method: "search", attempt: 1, ok: true, latencyMs: expect.any(Number) },
    ]);
  });

  test("falha de rede vira unavailable, sem exceção", async () => {
    const { gateway, attempts } = setup(new TypeError("fetch failed"));

    const result = await gateway.search("VPN");

    expect(result).toEqual({
      ok: false,
      error: { kind: "unavailable", message: "A central de ajuda está indisponível no momento." },
    });
    expect(attempts).toEqual([
      {
        method: "search",
        attempt: 1,
        ok: false,
        latencyMs: expect.any(Number),
        errorKind: "unavailable",
      },
    ]);
  });

  test("funciona sem observador", async () => {
    const gateway = new ConvexKnowledgeGateway({ client: fakeClient([]) });
    expect(await gateway.search("nada")).toEqual({ ok: true, value: [] });
  });
});
