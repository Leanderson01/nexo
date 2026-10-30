"use client";

import { ActionIcon, Alert, Skeleton, Stack, Text } from "@mantine/core";
import { useQuery } from "convex/react";
import { useState } from "react";

import type { ConversationStatus } from "@/domain/enums";
import { PRIORITY_LABELS, TICKET_CATEGORY_LABELS, TICKET_STATUS_LABELS } from "@/domain/labels";
import { formatSlaBadge, getSlaState, isOverdue } from "@/domain/sla";
import type { TicketSummary } from "@/domain/ticket";
import {
  PRIORITY_COLORS,
  SLA_STATE_COLORS,
  TICKET_STATUS_COLORS,
  formatDateTime,
  formatTime,
} from "@/features/chat/blocks/block-texts";
import { DotLabel } from "@/features/chat/blocks/dot-label";
import { useNow } from "@/features/chat/blocks/use-now";
import { ArrowsSwapIcon, ChevronRightIcon, HeadsetIcon } from "@/features/chat/icons";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import classes from "./console.module.css";
import { firstName, overdueFirst, ticketCountsText, updateAuthorText } from "./console-texts";
import { ChevronLeftIcon, CloseIcon } from "./icons";
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
}

/**
 * Painel "Chamados do Pedro" (§7.4, protótipos 05 e 06): dados do funcionário, o chamado
 * desta conversa, os outros com status e prazo (vencidos no topo) e, ao clicar, o detalhe
 * com o histórico de atualizações.
 */
export function EmployeePanel({
  employee,
  conversation,
  onClose,
}: {
  employee: PanelEmployee;
  conversation: PanelConversation;
  onClose: () => void;
}) {
  const tickets = useQuery(api.ticketing.queries.employeeTickets, { employeeId: employee._id });
  const [openCode, setOpenCode] = useState<string | null>(null);
  const now = useNow();

  return (
    <aside className={classes.panel} aria-label={`Chamados de ${employee.name}`}>
      <div className={classes.panelHeader}>
        <div>
          <div className={classes.panelTitle}>Chamados de {firstName(employee.name)}</div>
          <div className={classes.panelSub}>
            {tickets ? ticketCountsText(tickets.map((ticket) => ticket.status)) : " "}
          </div>
        </div>
        <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label="Fechar painel">
          <CloseIcon size={16} />
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
        ) : (
          <>
            <div className={classes.employeeData}>
              <Text size="sm" fw={600}>
                {employee.name}
              </Text>
              <Text size="xs" c="dimmed">
                {employee.department} · {employee.email}
              </Text>
            </div>
            {tickets === undefined ? (
              <TicketsSkeleton />
            ) : (
              <TicketLists
                tickets={tickets}
                conversation={conversation}
                now={now}
                onOpen={setOpenCode}
              />
            )}
          </>
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
              <DotLabel color={TICKET_STATUS_COLORS[current.status]} colorText>
                {TICKET_STATUS_LABELS[current.status]}
              </DotLabel>
            </div>
            <div className={classes.thisTicketTitle}>{current.title}</div>
            <Text size="xs" c="dimmed">
              {TICKET_CATEGORY_LABELS[current.category]} · prioridade{" "}
              {PRIORITY_LABELS[current.priority].toLowerCase()} · {formatSlaBadge(current, now)}
            </Text>
            <ConversationLine conversation={conversation} />
          </button>
        </>
      )}

      <div className={classes.panelSection}>{current ? "Outros chamados" : "Chamados"}</div>
      {others.length === 0 ? (
        <Text size="xs" c="dimmed">
          Nenhum outro chamado.
        </Text>
      ) : (
        others.map((ticket) => (
          <TicketRow key={ticket.code} ticket={ticket} now={now} onOpen={onOpen} />
        ))
      )}
    </>
  );
}

function ConversationLine({ conversation }: { conversation: PanelConversation }) {
  if (conversation.status === "with_analyst" && conversation.assignedAnalystName) {
    return (
      <div className={classes.thisTicketFooter}>
        <span>
          <HeadsetIcon size={12} /> Assumido por {conversation.assignedAnalystName}
        </span>
      </div>
    );
  }
  if (conversation.handoffAt === null) return null;
  return (
    <div className={classes.thisTicketFooter}>
      <span>
        <ArrowsSwapIcon size={12} /> Transferido para um analista
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
  const overdue = isOverdue(ticket, now);
  return (
    <button type="button" className={classes.ticketRow} onClick={() => onOpen(ticket.code)}>
      <span
        className={classes.ticketDot}
        style={{ color: `var(--mantine-color-${TICKET_STATUS_COLORS[ticket.status]}-6)` }}
        aria-hidden
      />
      <span className={classes.ticketRowTitle}>{ticket.title}</span>
      <span className={classes.ticketChevron}>
        <ChevronRightIcon size={14} />
      </span>
      <span className={classes.ticketRowMeta}>
        {ticket.code} · {TICKET_STATUS_LABELS[ticket.status]} ·{" "}
        <span className={overdue ? classes.overdueTag : undefined}>
          {formatSlaBadge(ticket, now)}
        </span>
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
        <ChevronLeftIcon size={14} /> Chamados de {firstName(employeeName)}
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
            <DotLabel color={TICKET_STATUS_COLORS[ticket.status]} colorText>
              {TICKET_STATUS_LABELS[ticket.status]}
            </DotLabel>
          </div>
          <Text fw={600}>{ticket.title}</Text>
          <Text size="sm" c="dark.4">
            {ticket.description}
          </Text>
          <Stack gap={4}>
            <DetailField label="Categoria">{TICKET_CATEGORY_LABELS[ticket.category]}</DetailField>
            <DetailField label="Prioridade">
              <DotLabel color={PRIORITY_COLORS[ticket.priority]}>
                {PRIORITY_LABELS[ticket.priority]}
              </DotLabel>
            </DetailField>
            <DetailField label="Prazo">
              <span
                style={{
                  color: `var(--mantine-color-${SLA_STATE_COLORS[getSlaState(ticket, now)]}-7)`,
                }}
              >
                {formatSlaBadge(ticket, now)}
              </span>
            </DetailField>
            <DetailField label="Aberto em">{formatDateTime(ticket.createdAt)}</DetailField>
          </Stack>

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
            <Text size="xs" c="dimmed">
              Nenhuma atualização ainda.
            </Text>
          ) : (
            <ol className={classes.timeline}>
              {[...ticket.updates].reverse().map((update, index) => (
                <li key={index} className={classes.timelineItem}>
                  <div className={classes.timelineMeta}>
                    {updateAuthorText(update.authorType, update.authorName)} ·{" "}
                    {formatDateTime(update.createdAt)}
                  </div>
                  <div>{update.text}</div>
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
    <Text size="xs" component="div">
      <Text span size="xs" c="dimmed" w={80} display="inline-block">
        {label}
      </Text>
      {children}
    </Text>
  );
}

function TicketsSkeleton() {
  return (
    <Stack gap="sm" mt="md" aria-label="Carregando os chamados">
      <Skeleton height={70} radius="md" />
      <Skeleton height={14} width="70%" />
      <Skeleton height={14} width="55%" />
    </Stack>
  );
}
