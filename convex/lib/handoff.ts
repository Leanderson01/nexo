import { addBusinessHours } from "../../src/domain/business-hours";
import type { Handoff } from "../../src/domain/conversation";
import { transition, TRANSITION_EVENTS } from "../../src/domain/conversation-fsm";
import { err, ok, type Result } from "../../src/domain/result";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

// Transferência da conversa para um analista (§3.3, §5.9). Um lugar só para as três origens:
// o funcionário no limite de mensagens, o agent (pedido, crítico, vencido, baixa confiança)
// e o crítico confirmado ou recusado no rascunho. Toda transferência leva um resumo, e a
// partir daqui o agent não responde mais (o `sendUserMessage` só dispara turno em `agent`).

export type TransferError = "invalid_transition";

export async function transferToAnalyst(
  ctx: MutationCtx,
  conversation: Doc<"conversations">,
  handoff: Omit<Handoff, "at">,
  now: number = Date.now(),
): Promise<Result<null, TransferError>> {
  const next = transition(conversation.status, "transfer");
  if (!next.ok) return err("invalid_transition");

  await ctx.db.patch(conversation._id, {
    status: next.value,
    handoff: { ...handoff, at: now },
    lastMessageAt: now,
  });
  await ctx.db.insert("messages", {
    conversationId: conversation._id,
    role: "system",
    parts: [
      { type: "handoff", reason: handoff.reason, outOfHours: isOutOfBusinessHours(now) },
      { type: "event", kind: TRANSITION_EVENTS.transfer },
    ],
    status: "complete",
    createdAt: now,
  });
  return ok(null);
}

/** Fora do expediente, somar zero horas úteis empurra o instante para o próximo início. */
function isOutOfBusinessHours(now: number): boolean {
  return addBusinessHours(now, 0) !== now;
}
