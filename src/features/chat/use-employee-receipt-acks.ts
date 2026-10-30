"use client";

import { useMutation } from "convex/react";
import { useEffect, useSyncExternalStore } from "react";

import { api } from "../../../convex/_generated/api";
import { ackToSend, latestIncoming, type AckMessage } from "./receipt-acks";

/**
 * Confirma ao agent e ao analista que as respostas chegaram ao funcionário e que ele leu
 * (UX1): com a conversa aberta, "chegou" sempre e "leu" quando a aba está visível.
 */
export function useEmployeeReceiptAcks(
  conversationId: string | null,
  messages: AckMessage[] | null | undefined,
) {
  const markDelivered = useMutation(api.messages.markDelivered);
  const markRead = useMutation(api.messages.markRead);
  const pageVisible = usePageVisible();
  const target = messages ? latestIncoming(messages) : null;
  const ack = target ? ackToSend(target, pageVisible) : null;
  const upTo = target?.upTo ?? null;

  useEffect(() => {
    if (!conversationId || upTo === null || ack === null) return;
    const confirm = ack === "read" ? markRead : markDelivered;
    // A confirmação é só um aviso: sem rede, a próxima mudança tenta de novo.
    confirm({ conversationId, upTo }).catch(() => {});
  }, [ack, conversationId, markDelivered, markRead, upTo]);
}

function usePageVisible(): boolean {
  return useSyncExternalStore(
    subscribeToVisibility,
    () => document.visibilityState === "visible",
    () => false,
  );
}

function subscribeToVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}
