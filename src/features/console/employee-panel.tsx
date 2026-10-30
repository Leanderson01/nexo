"use client";

import { ActionIcon, Alert, Skeleton, Stack } from "@mantine/core";
import { useQuery } from "convex/react";
import { useState } from "react";

import type { ConversationStatus } from "@/domain/enums";
import { PRIORITY_LABELS, TICKET_CATEGORY_LABELS, TICKET_STATUS_LABELS } from "@/domain/labels";
import { formatSlaBadge, getSlaState, type SlaState } from "@/domain/sla";
import type { TicketSummary } from "@/domain/ticket";
import { formatDateTime, formatTime } from "@/features/chat/blocks/block-texts";
import { useNow } from "@/features/chat/blocks/use-now";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  HeadsetIcon,
  ICON_SIZE,
  TransferIcon,
} from "@/shared/icons";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import classes from "./console.module.css";
import {
  TICKET_STATUS_TONES,
  firstName,
  overdueFirst,
  ticketCountsText,
  ticketStatusText,
  ticketUpdateText,
  updateAuthorText,
  type StatusTone,
} from "./console-texts";
import { StatusLabel } from "./status-label";
import { TicketUpdateForm } from "./ticket-update-form";

export interface PanelEmployee {
  _id: Id<"people">;
  name: string;
  email: string;
  department: string;
}

/** O que a linha de baixo do card "Desta conversa" conta: transferência ou quem assumiu. */
export interface PanelConversation {
  status: ConversationStatus;
  relatedTicketCode: string | null;
  handoffAt: number | null;
  assignedAnalystName: string | null;
  /** Quando o analista atual assumiu (o evento no histórico). */
  assignedAt: number | null;
}

/** Prazo que pede atenção vira tom; "no prazo", pausado e encerrado não aparecem. */
const SLA_ALERT_TONES: Partial<Record<SlaState, StatusTone>> = {
  overdue: "danger",
  due_soon: "warning",
};

/**
 * Painel "Chamados do Pedro" (§7.4, protótipos 05 e 06): o chamado desta conversa, os outros
 * com status e prazo (vencidos no topo) e, ao clicar, o detalhe com o histórico de
 * atualizações.
 */
export function EmployeePanel({
  employee,
  conversation,
  onClose,
  inDrawer = false,
}: {
  employee: PanelEmployee;
  conversation: PanelConversation;
  onClose: () => void;
  /** Em telas estreitas o painel abre numa gaveta, por cima da conversa, e ocupa a gaveta toda. */
  inDrawer?: boolean;
}) {
  const tickets = useQuery(api.ticketing.queries.employeeTickets, { employeeId: employee._id });
  const [openCode, setOpenCode] = useState<string | null>(null);
  const now = useNow();

  return (
    <aside
      className={classes.panel}
      data-in-drawer={inDrawer || undefined}
      aria-label={`Chamados de ${employee.name}`}
    >
      <div className={classes.panelHeader}>
        <div>
          <div className={classes.panelTitle}>Chamados de {firstName(employee.name)}</div>
          <div className={classes.panelSub}>
            {tickets ? ticketCountsText(tickets.map((ticket) => ticket.status)) : " "}
          </div>
        </div>
        <ActionIcon
          variant="subtle"
          color="gray"
          size={32}
          onClick={onClose}
          aria-label="Fechar painel"
        >
          <CloseIcon size={ICON_SIZE.lg} />
        </ActionIcon>
      </div>

      <div className={classes.panelBody}>
        {openCode ? (
          <TicketDetailView
            employeeId={employee._id}
            employeeName={employee.name}
            code={openCode}
            now={now}
            onBack={() => setOpenCode(null)}
          />
        ) : tickets === undefined ? (
          <TicketsSkeleton />
        ) : (
          <TicketLists
            tickets={tickets}
            conversation={conversation}
            now={now}
            onOpen={setOpenCode}
          />
        )}
      </div>
    </aside>
  );
}

function TicketLists({
  tickets,
  conversation,
  now,
  onOpen,
}: {
  tickets: TicketSummary[];
  conversation: PanelConversation;
  now: number;
  onOpen: (code: string) => void;
}) {
  const current = tickets.find((ticket) => ticket.code === conversation.relatedTicketCode);
  const others = overdueFirst(
    tickets.filter((ticket) => ticket !== current),
    now,
  );

  return (
    <>
      {current && (
        <>
          <div className={classes.panelSection}>Desta conversa</div>
          <button type="button" className={classes.thisTicket} onClick={() => onOpen(current.code)}>
            <div className={classes.thisTicketTop}>
              <span>{current.code}</span>
              <StatusLabel tone={TICKET_STATUS_TONES[current.status]}>
                {TICKET_STATUS_LABELS[current.status]}
              </StatusLabel>
            </div>
            <div className={classes.thisTicketTitle}>{current.title}</div>
            <div className={classes.thisTicketMeta}>
              {TICKET_CATEGORY_LABELS[current.category]} · prioridade{" "}
              {PRIORITY_LABELS[current.priority].toLowerCase()}
              <SlaAlert ticket={current} now={now} />
            </div>
            <ConversationLine conversation={conversation} />
          </button>
        </>
      )}

      <div className={classes.panelSection}>{current ? "Outros chamados" : "Chamados"}</div>
      {others.length === 0 ? (
        <p className={classes.panelEmpty}>Nenhum outro chamado.</p>
      ) : (
        others.map((ticket) => (
          <TicketRow key={ticket.code} ticket={ticket} now={now} onOpen={onOpen} />
        ))
      )}
    </>
  );
}

