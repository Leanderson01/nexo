import type { PendingAction } from "@/domain/pending-action";
import { createConvexClientForCurrentUser } from "@/features/auth/server";
import { draftApiError } from "@/features/drafts/draft-api-errors";
import { editDraftBody } from "@/features/drafts/pending-action-schema";
import { api } from "../../../../../../convex/_generated/api";

// PATCH /api/conversations/:id/pending-action (§6.5 item 3): edição inline do rascunho.
// Roda como o funcionário; a mutation valida os campos e recalcula a prioridade a partir
// dos sinais (a que vier do cliente é ignorada).

export interface EditDraftResponse {
  action: PendingAction;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const convex = await createConvexClientForCurrentUser();
  if (!convex) return draftApiError("unauthorized");

  const body = editDraftBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return draftApiError("invalid_body");

  const { id } = await context.params;
  let result;
  try {
    result = await convex.mutation(api.pendingActions.edit, {
      conversationId: id,
      pendingActionId: body.data.pendingActionId,
      action: body.data.action,
    });
  } catch (error) {
    console.error("[pending-action] falha ao editar o rascunho", error);
    return draftApiError("unavailable");
  }
  if (!result.ok) return draftApiError(result.error);

  const response: EditDraftResponse = { action: result.value };
  return Response.json(response);
}
