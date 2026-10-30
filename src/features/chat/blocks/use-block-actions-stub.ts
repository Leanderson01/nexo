"use client";

import { useState } from "react";

import type { DraftCallbacks } from "./draft-card";

// PROVISÓRIO (T11): os botões do rascunho e o "Tentar de novo" do erro ainda não têm rota.
// A T11 troca este hook pelas chamadas a
//   POST  /api/conversations/:id/pending-action/confirm  → draft.onConfirm
//   POST  /api/conversations/:id/pending-action/cancel   → draft.onCancel
//   PATCH /api/conversations/:id/pending-action          → draft.onSaveEdit
//   POST  /api/conversations/:id/retry                   → onRetry
// e apaga este arquivo. Até lá, o clique só mostra um aviso.
// O "Ver detalhes" dos chips (`onShowDetails`) também é provisório: a T8 abre o painel de decisão.

export function useBlockActionsStub() {
  const [notice, setNotice] = useState<string | null>(null);

  function announce(action: string) {
    setNotice(`${action} chega em breve: esta parte ainda está sendo ligada.`);
  }

  const draft: DraftCallbacks = {
    onConfirm: () => announce("Confirmar o rascunho"),
    onCancel: () => announce("Cancelar o rascunho"),
    onSaveEdit: () => announce("Salvar a edição do rascunho"),
  };

  return {
    draft,
    onRetry: () => announce("Tentar de novo"),
    /** PROVISÓRIO (T8): abre o painel de decisão desse `decisionId`. */
    onShowDetails: () => announce("O painel de decisão"),
    notice,
    dismissNotice: () => setNotice(null),
  };
}
