import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

// Guards únicos de autorização (§5.10). Nenhuma checagem de permissão fica fora daqui.
// A pessoa logada é o usuário do Convex Auth ligado à tabela `people` pelo e-mail.

/** A pessoa logada, ou null sem sessão válida. Para telas que só precisam saber quem é. */
export async function getCurrentPerson(ctx: QueryCtx): Promise<Doc<"people"> | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;

  const user = await ctx.db.get(userId);
  const email = user?.email;
  if (!email) return null;

  return await ctx.db
    .query("people")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
}

async function requirePerson(ctx: QueryCtx): Promise<Doc<"people">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("Sessão expirada. Entre novamente.");

  const person = await getCurrentPerson(ctx);
  if (!person) throw new ConvexError("Não encontramos esse e-mail.");
  return person;
}

export async function requireEmployee(ctx: QueryCtx): Promise<Doc<"people">> {
  const person = await requirePerson(ctx);
  if (person.role !== "employee") throw new ConvexError("Acesso restrito a funcionários.");
  return person;
}

export async function requireAnalyst(ctx: QueryCtx): Promise<Doc<"people">> {
  const person = await requirePerson(ctx);
  if (person.role !== "analyst") throw new ConvexError("Acesso restrito a analistas.");
  return person;
}

/** Protege as funções de escrita do agent: só o servidor do Next conhece o segredo. */
export function requireAgentServer(secret: string): void {
  const expected = process.env.AGENT_SERVER_SECRET;
  if (!expected || secret !== expected) {
    throw new ConvexError("Acesso negado: chamada do agent sem o segredo do servidor.");
  }
}
