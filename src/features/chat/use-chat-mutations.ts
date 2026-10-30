"use client";

import { useMutation } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";

import { err, ok, type Result } from "@/domain/result";
import { api } from "../../../convex/_generated/api";
import { chatFailure, type ChatApiFailure } from "./chat-api";
import {
  optimisticId,
  withAnalystRequested,
  withNewConversation,
  withSummaryStatus,
} from "./optimistic-updates";

// Mutations do chat com atualização otimista (UX1): o efeito aparece no clique e o Convex
// desfaz sozinho quando a mutation termina, já com o resultado real nas queries.

/**
 * Cria a conversa direto pela mutation (a rota POST /api/conversations faz só isso), para a
 * conversa nova aparecer no histórico na hora. Devolve o id ou o erro com o texto da tela.
 */
export function useCreateConversation() {
  const create = useMutation(api.conversations.create).withOptimisticUpdate(
    showNewConversationInHistory,
  );

  return async (options: {
    inheritSummaryFrom?: string;
  }): Promise<Result<string, ChatApiFailure>> => {
    try {
      const result = await create(options);
      return result.ok ? ok(result.value.conversationId) : err(chatFailure(result.error));
    } catch {
      return err(chatFailure("unavailable"));
    }
  };
}

function showNewConversationInHistory(store: OptimisticLocalStore) {
  const conversations = store.getQuery(api.conversations.listMine, {});
  if (conversations === undefined) return;
  store.setQuery(
    api.conversations.listMine,
    {},
    withNewConversation(conversations, optimisticId("new-conversation"), Date.now()),
  );
}

/** "Falar com um analista": a conversa já aparece aguardando o analista. */
export function useRequestAnalyst() {
  return useMutation(api.conversations.requestAnalyst).withOptimisticUpdate(
    (store, { conversationId }) => {
      const conversation = store.getQuery(api.conversations.get, { conversationId });
      if (conversation) {
        store.setQuery(
          api.conversations.get,
          { conversationId },
          withAnalystRequested(conversation),
        );
      }
      const conversations = store.getQuery(api.conversations.listMine, {});
      if (conversations && conversation?.status === "agent") {
        store.setQuery(
          api.conversations.listMine,
          {},
          withSummaryStatus(conversations, conversationId, "waiting_analyst"),
        );
      }
    },
  );
}
