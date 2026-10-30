import { createConvexClientForCurrentUser } from "@/features/auth/server";
import { confirmDraft, type ConfirmedDraft } from "@/features/drafts/confirm-draft";
import { draftApiError } from "@/features/drafts/draft-api-errors";
import { draftIdBody } from "@/features/drafts/pending-action-schema";
import { readDraftServerConfig } from "@/features/drafts/server-config";

// POST /api/conversations/:id/pending-action/confirm (§6.5): efetiva o rascunho no serviço
// de chamados, sem passar pelo LLM. Pode ser chamado de novo sem medo: a chave de
// idempotência é o id do rascunho, então nunca nascem dois chamados.

export type ConfirmDraftResponse = ConfirmedDraft;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const config = readDraftServerConfig();
  if (!config) return draftApiError("unavailable");

  const convex = await createConvexClientForCurrentUser();
  if (!convex) return draftApiError("unauthorized");

  const body = draftIdBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return draftApiError("invalid_body");

  const { id } = await context.params;
  try {
    const result = await confirmDraft({
      convex,
      agentSecret: config.agentSecret,
      createGateway: config.createGateway,
      conversationId: id,
      pendingActionId: body.data.pendingActionId,
    });
    if (!result.ok) return draftApiError(result.error);

    const response: ConfirmDraftResponse = result.value;
    return Response.json(response);
  } catch (error) {
    // Erros esperados vêm no Result; aqui só chega o inesperado (guard, rede).
    console.error("[confirm] falha inesperada", error);
    return draftApiError("unavailable");
  }
}
