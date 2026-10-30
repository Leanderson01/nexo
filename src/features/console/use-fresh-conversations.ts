"use client";

import { useState } from "react";

/**
 * Conversas que chegaram à fila "Para você" depois que o console abriu (§7.4: "uma conversa
 * nova aparece sem recarregar, com destaque visual e um contador no cabeçalho"). A primeira
 * lista recebida é a base; o que aparecer depois e ainda não foi aberto é "novo".
 */
export function useFreshConversations(waitingIds: string[] | undefined) {
  const [baseline, setBaseline] = useState<ReadonlySet<string> | null>(null);
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());

  // Guarda a base na primeira lista que chega (ajuste de estado durante a renderização).
  if (waitingIds && baseline === null) setBaseline(new Set(waitingIds));

  const fresh = new Set(
    baseline && waitingIds ? waitingIds.filter((id) => !baseline.has(id) && !seen.has(id)) : [],
  );

  return {
    fresh,
    markSeen: (id: string) => setSeen((previous) => new Set([...previous, id])),
    markAllSeen: () => setSeen((previous) => new Set([...previous, ...fresh])),
  };
}
