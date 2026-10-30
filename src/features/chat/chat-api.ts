import { err, ok, type Result } from "@/domain/result";
import { loginPathFor } from "@/features/auth/route-access";
import { CHAT_API_ERRORS, type ChatApiErrorBody, type ChatApiErrorCode } from "./api-errors";

// Chamadas do navegador às rotas do chat. Devolvem `Result` com o código do erro e a
// mensagem pronta para a tela; falha de rede vira o mesmo "servidor indisponível".

export interface ChatApiFailure {
  code: ChatApiErrorCode;
  message: string;
}

export async function sendMessage(conversationId: string, text: string) {
  return await postJson<{ userMessageId: string; assistantMessageId: string | null }>(
    `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
    { text },
  );
}

/** O erro com o texto da tela, para quem chama a mutation direto (ex.: criar conversa). */
export function chatFailure(code: ChatApiErrorCode): ChatApiFailure {
  return { code, message: CHAT_API_ERRORS[code].message };
}

const UNAVAILABLE = chatFailure("unavailable");

async function postJson<T>(url: string, body: unknown): Promise<Result<T, ChatApiFailure>> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) return ok((await response.json()) as T);
    if (response.status === 401) redirectToLogin();

    const failure = (await response.json().catch(() => null)) as ChatApiErrorBody | null;
    return err(failure?.error ?? UNAVAILABLE);
  } catch {
    return err(UNAVAILABLE);
  }
}

/** Sessão expirada (§10): volta ao login, que depois devolve a pessoa para cá. */
function redirectToLogin() {
  window.location.assign(loginPathFor(window.location.pathname));
}
