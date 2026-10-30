import { v } from "convex/values";

import { query } from "./_generated/server";
import { findOwnedConversation } from "./conversations";
import { requireEmployee } from "./lib/guards";

// Leitura do rascunho para o card do chat (§6.5). Confirmar, editar e cancelar são da T11.

/** O rascunho com o estado atual; null se não existe ou é de outra pessoa. */
export const get = query({
  args: { pendingActionId: v.string() },
  handler: async (ctx, { pendingActionId }) => {
    const employee = await requireEmployee(ctx);
    const id = ctx.db.normalizeId("pendingActions", pendingActionId);
    const pendingAction = id ? await ctx.db.get(id) : null;
    if (!pendingAction) return null;

    const conversation = await findOwnedConversation(
      ctx,
      employee._id,
      pendingAction.conversationId,
    );
    if (!conversation) return null;

    return {
      id: pendingAction._id as string,
      draftNumber: pendingAction.draftNumber,
      action: pendingAction.action,
      status: pendingAction.status,
      resultTicketCode: pendingAction.resultTicketCode ?? null,
      createdAt: pendingAction.createdAt,
      resolvedAt: pendingAction.resolvedAt ?? null,
    };
  },
});
