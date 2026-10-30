"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useSignedInQuery } from "@/features/auth/use-signed-in-query";
import { api } from "../../../convex/_generated/api";
import { useCreateConversation } from "./use-chat-mutations";

type NewConversationOptions = { inheritSummaryFrom?: string };

/**
 * "Nova conversa": cria (aparece no histórico na hora, UX1) e abre a conversa criada. Com o
 * teto diário de custo atingido (§12.3), o agent não responderia: antes de abrir, mostra o
 * aviso do teto (`dailyLimitNotice`). "Escrever para um analista" abre a conversa nova com o
 * campo livre; a primeira mensagem fica guardada para o analista e o campo então oferece
 * "Falar com um analista", que transfere já com o pedido. Conversa vazia não vai para a fila.
 */
export function useNewConversation() {
  const router = useRouter();
  const dailyLimitReached = useSignedInQuery(api.conversations.dailyLimitReached, {}) ?? false;
  const createConversation = useCreateConversation();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** As opções do pedido que esbarrou no teto; null com o aviso fechado. */
  const [blockedByDailyLimit, setBlockedByDailyLimit] = useState<NewConversationOptions | null>(
    null,
  );

  /** Cria e devolve o id, ou null (com o erro na tela). */
  async function create(options: NewConversationOptions): Promise<string | null> {
    setIsCreating(true);
    setError(null);
    const result = await createConversation(options);
    setIsCreating(false);
    if (!result.ok) {
      setError(result.error.message);
      return null;
    }
    return result.value;
  }

  async function startNewConversation(options: NewConversationOptions = {}) {
    if (dailyLimitReached) {
      setBlockedByDailyLimit(options);
      return;
    }
    const conversationId = await create(options);
    if (conversationId) router.push(`/chat/${conversationId}`);
  }

  /** "Escrever para um analista" do aviso: abre a conversa nova para a pessoa escrever o pedido. */
  async function startForAnalyst() {
    const conversationId = await create(blockedByDailyLimit ?? {});
    setBlockedByDailyLimit(null);
    if (conversationId) router.push(`/chat/${conversationId}`);
  }

  return {
    startNewConversation,
    isCreating,
    error,
    dailyLimitNotice: {
      opened: blockedByDailyLimit !== null,
      isCreating,
      onWriteToAnalyst: () => void startForAnalyst(),
      onClose: () => setBlockedByDailyLimit(null),
    },
  };
}