/** " · vencido há 3 dias", em cor, só quando o prazo pede atenção. */
function SlaAlert({ ticket, now }: { ticket: TicketSummary; now: number }) {
  const tone = SLA_ALERT_TONES[getSlaState(ticket, now)];
  if (!tone) return null;
  return (
    <span className={classes.slaAlert} data-tone={tone}>
      {" · "}
      {formatSlaBadge(ticket, now)}
    </span>
  );
}

function ConversationLine({ conversation }: { conversation: PanelConversation }) {
  if (conversation.status === "with_analyst" && conversation.assignedAnalystName) {
    return (
      <div className={classes.thisTicketFooter}>
        <span className={classes.thisTicketFooterText}>
          <HeadsetIcon size={ICON_SIZE.sm} /> Assumido por {conversation.assignedAnalystName}
        </span>
        {conversation.assignedAt !== null && <span>{formatTime(conversation.assignedAt)}</span>}
      </div>
    );
  }
  if (conversation.handoffAt === null) return null;
  return (
    <div className={classes.thisTicketFooter}>
      <span className={classes.thisTicketFooterText}>
        <TransferIcon size={ICON_SIZE.sm} /> Transferido para um analista
      </span>
      <span>{formatTime(conversation.handoffAt)}</span>
    </div>
  );
}

function TicketRow({
  ticket,
  now,
  onOpen,
}: {
  ticket: TicketSummary;
  now: number;
  onOpen: (code: string) => void;
}) {
  return (
    <button type="button" className={classes.ticketRow} onClick={() => onOpen(ticket.code)}>
      <span
        className={classes.ticketDot}
        data-tone={TICKET_STATUS_TONES[ticket.status]}
        aria-hidden
      />
      <span className={classes.ticketRowTitle}>{ticket.title}</span>
      <span className={classes.ticketChevron}>
        <ChevronRightIcon size={ICON_SIZE.md} />
      </span>
      <span className={classes.ticketRowMeta}>
        {ticket.code} · {ticketStatusText(ticket)}
        <SlaAlert ticket={ticket} now={now} />
      </span>
    </button>
  );
}

function TicketDetailView({
  employeeId,
  employeeName,
  code,
  now,
  onBack,
}: {
  employeeId: Id<"people">;
  employeeName: string;
  code: string;
  now: number;
  onBack: () => void;
}) {
  const ticket = useQuery(api.ticketing.queries.employeeTicket, { employeeId, code });

  return (
    <>
      <button type="button" className={classes.backButton} onClick={onBack}>
        <ChevronLeftIcon size={ICON_SIZE.sm} /> Chamados de {firstName(employeeName)}
      </button>
      {ticket === undefined ? (
        <TicketsSkeleton />
      ) : ticket === null ? (
        <Alert color="gray" variant="light" mt="sm">
          Não encontramos o {code} entre os chamados de {firstName(employeeName)}.
        </Alert>
      ) : (
        <Stack gap="sm">
          <div className={classes.thisTicketTop}>
            <span>{ticket.code}</span>
            <StatusLabel tone={TICKET_STATUS_TONES[ticket.status]}>
              {TICKET_STATUS_LABELS[ticket.status]}
            </StatusLabel>
          </div>
          <div className={classes.detailTitle}>{ticket.title}</div>
          <p className={classes.detailDescription}>{ticket.description}</p>
          <dl className={classes.detailFields}>
            <DetailField label="Categoria">{TICKET_CATEGORY_LABELS[ticket.category]}</DetailField>
            <DetailField label="Prioridade">{PRIORITY_LABELS[ticket.priority]}</DetailField>
            <DetailField label="Prazo">
              <span
                className={classes.slaAlert}
                data-tone={SLA_ALERT_TONES[getSlaState(ticket, now)]}
              >
                {formatSlaBadge(ticket, now)}
              </span>
            </DetailField>
            <DetailField label="Aberto em">{formatDateTime(ticket.createdAt)}</DetailField>
          </dl>

          {ticket.status !== "closed" && (
            <TicketUpdateForm
              key={ticket.code}
              employeeId={employeeId}
              code={ticket.code}
              currentStatus={ticket.status}
            />
          )}

          <div className={classes.panelSection}>Histórico</div>
          {ticket.updates.length === 0 ? (
            <p className={classes.panelEmpty}>Nenhuma atualização ainda.</p>
          ) : (
            <ol className={classes.timeline}>
              {[...ticket.updates].reverse().map((update, index) => (
                <li key={index} className={classes.timelineItem}>
                  <div className={classes.timelineMeta}>
                    {updateAuthorText(update.authorType, update.authorName)} ·{" "}
                    {formatDateTime(update.createdAt)}
                  </div>
                  <div>{ticketUpdateText(update.text)}</div>
                  {update.fieldChanges?.status && (
                    <div className={classes.timelineMeta}>
                      Status: {TICKET_STATUS_LABELS[update.fieldChanges.status]}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Stack>
      )}
    </>
  );
}

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={classes.detailField}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function TicketsSkeleton() {
  return (
    <Stack gap="sm" mt="md" aria-label="Carregando os chamados">
      <Skeleton height={120} radius="lg" />
      <Skeleton height={14} width="70%" />
      <Skeleton height={14} width="55%" />
    </Stack>
  );
}
