"use client";

import { useSyncExternalStore } from "react";

function subscribe(): () => void {
  return () => {};
}

/**
 * `false` no servidor e na primeira passada do cliente (a hidratação), `true` depois. As
 * queries do Convex ficam em "skip" até aqui: se a resposta já estiver no cache quando um
 * Suspense hidrata, o cliente não desenha algo diferente do HTML do servidor.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
