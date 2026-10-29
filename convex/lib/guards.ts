import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

// Guards únicos de autorização (§5.10). Nenhuma checagem de permissão fica fora daqui.
// requireEmployee e requireAnalyst dependem do Convex Auth e são implementados na T2;
// até lá, falham de forma explícita.

export async function requireEmployee(ctx: QueryCtx): Promise<Doc<"people">> {
  void ctx;
  throw new Error("requireEmployee: implementado na T2 (Convex Auth)");
}

export async function requireAnalyst(ctx: QueryCtx): Promise<Doc<"people">> {
  void ctx;
  throw new Error("requireAnalyst: implementado na T2 (Convex Auth)");
}

/** Protege as funções de escrita do agent: só o servidor do Next conhece o segredo. */
export function requireAgentServer(secret: string): void {
  const expected = process.env.AGENT_SERVER_SECRET;
  if (!expected || secret !== expected) {
    throw new Error("Acesso negado: chamada do agent sem o segredo do servidor");
  }
}
