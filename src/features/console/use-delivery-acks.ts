"use client";

import { useMutation } from "convex/react";
import { useEffect, useRef } from "react";

import { api } from "../../../convex/_generated/api";
import type { UndeliveredMessages } from "../../../convex/console";

/**
 * "Chegou" das mensagens do funcionário para o analista (UX1): quando a fila deste console
 * recebe mensagens que ainda não chegaram a ninguém que possa atendê-las, ele confirma. A
 * fila do servidor já filtra o que é para este analista; confirmar de novo não escreve nada.
 */
export function useDeliveryAcks(undelivered: UndeliveredMessages[] | undefined) {
  const markDelivered = useMutation(api.console.markDelivered);
  // Cada confirmação sai uma vez só, mesmo com a fila mudando por outros motivos.
  const sent = useRef(new Set<string>());

  useEffect(() => {
    for (const { conversationId, upTo } of undelivered ?? []) {
      const key = `${conversationId}:${upTo}`;
      if (sent.current.has(key)) continue;
      sent.current.add(key);
      // A confirmação é só um aviso: se falhar, a próxima atualização da fila tenta de novo.
      markDelivered({ conversationId, upTo }).catch(() => sent.current.delete(key));
    }
  }, [markDelivered, undelivered]);
}
