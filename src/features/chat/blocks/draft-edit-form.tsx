"use client";

import { Button, Checkbox, Group, Select, Stack, Text, TextInput, Textarea } from "@mantine/core";
import { useState } from "react";

import { IMPACTS, TICKET_CATEGORIES, type Impact, type TicketCategory } from "@/domain/enums";
import { IMPACT_LABELS, PRIORITY_LABELS, TICKET_CATEGORY_LABELS } from "@/domain/labels";
import type { PendingAction } from "@/domain/pending-action";
import { derivePriority } from "@/domain/priority";
import type { NewTicket } from "@/domain/ticket";
import { priorityMotiveText } from "./block-texts";

// Edição inline do rascunho (§6.5 item 3). O formulário só monta a ação editada;
// gravar é do callback `onSaveEdit` (rota PATCH da T11).

interface EditFormProps<A extends PendingAction> {
  action: A;
  isSaving: boolean;
  onSave: (edited: PendingAction) => void;
  onCancel: () => void;
}

export function DraftEditForm(props: EditFormProps<PendingAction>) {
  const { action } = props;
  switch (action.kind) {
    case "create_ticket":
      return <NewTicketEditForm {...props} action={action} />;
    case "update_ticket":
      return (
        <SingleTextEditForm
          {...props}
          label="Informação para o chamado"
          initialText={action.text}
          build={(text) => ({ ...action, text })}
        />
      );
    case "reopen_ticket":
      return (
        <SingleTextEditForm
          {...props}
          label="Motivo da reabertura"
          initialText={action.reason}
          build={(reason) => ({ ...action, reason })}
        />
      );
  }
}

function NewTicketEditForm({
  action,
  isSaving,
  onSave,
  onCancel,
}: EditFormProps<Extract<PendingAction, { kind: "create_ticket" }>>) {
  const [ticket, setTicket] = useState<NewTicket>(action.ticket);
  // A prioridade nunca é escolhida: sai dos sinais, como no resto do sistema (§3.5).
  const derived = derivePriority({ kind: ticket.kind, ...ticket.prioritySignals });

  function update(changes: Partial<NewTicket>) {
    setTicket((current) => ({ ...current, ...changes }));
  }
  function updateSignals(changes: Partial<NewTicket["prioritySignals"]>) {
    setTicket((current) => ({
      ...current,
      prioritySignals: { ...current.prioritySignals, ...changes },
    }));
  }

  const canSave = ticket.title.trim() !== "" && ticket.description.trim() !== "";

  return (
    <Stack gap="xs" mt="xs">
      <TextInput
        label="Título"
        size="xs"
        value={ticket.title}
        onChange={(event) => update({ title: event.currentTarget.value })}
      />
      <Textarea
        label="Descrição"
        size="xs"
        autosize
        minRows={2}
        value={ticket.description}
        onChange={(event) => update({ description: event.currentTarget.value })}
      />
      <Group grow gap="xs" align="flex-start">
        <Select
          label="Categoria"
          size="xs"
          allowDeselect={false}
          data={TICKET_CATEGORIES.map((value) => ({ value, label: TICKET_CATEGORY_LABELS[value] }))}
          value={ticket.category}
          onChange={(value) => value && update({ category: value as TicketCategory })}
        />
        <Select
          label="Quem é afetado"
          size="xs"
          allowDeselect={false}
          data={IMPACTS.map((value) => ({ value, label: IMPACT_LABELS[value] }))}
          value={ticket.prioritySignals.impact}
          onChange={(value) => value && updateSignals({ impact: value as Impact })}
        />
      </Group>
      <TextInput
        label="Afetados (como aparece no chamado)"
        size="xs"
        value={ticket.affected}
        onChange={(event) => update({ affected: event.currentTarget.value })}
      />
      <Checkbox
        size="xs"
        label="Impede de trabalhar"
        checked={ticket.prioritySignals.blocked}
        onChange={(event) => updateSignals({ blocked: event.currentTarget.checked })}
      />
      <Checkbox
        size="xs"
        label="Há um compromisso hoje que depende disso"
        checked={ticket.prioritySignals.deadlineToday}
        onChange={(event) => updateSignals({ deadlineToday: event.currentTarget.checked })}
      />
      <Text size="xs" c="dimmed">
        Prioridade: <b>{PRIORITY_LABELS[derived.priority]}</b> ·{" "}
        {priorityMotiveText(derived.priority, derived.reason)}
      </Text>
      <EditActions
        isSaving={isSaving}
        canSave={canSave}
        onCancel={onCancel}
        onSave={() =>
          onSave({
            ...action,
            ticket: { ...ticket, priority: derived.priority, priorityReason: derived.reason },
          })
        }
      />
    </Stack>
  );
}

function SingleTextEditForm({
  label,
  initialText,
  build,
  isSaving,
  onSave,
  onCancel,
}: Omit<EditFormProps<PendingAction>, "action"> & {
  label: string;
  initialText: string;
  build: (text: string) => PendingAction;
}) {
  const [text, setText] = useState(initialText);
  return (
    <Stack gap="xs" mt="xs">
      <Textarea
        label={label}
        size="xs"
        autosize
        minRows={2}
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
      />
      <EditActions
        isSaving={isSaving}
        canSave={text.trim() !== ""}
        onCancel={onCancel}
        onSave={() => onSave(build(text.trim()))}
      />
    </Stack>
  );
}

function EditActions({
  isSaving,
  canSave,
  onSave,
  onCancel,
}: {
  isSaving: boolean;
  canSave: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <Group gap="xs" mt={4}>
      <Button size="xs" loading={isSaving} disabled={!canSave} onClick={onSave}>
        Salvar alterações
      </Button>
      <Button size="xs" variant="subtle" color="gray" disabled={isSaving} onClick={onCancel}>
        Descartar
      </Button>
    </Group>
  );
}
