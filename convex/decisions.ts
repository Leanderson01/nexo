import { v } from "convex/values";

import { query } from "./_generated/server";
import { findOwnedConversation } from "./conversations";
import { requireEmployee } from "./lib/guards";

// Leitura do registro de decisão para o chat (§7.2). Aqui só os rótulos dos chips;
// o registro completo (painel de decisão) é da T8.

/**
 * Rótulos dos chips de ação de uma resposta do agent ("consultou seus chamados").
 * Null se a mensagem não existe ou é de outra pessoa; lista vazia se não há registro.
 */
export const getActionLabels = query({
  args: { messageId: v.string() },
  handler: async (ctx, { messageId }): Promise<string[] | null> => {
    const employee = await requireEmployee(ctx);
    const id = ctx.db.normalizeId("messages", messageId);
    const message = id ? await ctx.db.get(id) : null;
    if (!message) return null;

    const conversation = await findOwnedConversation(ctx, employee._id, message.conversationId);
    if (!conversation) return null;

    const decision = message.decisionId ? await ctx.db.get(message.decisionId) : null;
    return decision ? decision.actions.map((action) => action.label) : [];
  },
});
