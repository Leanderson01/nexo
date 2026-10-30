import { after } from "next/server";

import { runTurn } from "@/agent/pipeline/run-turn";
import { createConvexClientForCurrentUser } from "@/features/auth/server";
import { confirmDraft } from "@/features/drafts/confirm-draft";
import { draftApiError } from "@/features/drafts/draft-api-errors";
import { readDraftServerConfig } from "@/features/drafts/server-config";
import { api } from "../../../../../../convex/_generated/api";

// POST /api/conversations/:id/retry (§9, §10): o "Tentar de novo" da mensagem de erro.
// Repete o que falhou por último: o turno do agent (202; roda depois da resposta com
// `after()`, como na rota de mensagens) ou a confirmação do rascunho (200, sem LLM).

export type RetryResponse =
  { kind: "turn"; assistantMessageId: string } | { kind: "confirm"; ticketCode: string };

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const config = readDraftServerConfig();
  if (!config) return draftApiError("unavailable");

  const convex = await createConvexClientForCurrentUser();
  if (!convex) return draftApiError("unauthorized");

  const { id } = await context.params;
  try {
    const owner = await convex.query(api.retry.loadForEmployee, { conversationId: id });
    if (!owner.ok) return draftApiError(owner.error);

    const { employeeId, conversationId } = owner.value;
    const started = await convex.mutation(api.retry.start, {
      secret: config.agentSecret,
      employeeId,
      conversationId,
    });
    if (!started.ok) return draftApiError(started.error);

    const plan = started.value;
    if (plan.kind === "turn") {
      const { assistantMessageId, userText } = plan;
      after(() =>
        runTurn({
          conversationId,
          assistantMessageId,
          userText,
          convex,
          agentSecret: config.agentSecret,
        }),
      );
      const response: RetryResponse = { kind: "turn", assistantMessageId };
      return Response.json(response, { status: 202 });
    }

    const confirmed = await confirmDraft({
      convex,
      agentSecret: config.agentSecret,
      createGateway: config.createGateway,
      conversationId,
      pendingActionId: plan.pendingActionId,
    });
    if (!confirmed.ok) return draftApiError(confirmed.error);
    const response: RetryResponse = { kind: "confirm", ticketCode: confirmed.value.ticketCode };
    return Response.json(response);
  } catch (error) {
    // Erros esperados vêm no Result; aqui só chega o inesperado (guard, rede).
    console.error("[retry] falha inesperada", error);
    return draftApiError("unavailable");
  }
}
