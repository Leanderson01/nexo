"use client";

import { Skeleton } from "@mantine/core";

import { PRIORITY_LABELS, TICKET_CATEGORY_LABELS, TICKET_STATUS_LABELS } from "@/domain/labels";
import { formatSlaBadge, getSlaState } from "@/domain/sla";
import type { Ticket } from "@/domain/ticket";
import { useBlockTicket } from "./block-reads";
import classes from "./blocks.module.css";
import {
  PRIORITY_COLORS,
  SLA_STATE_COLORS,
  TICKET_STATUS_COLORS,
  formatDateTime,
  relativeTimeText,
} from "./block-texts";
import { DotLabel } from "./dot-label";
import { useNow } from "./use-now";

export type TicketCardData = Pick<
  Ticket,
  | "code"
  | "title"
  | "description"
  | "status"
  | "category"
  | "priority"
  | "createdAt"
  | "lastActivityAt"
>;

/** Card do chamado (§7.2, protótipo 03): campos, status com cor e o selo de prazo. */
export function TicketCard({ ticket, now }: { ticket: TicketCardData; now: number }) {
  const slaColor = SLA_STATE_COLORS[getSlaState(ticket, now)];

  return (
    <article className={classes.card}>
      <div className={classes.cardBody}>
        <div className={classes.cardKicker}>
          <span className={classes.kickerTrail}>
            Chamado
            <span className={classes.kickerSeparator} aria-hidden />
            {ticket.code}
          </span>
          <DotLabel color={TICKET_STATUS_COLORS[ticket.status]} colorText>
            {TICKET_STATUS_LABELS[ticket.status]}
          </DotLabel>
        </div>
        <h3 className={classes.cardTitle}>{ticket.title}</h3>
        <p className={classes.cardText}>{ticket.description}</p>

        <div className={classes.fieldGrid}>
          <Field label="Categoria">{TICKET_CATEGORY_LABELS[ticket.category]}</Field>
          <Field label="Prioridade">
            <DotLabel color={PRIORITY_COLORS[ticket.priority]}>
              {PRIORITY_LABELS[ticket.priority]}
            </DotLabel>
          </Field>
          <Field label="Aberto em">{formatDateTime(ticket.createdAt)}</Field>
          <Field label="Última atualização">
            <span style={{ color: `var(--mantine-color-${slaColor}-8)` }}>
              {relativeTimeText(ticket.lastActivityAt, now)}
            </span>{" "}
            <span className={classes.fieldNote}>· {formatSlaBadge(ticket, now)}</span>
          </Field>
        </div>
      </div>
    </article>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className={classes.fieldLabel}>{label}</div>
      <div className={classes.fieldValue}>{children}</div>
    </div>
  );
}

/** O card ligado ao Convex: atualiza sozinho quando o chamado muda. */
export function LiveTicketCard({ code }: { code: string }) {
  const ticket = useBlockTicket(code);
  const now = useNow();

  if (ticket === undefined) return <TicketCardSkeleton />;
  if (ticket === null) return <TicketNotFound code={code} />;
  return <TicketCard ticket={ticket} now={now} />;
}

export function TicketCardSkeleton() {
  return (
    <div className={classes.card} aria-label="Carregando o chamado">
      <div className={classes.cardBody}>
        <Skeleton height={10} width={120} />
        <Skeleton height={16} width="60%" mt={10} />
        <Skeleton height={10} width="85%" mt={8} />
        <Skeleton height={28} mt={16} />
      </div>
    </div>
  );
}

export function TicketNotFound({ code }: { code: string }) {
  return (
    <div className={classes.card}>
      <div className={classes.cardBody}>
        <div className={classes.cardKicker}>Chamado · {code}</div>
        <p className={classes.cardText}>Não encontramos esse chamado entre os seus.</p>
      </div>
    </div>
  );
}
