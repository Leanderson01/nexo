"use client";

import { Alert, Button, Group, Select, Stack, Textarea } from "@mantine/core";
import type { OptimisticLocalStore } from "convex/browser";
import { useMutation } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { useState } from "react";

import { TICKET_STATUSES, type TicketStatus } from "@/domain/enums";
import { TICKET_STATUS_LABELS } from "@/domain/labels";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { TICKET_UPDATE_ERROR_TEXTS } from "./console-texts";
import { withTicketSummaryStatus, withTicketUpdate } from "./optimistic-updates";

const KEEP_STATUS = "keep";

/**
 * "Registrar atualização" no detalhe do chamado (T17): o analista escreve no histórico e, se
 * quiser, muda o status. O funcionário recebe o evento no chat e um toast (§11.6).
 *
 * Otimista (UX1): a atualização entra no histórico do chamado no clique e o formulário fecha;
 * se o servidor recusar, ela sai, o formulário reabre com o texto e o erro aparece.
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
  const register = useMutation(api.console.registerTicketUpdate).withOptimisticUpdate(
    showTicketUpdate,
  );
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string>(KEEP_STATUS);
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
    const typed = { text, status };
    setOpen(false);
    setError(null);
    const failure = await registerUpdate();
    if (failure === null) {
      close();
      return;
    }
    // Recusada: volta o que foi digitado, com o erro.
    setText(typed.text);
    setStatus(typed.status);
    setError(failure);
    setOpen(true);
  }

  async function registerUpdate(): Promise<string | null> {
    try {
      const result = await register({
        employeeId,
        code,
        text,
        status: status === KEEP_STATUS ? undefined : (status as TicketStatus),
      });
      return result.ok ? null : TICKET_UPDATE_ERROR_TEXTS[result.error];
    } catch {
      return "Não foi possível registrar agora. Verifique sua conexão e tente de novo.";
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
        <Button size="xs" variant="subtle" color="gray" onClick={close}>
          Cancelar
        </Button>
        <Button size="xs" onClick={() => void submit()} disabled={text.trim() === ""}>
          Registrar
        </Button>
      </Group>
    </Stack>
  );
}

function showTicketUpdate(
  store: OptimisticLocalStore,
  args: FunctionArgs<typeof api.console.registerTicketUpdate>,
) {
  if (args.text.trim() === "") return;
  const now = Date.now();
  const analystName = store.getQuery(api.auth.currentPerson, {})?.name ?? null;
  const ticketArgs = { employeeId: args.employeeId, code: args.code };
  const ticket = store.getQuery(api.ticketing.queries.employeeTicket, ticketArgs);
  if (ticket) {
    store.setQuery(
      api.ticketing.queries.employeeTicket,
      ticketArgs,
      withTicketUpdate(ticket, { text: args.text, status: args.status, analystName, now }),
    );
  }
  const tickets = store.getQuery(api.ticketing.queries.employeeTickets, {
    employeeId: args.employeeId,
  });
  if (tickets && args.status !== undefined) {
    store.setQuery(
      api.ticketing.queries.employeeTickets,
      { employeeId: args.employeeId },
      withTicketSummaryStatus(tickets, args.code, args.status, now),
    );
  }
}
