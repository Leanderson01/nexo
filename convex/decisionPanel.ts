import { v } from "convex/values";

import type { DecisionRecord } from "../src/domain/decision-record";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { canReadConversation, requirePerson } from "./lib/guards";

// Leitura do painel de decisão (§7.3), usada pela gaveta do chat e do console.
// Arquivo separado de `decisions.ts` (rótulos dos chips, T7) para as duas frentes não se cruzarem.

/** O registro de um turno, para o funcionário dono da conversa ou para um analista. */
export const get = query({
  args: { decisionId: v.string() },
  handler: async (ctx, { decisionId: rawDecisionId }): Promise<DecisionRecord | null> => {
    const person = await requirePerson(ctx);

    // Id malformado, inexistente ou de conversa alheia: o mesmo "não encontrado".
    const decisionId = ctx.db.normalizeId("decisions", rawDecisionId);
    if (!decisionId) return null;

    const decision = await ctx.db.get(decisionId);
    if (!decision) return null;

    const conversation = await ctx.db.get(decision.conversationId);
    if (!conversation || !canReadConversation(person, conversation)) return null;

    return toDecisionRecord(decision);
  },
});

/** Só os campos do contrato: o painel e o "ver JSON" não precisam dos ids internos. */
function toDecisionRecord(decision: Doc<"decisions">): DecisionRecord {
  return {
    understanding: decision.understanding,
    policies: decision.policies,
    actions: decision.actions,
    // Campo opcional: o Convex não devolve `undefined`, então só entra quando existe.
    ...(decision.derived ? { derived: decision.derived } : {}),
    confidence: decision.confidence,
    rationale: decision.rationale,
    outcome: decision.outcome,
    ...(decision.shortCircuit !== undefined ? { shortCircuit: decision.shortCircuit } : {}),
    ...(decision.errorStage ? { errorStage: decision.errorStage } : {}),
    ...(decision.corrections ? { corrections: decision.corrections } : {}),
    usage: decision.usage,
    createdAt: decision.createdAt,
  };
}
