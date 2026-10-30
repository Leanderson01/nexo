"use client";

import { Alert, Button, Group, Select, Stack, Textarea } from "@mantine/core";
import { useMutation } from "convex/react";
import { useState } from "react";

import { TICKET_STATUSES, type TicketStatus } from "@/domain/enums";
import { TICKET_STATUS_LABELS } from "@/domain/labels";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { TICKET_UPDATE_ERROR_TEXTS } from "./console-texts";

const KEEP_STATUS = "keep";

/**
 * "Registrar atualização" no detalhe do chamado (T17): o analista escreve no histórico e, se
 * quiser, muda o status. O funcionário recebe o evento no chat e um toast (§11.6).
 */
export function TicketUpdateForm({
  employeeId,
  code,
  currentStatus,
}: {
  employeeId: Id<"people">;
  code: string;
  currentStatus: TicketStatus;
}) {
  const register = useMutation(api.console.registerTicketUpdate);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string>(KEEP_STATUS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button size="xs" variant="light" onClick={() => setOpen(true)}>
        Registrar atualização
      </Button>
    );
  }

  function close() {
    setOpen(false);
    setText("");
    setStatus(KEEP_STATUS);
    setError(null);
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const result = await register({
        employeeId,
        code,
        text,
        status: status === KEEP_STATUS ? undefined : (status as TicketStatus),
      });
      if (result.ok) close();
      else setError(TICKET_UPDATE_ERROR_TEXTS[result.error]);
    } catch {
      setError("Não foi possível registrar agora. Verifique sua conexão e tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  const statusOptions = [
    { value: KEEP_STATUS, label: `Manter (${TICKET_STATUS_LABELS[currentStatus]})` },
    ...TICKET_STATUSES.filter((value) => value !== currentStatus).map((value) => ({
      value,
      label: TICKET_STATUS_LABELS[value],
    })),
  ];

  return (
    <Stack gap="xs">
      <Textarea
        label="Atualização"
        placeholder="O que foi feito ou o que falta"
        size="xs"
        autosize
        minRows={2}
        maxRows={6}
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
        autoFocus
      />
      <Select
        label="Status"
        size="xs"
        data={statusOptions}
        value={status}
        onChange={(value) => setStatus(value ?? KEEP_STATUS)}
        allowDeselect={false}
        comboboxProps={{ withinPortal: true }}
      />
      {error && (
        <Alert color="red" variant="light" p="xs">
          {error}
        </Alert>
      )}
      <Group gap="xs" justify="flex-end">
        <Button size="xs" variant="subtle" color="gray" onClick={close} disabled={saving}>
          Cancelar
        </Button>
        <Button size="xs" onClick={submit} loading={saving} disabled={text.trim() === ""}>
          Registrar
        </Button>
      </Group>
    </Stack>
  );
}
