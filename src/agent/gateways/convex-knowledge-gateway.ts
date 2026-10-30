import type { ConvexHttpClient } from "convex/browser";

import type { GatewayErrorKind } from "@/domain/enums";
import { err, ok, type Result } from "@/domain/result";

import { api } from "../../../convex/_generated/api";
import type { GatewayError } from "./gateway-error";
import type { ArticleMatch, KnowledgeGateway } from "./knowledge-gateway";

// Adapter da central de ajuda: chama a query `knowledge/articles:search` do Convex como o
// próprio funcionário (o cliente chega autenticado pela rota). Uma tentativa só: a central
// não é o legado instável, e qualquer falha vira `unavailable` em vez de exceção.

/** Uma chamada à central, para o trace do agent (`withTrace` da T10). */
export interface KnowledgeGatewayAttempt {
  method: "search";
  /** Sempre 1: não há retry. Mantém o formato do `TicketGatewayAttempt`. */
  attempt: number;
  ok: boolean;
  latencyMs: number;
  errorKind?: GatewayErrorKind;
}

/** O que o gateway usa do `ConvexHttpClient`; nos testes, um cliente falso. */
export type KnowledgeQueryClient = Pick<ConvexHttpClient, "query">;

export interface ConvexKnowledgeGatewayOptions {
  /** De `createConvexClientForCurrentUser()`, já com `setAuth`. */
  client: KnowledgeQueryClient;
  onAttempt?: (attempt: KnowledgeGatewayAttempt) => void;
}

const UNAVAILABLE_MESSAGE = "A central de ajuda está indisponível no momento.";

export class ConvexKnowledgeGateway implements KnowledgeGateway {
  constructor(private readonly options: ConvexKnowledgeGatewayOptions) {}

  async search(query: string): Promise<Result<ArticleMatch[], GatewayError>> {
    const startedAt = performance.now();
    const result = await this.runSearch(query);
    this.options.onAttempt?.({
      method: "search",
      attempt: 1,
      ok: result.ok,
      latencyMs: Math.round(performance.now() - startedAt),
      ...(!result.ok && { errorKind: result.error.kind }),
    });
    return result;
  }

  private async runSearch(query: string): Promise<Result<ArticleMatch[], GatewayError>> {
    try {
      const matches = await this.options.client.query(api.knowledge.articles.search, { query });
      return ok(matches);
    } catch {
      // Rede fora, deployment parado ou sessão expirada: o agent segue sem a central.
      return err({ kind: "unavailable", message: UNAVAILABLE_MESSAGE });
    }
  }
}
