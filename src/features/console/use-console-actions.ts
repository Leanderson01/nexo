"use client";

import type { OptimisticLocalStore } from "convex/browser";
import { useMutation } from "convex/react";
import { useState } from "react";

import type { Result } from "@/domain/result";
import { optimisticId } from "@/features/chat/optimistic-updates";
import { api } from "../../../convex/_generated/api";
import type { ConsoleActionError } from "../../../convex/console";
import { CONSOLE_ACTION_ERROR_TEXTS } from "./console-texts";
import {
  QUEUE_CHANGES,
  withAnalystMessage,
  withAssigned,
  withClosed,
  withQueueChange,
  withRead,
  withReturnedToAgent,
  type ConsoleAnalyst,
  type ConsoleConversationData,
  type QueueChange,
} from "./optimistic-updates";

export type ConsoleAction = "assign" | "send" | "return" | "close";

/**
 * As ações do analista sobre a conversa aberta, todas otimistas (UX1): a tela muda no clique
 * e o Convex desfaz se a mutation recusar. Cada uma devolve `true` se deu certo; o erro
 * esperado vira um texto em `error` (ex.: outro analista assumiu antes).
 */
export function useConsoleActions(conversationId: string) {
  const assignMutation = useMutation(api.console.assign).withOptimisticUpdate(showAssigned);
  const sendMutation = useMutation(api.console.sendAnalystMessage).withOptimisticUpdate(
    showAnalystMessage,
  );
  const returnMutation = useMutation(api.console.returnToAgent).withOptimisticUpdate(
    showReturnedToAgent,
  );
  const closeMutation = useMutation(api.console.close).withOptimisticUpdate(showClosed);
  const [running, setRunning] = useState<ConsoleAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(
    action: ConsoleAction,
    call: () => Promise<Result<null, ConsoleActionError>>,
  ): Promise<boolean> {
    setRunning(action);
    setError(null);
    try {
      const result = await call();
      if (!result.ok) setError(CONSOLE_ACTION_ERROR_TEXTS[result.error]);
      return result.ok;
    } catch {
      setError("Não foi possível concluir agora. Verifique sua conexão e tente de novo.");
      return false;
    } finally {
      setRunning(null);
    }
  }

  return {
    running,
    error,
    dismissError: () => setError(null),
    assign: () => run("assign", () => assignMutation({ conversationId })),
    send: (text: string) => run("send", () => sendMutation({ conversationId, text })),
    returnToAgent: (note: string) =>
      run("return", () => returnMutation({ conversationId, note: note.trim() || undefined })),
    close: () => run("close", () => closeMutation({ conversationId })),
  };
}

/** Marcar como lida: o contador de não lidas da fila zera no clique. */
export function useMarkReadMutation() {
  return useMutation(api.console.markRead).withOptimisticUpdate((store, { conversationId }) => {
    updateConversation(store, conversationId, (conversation) => withRead(conversation, Date.now()));
    updateQueue(store, conversationId, QUEUE_CHANGES.read);
  });
}

// ---------- As atualizações otimistas (fora dos hooks: rodam de novo a cada mudança) ----------

function showAnalystMessage(
  store: OptimisticLocalStore,
  { conversationId, text }: { conversationId: string; text: string },
) {
  const messages = store.getQuery(api.console.listMessages, { conversationId });
  const conversation = store.getQuery(api.console.getConversation, { conversationId });
  if (!messages || !conversation || text.trim() === "") return;
  store.setQuery(
    api.console.listMessages,
    { conversationId },
    withAnalystMessage(messages, {
      // A posição na lista: o mesmo id quando o Convex refaz a atualização.
      id: optimisticId(`analyst-message-${messages.length}`),
      conversationId: conversation._id,
      text,
      analyst: currentAnalyst(store),
      now: Date.now(),
    }),
  );
}

function showAssigned(store: OptimisticLocalStore, { conversationId }: { conversationId: string }) {
  const analyst = currentAnalyst(store);
  updateConversation(store, conversationId, (conversation) =>
    withAssigned(conversation, analyst, Date.now()),
  );
  updateQueue(store, conversationId, QUEUE_CHANGES.assigned(analyst));
}

function showReturnedToAgent(
  store: OptimisticLocalStore,
  { conversationId }: { conversationId: string },
) {
  updateConversation(store, conversationId, withReturnedToAgent);
  updateQueue(store, conversationId, QUEUE_CHANGES.returned);
}

function showClosed(store: OptimisticLocalStore, { conversationId }: { conversationId: string }) {
  updateConversation(store, conversationId, (conversation) => withClosed(conversation, Date.now()));
  updateQueue(store, conversationId, QUEUE_CHANGES.closed);
}

function currentAnalyst(store: OptimisticLocalStore): ConsoleAnalyst | null {
  return store.getQuery(api.auth.currentPerson, {}) ?? null;
}

function updateConversation(
  store: OptimisticLocalStore,
  conversationId: string,
  change: (conversation: ConsoleConversationData) => ConsoleConversationData,
) {
  const conversation = store.getQuery(api.console.getConversation, { conversationId });
  if (conversation) {
    store.setQuery(api.console.getConversation, { conversationId }, change(conversation));
  }
}

/** Todas as filas abertas no cliente (a da tela e a "Para você" do trilho). */
function updateQueue(store: OptimisticLocalStore, conversationId: string, change: QueueChange) {
  for (const { args, value } of store.getAllQueries(api.console.listConversations)) {
    if (value) {
      store.setQuery(
        api.console.listConversations,
        args,
        withQueueChange(value, conversationId, change),
      );
    }
  }
}
