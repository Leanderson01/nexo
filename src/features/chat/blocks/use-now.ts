"use client";

import { useEffect, useState } from "react";

/** O relógio da tela, atualizado a cada minuto: o selo de prazo muda sozinho. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
