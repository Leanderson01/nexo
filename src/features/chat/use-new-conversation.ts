"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createConversation } from "./chat-api";

/** "Nova conversa": cria pela rota e abre a conversa criada. */
export function useNewConversation() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startNewConversation(options: { inheritSummaryFrom?: string } = {}) {
    setIsCreating(true);
    setError(null);
    const result = await createConversation(options);
    setIsCreating(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/chat/${result.value}`);
  }

  return { startNewConversation, isCreating, error };
}
