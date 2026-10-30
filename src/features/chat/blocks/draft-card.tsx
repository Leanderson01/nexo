"use client";

import { Button } from "@mantine/core";
import { useOs } from "@mantine/hooks";
import { useEffect, useState } from "react";

import type { PendingActionStatus } from "@/domain/enums";
import { PRIORITY_LABELS, TICKET_CATEGORY_LABELS, TICKET_STATUS_LABELS } from "@/domain/labels";
import type { PendingAction } from "@/domain/pending-action";
import { computeDueAt } from "@/domain/sla";
import type { NewTicket, TicketFieldChanges } from "@/domain/ticket";
import { useBlockPendingAction } from "./block-reads";
import classes from "./blocks.module.css";
import {
  DRAFT_STATUS_COLORS,
  PRIORITY_COLORS,
  draftDeadlineText,
  draftKindText,
  draftNumberText,
  draftStatusText,
  priorityMotiveText,
} from "./block-texts";
import { DotLabel } from "./dot-label";
import { DraftEditForm } from "./draft-edit-form";
import { Field, TicketCardSkeleton } from "./ticket-card";
import { useNow } from "./use-now";

export interface DraftCardData {
  id: string;
  draftNumber: number;
  action: PendingAction;
  status: PendingActionStatus;
  resultTicketCode: string | null;
}

/**
 * O que o card faz com os botões. Quem liga às rotas de confirmar, cancelar e editar
 * (POST/PATCH /api/conversations/:id/pending-action/...) é a T11.
 */
export interface DraftCallbacks {
  onConfirm: (pendingActionId: string) => void | Promise<void>;
  onCancel: (pendingActionId: string) => void | Promise<void>;
  /** Recebe a ação já editada; a rota recalcula a prioridade se os sinais mudaram. */
  onSaveEdit: (pendingActionId: string, edited: PendingAction) => void | Promise<void>;
}

type Busy = "confirm" | "cancel" | "save" | null;

/**
 * Card de rascunho (§6.5, protótipo 02). Pendente: Confirmar (⌘↵/Ctrl+Enter), Editar inline
 * e Cancelar. Confirmado, cancelado ou substituído: estado final, somente leitura.
 */
