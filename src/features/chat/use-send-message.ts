"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ok, type Result } from "@/domain/result";
import { createConversation, sendMessage } from "./chat-api";

export interface SendFailure {
  message: string;
  /** O texto que não foi, para o "Tentar de novo". */
  text: string;
}

/**
 * Envia pela rota do chat. Sem conversa (tela de conversa nova), cria uma antes e, depois
 * do primeiro envio, abre a conversa criada. Se o envio falhar, a conversa criada é
 * reaproveitada na próxima tentativa.
 */
export function useSendMessage(conversationId: string | null) {
  const router = useRouter();
  const createdConversationId = useRef<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [failure, setFailure] = useState<SendFailure | null>(null);

  async function ensureConversation(): Promise<Result<string, string>> {
    const existing = conversationId ?? createdConversationId.current;
    if (existing) return ok(existing);

    const created = await createConversation({});
    if (created.ok) createdConversationId.current = created.value;
    return created;
  }

  async function send(text: string): Promise<boolean> {
    setIsSending(true);
    setFailure(null);
    try {
      const target = await ensureConversation();
      const result = target.ok ? await sendMessage(target.value, text) : target;
      if (!result.ok) {
        setFailure({ message: result.error, text });
        return false;
      }
      if (!conversationId && target.ok) router.replace(`/chat/${target.value}`);
      return true;
    } finally {
      setIsSending(false);
    }
  }

  return { send, isSending, failure, dismissFailure: () => setFailure(null) };
}
