import { createConvexClientForCurrentUser } from "@/features/auth/server";
import { cancelDraft, type CancelledDraft } from "@/features/drafts/cancel-draft";
import { draftApiError } from "@/features/drafts/draft-api-errors";
import { draftIdBody } from "@/features/drafts/pending-action-schema";
import { readDraftServerConfig } from "@/features/drafts/server-config";

// POST /api/conversations/:id/pending-action/cancel (§6.5): descarta o rascunho com um
// evento visível. Caso crítico transfere para um analista mesmo assim (§6.3).

export type CancelDraftResponse = CancelledDraft;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const config = readDraftServerConfig();
  if (!config) return draftApiError("unavailable");

  const convex = await createConvexClientForCurrentUser();
  if (!convex) return draftApiError("unauthorized");

  const body = draftIdBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return draftApiError("invalid_body");

  const { id } = await context.params;
  try {
    const result = await cancelDraft({
      convex,
      agentSecret: config.agentSecret,
      conversationId: id,
      pendingActionId: body.data.pendingActionId,
    });
    if (!result.ok) return draftApiError(result.error);

    const response: CancelDraftResponse = result.value;
    return Response.json(response);
  } catch (error) {
    console.error("[cancel] falha inesperada", error);
    return draftApiError("unavailable");
  }
}