export function DraftCard({
  draft,
  now,
  callbacks,
}: {
  draft: DraftCardData;
  now: number;
  callbacks: DraftCallbacks;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const isPending = draft.status === "pending";

  async function run(kind: Exclude<Busy, null>, action: () => void | Promise<void>) {
    setBusy(kind);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  }

  const confirm = () => run("confirm", () => callbacks.onConfirm(draft.id));
  useConfirmShortcut(isPending && !isEditing && busy === null, confirm);

  return (
    <article
      className={isPending ? classes.card : `${classes.card} ${classes.finalCard}`}
      aria-label={draftNumberText(draft.draftNumber)}
    >
      <div className={classes.cardBody}>
        <div className={classes.cardKicker}>
          <span className={classes.kickerTrail}>
            {draftKindText(draft.action)}
            <span className={classes.kickerSeparator} aria-hidden />
            {draftNumberText(draft.draftNumber)}
          </span>
          <DotLabel color={DRAFT_STATUS_COLORS[draft.status]} colorText>
            {draftStatusText(draft.status, draft.resultTicketCode)}
          </DotLabel>
        </div>

        {isEditing ? (
          <DraftEditForm
            action={draft.action}
            isSaving={busy === "save"}
            onCancel={() => setIsEditing(false)}
            onSave={(edited) =>
              run("save", async () => {
                await callbacks.onSaveEdit(draft.id, edited);
                setIsEditing(false);
              })
            }
          />
        ) : (
          <DraftContent action={draft.action} deadlineFrom={isPending ? now : null} />
        )}
      </div>

      {isPending && !isEditing && (
        <div className={classes.cardFooter}>
          <Button size="xs" loading={busy === "confirm"} disabled={busy !== null} onClick={confirm}>
            Confirmar
            <ShortcutHint />
          </Button>
          <Button
            size="xs"
            variant="default"
            disabled={busy !== null}
            onClick={() => setIsEditing(true)}
          >
            Editar
          </Button>
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            loading={busy === "cancel"}
            disabled={busy !== null}
            onClick={() => run("cancel", () => callbacks.onCancel(draft.id))}
          >
            Cancelar
          </Button>
        </div>
      )}
    </article>
  );
}

/** Campos do rascunho, um formato por tipo de ação. */
function DraftContent({
  action,
  deadlineFrom,
}: {
  action: PendingAction;
  /** Instante base do prazo ("resposta até 13:43"); null no estado final. */
  deadlineFrom: number | null;
}) {
  switch (action.kind) {
    case "create_ticket":
      return <NewTicketContent ticket={action.ticket} deadlineFrom={deadlineFrom} />;
    case "update_ticket":
      return (
        <>
          <h3 className={classes.cardTitle}>Nova informação para o {action.code}</h3>
          <p className={classes.cardText}>{action.text}</p>
          {action.fieldChanges && <FieldChanges changes={action.fieldChanges} />}
        </>
      );
    case "reopen_ticket":
      return (
        <>
          <h3 className={classes.cardTitle}>Reabrir o {action.code}</h3>
          <p className={classes.cardText}>{action.reason}</p>
        </>
      );
  }
}

function NewTicketContent({
  ticket,
  deadlineFrom,
}: {
  ticket: NewTicket;
  deadlineFrom: number | null;
}) {
  return (
    <>
      <h3 className={classes.cardTitle}>{ticket.title}</h3>
      <p className={classes.cardText}>{ticket.description}</p>
      <div className={classes.fieldGrid}>
        <Field label="Categoria">{TICKET_CATEGORY_LABELS[ticket.category]}</Field>
        <Field label="Prioridade">
          <DotLabel color={PRIORITY_COLORS[ticket.priority]}>
            {PRIORITY_LABELS[ticket.priority]}
          </DotLabel>
          {deadlineFrom !== null && (
            <span className={classes.fieldNote}>
              {" "}
              · {draftDeadlineText(computeDueAt(ticket.priority, deadlineFrom), deadlineFrom)}
            </span>
          )}
          <div className={classes.fieldNote}>
            {priorityMotiveText(ticket.priority, ticket.priorityReason)}
          </div>
        </Field>
        <Field label="Afetados">{ticket.affected}</Field>
      </div>
      {ticket.reopenedFrom && (
        <p className={classes.fieldNote}>Referência: {ticket.reopenedFrom}</p>
      )}
    </>
  );
}

function FieldChanges({ changes }: { changes: TicketFieldChanges }) {
  return (
    <div className={classes.fieldGrid}>
      {changes.priority && (
        <Field label="Nova prioridade">
          <DotLabel color={PRIORITY_COLORS[changes.priority]}>
            {PRIORITY_LABELS[changes.priority]}
          </DotLabel>
          {changes.priorityReason && (
            <div className={classes.fieldNote}>
              {priorityMotiveText(changes.priority, changes.priorityReason)}
            </div>
          )}
        </Field>
      )}
      {changes.category && (
        <Field label="Nova categoria">{TICKET_CATEGORY_LABELS[changes.category]}</Field>
      )}
      {changes.status && <Field label="Novo status">{TICKET_STATUS_LABELS[changes.status]}</Field>}
    </div>
  );
}

/** "⌘↵" no Mac, "Ctrl ↵" no resto (decisão 12). */
function ShortcutHint() {
  const os = useOs();
  return (
    <span className={classes.shortcut} aria-hidden>
      {os === "macos" || os === "ios" ? "⌘↵" : "Ctrl ↵"}
    </span>
  );
}

/**
 * ⌘↵/Ctrl+Enter confirma o rascunho pendente. Se a pessoa está escrevendo no campo de
 * mensagem, o atalho é dela (o Enter do campo envia), não do rascunho.
 */
function useConfirmShortcut(enabled: boolean, onConfirm: () => void) {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
      // Só um card responde ao atalho, mesmo que haja mais de um pendente na tela.
      if (event.defaultPrevented || isTypingSomewhere(event.target)) return;
      event.preventDefault();
      onConfirm();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onConfirm]);
}

function isTypingSomewhere(target: EventTarget | null): boolean {
  const isField = target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement;
  return isField && target.value.trim() !== "";
}

/** O card ligado ao Convex: o estado (pendente, confirmado...) muda em tempo real. */
export function LiveDraftCard({
  pendingActionId,
  callbacks,
}: {
  pendingActionId: string;
  callbacks: DraftCallbacks;
}) {
  const draft = useBlockPendingAction(pendingActionId);
  const now = useNow();

  if (draft === undefined) return <TicketCardSkeleton />;
  if (draft === null) return null;
  return <DraftCard draft={draft} now={now} callbacks={callbacks} />;
}
