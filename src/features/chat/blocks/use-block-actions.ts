"use client";

import { useRef, useState } from "react";

import type { PendingAction } from "@/domain/pending-action";
import { loginPathFor } from "@/features/auth/route-access";
import {
  DRAFT_API_ERRORS,
  draftNoticeTone,
  ERRORS_SHOWN_IN_CONVERSATION,
  type DraftApiErrorBody,
  type DraftNoticeTone,
} from "@/features/drafts/draft-api-errors";
import type { DraftCallbacks } from "./draft-card";

// Botões dos blocos ligados às rotas do rascunho e do "Tentar de novo" (§6.5, §9):
//   Confirmar → POST  /api/conversations/:id/pending-action/confirm
//   Cancelar  → POST  /api/conversations/:id/pending-action/cancel
//   Salvar    → PATCH /api/conversations/:id/pending-action
//   Tentar de novo (erro) → POST /api/conversations/:id/retry
// O resultado chega pelas queries do Convex (card confirmado, mensagem nova); aqui só
// cuidamos do aviso quando a rota recusa e dizemos ao card se ele deve sair do estado
// otimista (UX1).

/** O aviso de uma ação recusada: vermelho quando algo falhou, âmbar quando é um limite. */
export interface BlockActionNotice {
  message: string;
  tone: DraftNoticeTone;
}

export function useBlockActions(conversationId: string | null) {
  const [notice, setNotice] = useState<BlockActionNotice | null>(null);
  // O botão do erro some quando o retry começa; até lá, um clique duplo não repete duas vezes.
  const isRetrying = useRef(false);

  /** true se a rota aceitou; senão o aviso aparece e devolve false. */
  async function call(method: "POST" | "PATCH", path: string, body: unknown): Promise<boolean> {
    if (!conversationId) return false;
    setNotice(null);
    const url = `/api/conversations/${encodeURIComponent(conversationId)}/${path}`;
    const outcome = await requestBlockAction(method, url, body);
    if (outcome.notice) setNotice(outcome.notice);
    return outcome.accepted;
  }

  const draft: DraftCallbacks = {
    onConfirm: (pendingActionId) => call("POST", "pending-action/confirm", { pendingActionId }),
    onCancel: (pendingActionId) => call("POST", "pending-action/cancel", { pendingActionId }),
    onSaveEdit: (pendingActionId, edited: PendingAction) =>
      call("PATCH", "pending-action", { pendingActionId, action: edited }),
  };

  async function retry() {
    if (isRetrying.current) return;
    isRetrying.current = true;
    try {
      await call("POST", "retry", {});
    } finally {
      isRetrying.current = false;
    }
  }

  return {
    draft,
    onRetry: () => void retry(),
    notice,
    dismissNotice: () => setNotice(null),
  };
}

const UNAVAILABLE_NOTICE: BlockActionNotice = {
  message: DRAFT_API_ERRORS.unavailable.message,
  tone: "error",
};

interface BlockActionOutcome {
  accepted: boolean;
  /** O aviso para a tela; null quando deu certo ou a conversa já explica o erro. */
  notice: BlockActionNotice | null;
}

const ACCEPTED: BlockActionOutcome = { accepted: true, notice: null };
const UNAVAILABLE: BlockActionOutcome = { accepted: false, notice: UNAVAILABLE_NOTICE };

async function requestBlockAction(
  method: "POST" | "PATCH",
  url: string,
  body: unknown,
): Promise<BlockActionOutcome> {
  try {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) return ACCEPTED;
    if (response.status === 401) {
      // Sessão expirada (§10): volta ao login, que depois devolve a pessoa para cá.
      window.location.assign(loginPathFor(window.location.pathname));
      return { accepted: false, notice: null };
    }

    const failure = (await response.json().catch(() => null)) as DraftApiErrorBody | null;
    if (!failure) return UNAVAILABLE;
    if (ERRORS_SHOWN_IN_CONVERSATION.includes(failure.error.code)) {
      return { accepted: false, notice: null };
    }
    return {
      accepted: false,
      notice: { message: failure.error.message, tone: draftNoticeTone(failure.error.code) },
    };
  } catch {
    return UNAVAILABLE;
  }
}
