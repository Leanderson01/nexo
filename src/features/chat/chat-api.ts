import { err, ok, type Result } from "@/domain/result";
import { loginPathFor } from "@/features/auth/route-access";
import { CHAT_API_ERRORS, type ChatApiErrorBody } from "./api-errors";

// Chamadas do navegador às rotas do chat. Devolvem `Result` com a mensagem pronta para
// a tela; falha de rede vira a mesma mensagem de "servidor indisponível".

export async function createConversation(options: {
  inheritSummaryFrom?: string;
}): Promise<Result<string, string>> {
  const result = await postJson<{ conversationId: string }>("/api/conversations", options);
  return result.ok ? ok(result.value.conversationId) : result;
}

export async function sendMessage(conversationId: string, text: string) {
  return await postJson<{ userMessageId: string; assistantMessageId: string | null }>(
    `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
    { text },
  );
}

async function postJson<T>(url: string, body: unknown): Promise<Result<T, string>> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) return ok((await response.json()) as T);
    if (response.status === 401) redirectToLogin();

    const failure = (await response.json().catch(() => null)) as ChatApiErrorBody | null;
    return err(failure?.error.message ?? CHAT_API_ERRORS.unavailable.message);
  } catch {
    return err(CHAT_API_ERRORS.unavailable.message);
  }
}

/** Sessão expirada (§10): volta ao login, que depois devolve a pessoa para cá. */
function redirectToLogin() {
  window.location.assign(loginPathFor(window.location.pathname));
}
