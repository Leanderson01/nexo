import { z } from "zod";

import { createConvexClientForCurrentUser } from "@/features/auth/server";
import { chatApiError } from "@/features/chat/api-errors";
import { api } from "../../../../convex/_generated/api";

// POST /api/conversations (§9): abre uma conversa nova, opcionalmente herdando o resumo
// da anterior. Roda como a pessoa logada; quem autoriza é o guard da mutation.

const createConversationBody = z.object({ inheritSummaryFrom: z.string().optional() });

export interface CreateConversationResponse {
  conversationId: string;
}

export async function POST(request: Request) {
  const convex = await createConvexClientForCurrentUser();
  if (!convex) return chatApiError("unauthorized");

  const body = createConversationBody.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return chatApiError("invalid_body");

  let result;
  try {
    result = await convex.mutation(api.conversations.create, body.data);
  } catch (error) {
    console.error("[conversations] falha ao criar a conversa", error);
    return chatApiError("unavailable");
  }
  if (!result.ok) return chatApiError(result.error);

  const response: CreateConversationResponse = { conversationId: result.value.conversationId };
  return Response.json(response, { status: 201 });
}
