"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import type { MessageReceiver } from "@/domain/enums";
import { ok, type Result } from "@/domain/result";
import { isRetryableChatError } from "./api-errors";
import { sendMessage, type ChatApiFailure } from "./chat-api";
import {
  addPending,
  markFailed,
  markSaved,
  removePending,
  visiblePending,
  type PendingMessage,
  type SavedMessage,
} from "./pending-messages";
import { useCreateConversation } from "./use-chat-mutations";

/**
 * Envia pela rota do chat com a mensagem otimista (UX1): ela entra na lista na hora, com o
 * reloginho, e some quando a salva chega pela query. Se a rota falhar, fica na lista com o
 * erro, "Tentar de novo" e "Descartar".
 *
 * Sem conversa (tela de conversa nova), cria uma antes e, depois do primeiro envio, abre a
 * conversa criada. Se o envio falhar, a conversa criada é reaproveitada na próxima tentativa.
 */
export function useSendMessage(conversationId: string | null, saved: SavedMessage[]) {
  const router = useRouter();
  const createConversation = useCreateConversation();
  const createdConversationId = useRef<string | null>(null);
  const nextClientId = useRef(0);
  const [pending, setPending] = useState<PendingMessage[]>([]);

  async function ensureConversation(): Promise<Result<string, ChatApiFailure>> {
    const existing = conversationId ?? createdConversationId.current;
    if (existing) return ok(existing);

    const created = await createConversation({});
    if (created.ok) createdConversationId.current = created.value;
    return created;
  }

  async function deliver(clientId: string, text: string) {
    const target = await ensureConversation();
    const result = target.ok ? await sendMessage(target.value, text) : target;
    if (!result.ok) {
      const failure = {
        message: result.error.message,
        retryable: isRetryableChatError(result.error.code),
      };
      setPending((current) => markFailed(current, clientId, failure));
      return;
    }
    setPending((current) => markSaved(current, clientId, result.value.userMessageId));
    if (!conversationId && target.ok) router.replace(`/chat/${target.value}`);
  }

  function send(text: string, receiver: MessageReceiver) {
    nextClientId.current += 1;
    const clientId = `pending-${nextClientId.current}`;
    const message = { clientId, origin: conversationId, text, receiver, sentAt: Date.now() };
    setPending((current) => addPending(current, message, saved));
    void deliver(clientId, text);
  }

  /** Tira a que falhou da lista e manda o mesmo texto de novo. */
  function retry(failed: PendingMessage) {
    setPending((current) => removePending(current, failed.clientId));
    send(failed.text, failed.receiver);
  }

  return {
    send,
    retry,
    discard: (failed: PendingMessage) =>
      setPending((current) => removePending(current, failed.clientId)),
    pending: visiblePending(pending, conversationId, saved),
  };
}
