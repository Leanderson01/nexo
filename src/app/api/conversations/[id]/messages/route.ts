import { after } from "next/server";
import { z } from "zod";

import { runTurn } from "@/agent/pipeline/run-turn";
import { createConvexClientForCurrentUser } from "@/features/auth/server";
import { chatApiError } from "@/features/chat/api-errors";
import { api } from "../../../../../../convex/_generated/api";

// POST /api/conversations/:id/messages (§5.7). A mutation valida e salva como o próprio
// funcionário; se o agent deve responder, devolvemos 202 na hora e o turno roda depois
// da resposta, com `after()`. Com analista, a mensagem só é salva (201).

/**
 * O turno roda no `after()` e herda o tempo máximo da função. O Convex já encerra um turno
 * travado em 60 s (§5.7); 90 s dá folga para a plataforma não cortar antes disso.
 */
export const maxDuration = 90;

const sendMessageBody = z.object({ text: z.string() });

export interface SendMessageResponse {
  userMessageId: string;
  assistantMessageId: string | null;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const agentSecret = process.env.AGENT_SERVER_SECRET;
  if (!agentSecret) {
    console.error("[messages] AGENT_SERVER_SECRET ausente no servidor do Next");
    return chatApiError("unavailable");
  }

  const convex = await createConvexClientForCurrentUser();
  if (!convex) return chatApiError("unauthorized");
  // Analista logado: recusa clara (403) em vez do erro do guard virar 503.
  const person = await convex.query(api.auth.currentPerson, {}).catch(() => null);
  if (person?.role === "analyst") return chatApiError("forbidden");

  const body = sendMessageBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return chatApiError("invalid_body");

  const { id } = await context.params;
  let result;
  try {
    result = await convex.mutation(api.messages.sendUserMessage, {
      conversationId: id,
      text: body.data.text,
    });
  } catch (error) {
    // Erros esperados vêm no Result; aqui só chega o inesperado (guard, rede).
    console.error("[messages] falha ao salvar a mensagem", error);
    return chatApiError("unavailable");
  }
  if (!result.ok) return chatApiError(result.error);

  const { conversationId, userMessageId, assistantMessageId, savedText } = result.value;
  if (assistantMessageId) {
    after(() =>
      runTurn({ conversationId, assistantMessageId, userText: savedText, convex, agentSecret }),
    );
  }

  const response: SendMessageResponse = { userMessageId, assistantMessageId };
  return Response.json(response, { status: assistantMessageId ? 202 : 201 });
}
