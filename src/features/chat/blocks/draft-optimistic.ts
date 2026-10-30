import type { PendingActionStatus } from "@/domain/enums";
import type { PendingAction } from "@/domain/pending-action";
import { DRAFT_STATUS_COLORS, draftStatusText } from "./block-texts";

// Estado otimista do card de rascunho (UX1). Confirmar, cancelar e editar passam por rotas
// que falam com o legado, então o `withOptimisticUpdate` do Convex não alcança: o card mostra
// o estado final provável assim que o botão é clicado e volta atrás se a rota recusar.

/** O que foi clicado e a rota ainda está fazendo. */
export type DraftIntent = "confirm" | "cancel";

export interface DraftView {
  label: string;
  color: string;
  /** Pendente de verdade e sem nada a caminho: os botões aparecem. */
  showActions: boolean;
  /** Visual do estado final (card esmaecido). */
  looksFinal: boolean;
}

const INTENT_VIEWS: Record<DraftIntent, Pick<DraftView, "label" | "color">> = {
  confirm: { label: "Confirmando…", color: DRAFT_STATUS_COLORS.confirmed },
  cancel: { label: "Cancelando…", color: DRAFT_STATUS_COLORS.cancelled },
};

/** O estado real manda; o clique só vale enquanto o rascunho ainda está pendente. */
export function draftView(
  status: PendingActionStatus,
  resultTicketCode: string | null,
  intent: DraftIntent | null,
): DraftView {
  if (status === "pending" && intent) {
    return { ...INTENT_VIEWS[intent], showActions: false, looksFinal: true };
  }
  return {
    label: draftStatusText(status, resultTicketCode),
    color: DRAFT_STATUS_COLORS[status],
    showActions: status === "pending",
    looksFinal: status !== "pending",
  };
}

/** A edição salva na tela, presa à versão do rascunho que ela editou. */
export interface OptimisticEdit {
  base: PendingAction;
  edited: PendingAction;
}

/**
 * O conteúdo mostrado: a edição, enquanto o rascunho do servidor ainda é a versão editada;
 * quando a versão salva chega (com a prioridade recalculada), ela toma o lugar.
 */
export function shownAction(current: PendingAction, edit: OptimisticEdit | null): PendingAction {
  return edit && edit.base === current ? edit.edited : current;
}
