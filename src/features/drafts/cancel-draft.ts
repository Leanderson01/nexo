import { err, ok, type Result } from "@/domain/result";
import { api } from "../../../convex/_generated/api";
import type { ConvexCaller } from "./convex-caller";
import type { DraftApiErrorCode } from "./draft-api-errors";

// "Cancelar" do rascunho (§6.5 item 4): descarta com o evento visível. No caso crítico, a
// política manda transferir mesmo assim (§6.3); quem decide é a mutation, pelo
// `handoffOnConfirm` do rascunho.

export interface CancelledDraft {
  alreadyCancelled: boolean;
  transferred: boolean;
}

export async function cancelDraft(input: {
  convex: ConvexCaller;
  agentSecret: string;
  conversationId: string;
  pendingActionId: string;
}): Promise<Result<CancelledDraft, DraftApiErrorCode>> {
  const { convex, agentSecret, conversationId, pendingActionId } = input;

  const loaded = await convex.query(api.pendingActions.loadForEmployee, {
    conversationId,
    pendingActionId,
  });
  if (!loaded.ok) return loaded;
  const draft = loaded.value;

  if (draft.status === "cancelled") return ok({ alreadyCancelled: true, transferred: false });
  if (draft.status !== "pending") return err("not_pending");
  if (draft.conversationStatus === "closed") return err("closed");
  if (draft.agentBusy) return err("busy");

  return await convex.mutation(api.pendingActions.cancel, {
    secret: agentSecret,
    employeeId: draft.employeeId,
    conversationId: draft.conversationId,
    pendingActionId: draft.pendingActionId,
  });
}
