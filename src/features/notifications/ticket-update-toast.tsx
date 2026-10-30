"use client";

import { Notification, Portal, Transition } from "@mantine/core";
import { useEffect, useState } from "react";

import { useSignedInQuery } from "@/features/auth/use-signed-in-query";
import { api } from "../../../convex/_generated/api";
import type { SupportUpdateNotice } from "../../../convex/notifications";
import { ticketUpdatedText } from "./notification-texts";
import { isNewNotice } from "./notice-tracking";

/** Quanto tempo o toast fica na tela, se o funcionário não fechar antes. */
const TOAST_DURATION_MS = 8000;

/**
 * Toast do funcionário (§11.6): quando o suporte atualiza um chamado dele com o chat aberto.
 * O evento no histórico é gravado pelo serviço de chamados; aqui só se avisa. A primeira
 * leitura é a base: o que já existia ao abrir o chat não vira toast.
 */
export function TicketUpdateToast() {
  const latest = useSignedInQuery(api.notifications.latestSupportUpdate, {});
  // undefined: ainda sem base; null: não havia nenhuma atualização do suporte.
  const [seenId, setSeenId] = useState<string | null | undefined>(undefined);
  const [toast, setToast] = useState<SupportUpdateNotice | null>(null);

  // Ajuste de estado durante a renderização (como em useFreshConversations): sem efeito extra.
  if (latest !== undefined) {
    const latestId = latest?.id ?? null;
    if (seenId === undefined) {
      setSeenId(latestId);
    } else if (latest && isNewNotice(seenId, latestId)) {
      setSeenId(latestId);
      setToast(latest);
    }
  }

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <Portal>
      <Transition mounted={toast !== null} transition="slide-left" duration={200}>
        {(styles) => (
          <div
            style={{ ...styles, position: "fixed", top: 16, right: 16, zIndex: 400, width: 340 }}
            role="status"
            aria-live="polite"
          >
            {toast && (
              <Notification
                title={ticketUpdatedText({
                  code: toast.code,
                  status: toast.status ?? undefined,
                })}
                onClose={() => setToast(null)}
                withBorder
                closeButtonProps={{ "aria-label": "Fechar aviso" }}
              >
                {toast.authorName ? `${toast.authorName}: ` : ""}
                {toast.text}
              </Notification>
            )}
          </div>
        )}
      </Transition>
    </Portal>
  );
}
