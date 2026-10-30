"use client";

import { Radio } from "@mantine/core";

import { TICKET_STATUS_LABELS } from "@/domain/labels";
import type { TicketSummary } from "@/domain/ticket";
import { useBlockTickets } from "./block-reads";
import classes from "./blocks.module.css";
import { TICKET_STATUS_COLORS, formatShortDate, ticketChoiceText } from "./block-texts";
import { DotLabel } from "./dot-label";

/** Uma linha do seletor. Sem os dados do chamado (ainda carregando), mostra só o código. */
export interface TicketChoice {
  code: string;
  ticket: Pick<TicketSummary, "title" | "status" | "createdAt"> | null;
}

/**
 * Seletor de chamados em lista (§7.2, protótipo 03). A escolha vai como mensagem do
 * funcionário ("INC-20311 · Notebook lento após atualização"), para ficar no histórico.
 */
export function TicketSelector({
  prompt,
  choices,
  chosenText,
  interactive,
  onChoose,
}: {
  prompt: string;
  choices: TicketChoice[];
  /** O que o funcionário mandou logo depois, para marcar a linha escolhida. */
  chosenText: string | null;
  interactive: boolean;
  onChoose: (text: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label={prompt} className={classes.card}>
      {choices.map(({ code, ticket }) => {
        const text = ticketChoiceText(code, ticket?.title ?? null);
        const chosen = chosenText === text || chosenText === code;
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={chosen}
            className={classes.selectorRow}
            data-chosen={chosen || undefined}
            disabled={!interactive}
            onClick={() => onChoose(text)}
          >
            <Radio checked={chosen} readOnly tabIndex={-1} size="xs" aria-hidden />
            <span className={classes.selectorCode}>{code}</span>
            <span className={classes.selectorTitle}>{ticket?.title ?? ""}</span>
            {ticket && (
              <>
                <span className={classes.selectorMeta}>
                  <DotLabel color={TICKET_STATUS_COLORS[ticket.status]}>
                    {TICKET_STATUS_LABELS[ticket.status]}
                  </DotLabel>
                </span>
                <span className={`${classes.selectorMeta} ${classes.selectorDate}`}>
                  {formatShortDate(ticket.createdAt)}
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** O seletor com título, status e data lidos dos chamados do funcionário. */
export function LiveTicketSelector({
  codes,
  ...props
}: { codes: string[] } & Omit<Parameters<typeof TicketSelector>[0], "choices">) {
  const tickets = useBlockTickets();
  const choices = codes.map((code) => ({
    code,
    ticket: tickets?.find((ticket) => ticket.code === code) ?? null,
  }));
  return <TicketSelector choices={choices} {...props} />;
}
