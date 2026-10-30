"use client";

import { useLocalStorage } from "@mantine/hooks";
import { useEffect, useRef } from "react";

import { playChime, unlockChime } from "./chime";
import { SOUND_STORAGE_KEY, arrivedIds, consoleTabTitle } from "./queue-alerts";

/**
 * Avisos da fila "Para você" (§11.6): o número de quem espera no título da aba e, se o
 * analista ligou, um som quando uma conversa nova entra. A primeira lista recebida é a base:
 * abrir ou recarregar o console não toca nada.
 */
export function useQueueAlerts(waitingIds: string[] | undefined, waitingCount: number) {
  // O hook do Mantine lê depois de montar (no servidor não há localStorage) e já trata com
  // try/catch o armazenamento bloqueado: aí a preferência vale só até recarregar.
  const [soundOn, setSoundOn] = useLocalStorage({
    key: SOUND_STORAGE_KEY,
    defaultValue: false,
    serialize: (on) => (on ? "on" : "off"),
    deserialize: (raw) => raw === "on",
  });
  const previousIds = useRef<ReadonlySet<string> | null>(null);

  // O navegador só libera o áudio depois de um gesto: com o som lembrado de outra visita, o
  // primeiro clique na página destrava.
  useEffect(() => {
    if (!soundOn) return;
    window.addEventListener("pointerdown", unlockChime, { once: true });
    return () => window.removeEventListener("pointerdown", unlockChime);
  }, [soundOn]);

  useEffect(() => {
    if (!waitingIds) return;
    const arrived = arrivedIds(previousIds.current, waitingIds);
    previousIds.current = new Set(waitingIds);
    if (soundOn && arrived.length > 0) playChime();
  }, [waitingIds, soundOn]);

  useEffect(() => {
    document.title = consoleTabTitle(waitingCount);
    return () => {
      document.title = consoleTabTitle(0);
    };
  }, [waitingCount]);

  function toggleSound() {
    if (!soundOn) unlockChime();
    setSoundOn(!soundOn);
  }

  return { soundOn, toggleSound };
}
