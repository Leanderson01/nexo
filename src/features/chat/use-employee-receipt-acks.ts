"use client";

import { useMutation } from "convex/react";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { useSignedInQuery } from "@/features/auth/use-signed-in-query";
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

/**
 * "Chegou" de todas as conversas do funcionário (decisão 32): com o chat aberto em qualquer
 * conversa, as respostas das outras também chegaram a ele. O servidor lista o que falta
 * confirmar; cada confirmação sai uma vez só e repetir não escreve.
 */
export function useEmployeeDeliveryAcks() {
  const undelivered = useSignedInQuery(api.messages.listUndelivered, {});
  const markDelivered = useMutation(api.messages.markDelivered);
  const sent = useRef(new Set<string>());

  useEffect(() => {
    for (const { conversationId, upTo } of undelivered ?? []) {
      const key = `${conversationId}:${upTo}`;
      if (sent.current.has(key)) continue;
      sent.current.add(key);
      // Só um aviso: se falhar, a próxima atualização da lista tenta de novo.
      markDelivered({ conversationId, upTo }).catch(() => sent.current.delete(key));
    }
  }, [markDelivered, undelivered]);
}

/** A aba está visível: o "leu" do chat e do console só vale assim (decisão 32). */
export function usePageVisible(): boolean {
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
