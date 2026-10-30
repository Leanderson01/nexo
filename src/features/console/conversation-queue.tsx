"use client";

import { Menu, Skeleton, Stack, TextInput, UnstyledButton } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { HANDOFF_REASONS, type ConsoleTab, type HandoffReason } from "@/domain/enums";
import { CONSOLE_TAB_LABELS, HANDOFF_REASON_LABELS } from "@/domain/labels";
import { formatSlaBadge, getSlaState } from "@/domain/sla";
import { useNow } from "@/features/chat/blocks/use-now";
import { FilterIcon, ICON_SIZE, SearchIcon } from "@/shared/icons";
import { api } from "../../../convex/_generated/api";
import classes from "./console.module.css";
import {
  HANDOFF_REASON_TONES,
  lastMessagePreview,
  queueCornerText,
  queueStatusLine,
} from "./console-texts";
import { InitialsAvatar } from "./initials-avatar";
import { StatusLabel } from "./status-label";
import { useHydrated } from "@/shared/use-hydrated";

/** As abas do protótipo; "Encerradas" fica no menu de filtros, para caber na largura da fila. */
const OPEN_TABS: ConsoleTab[] = ["all", "for_you", "with_agent", "mine"];

type QueueItem = FunctionReturnType<typeof api.console.listConversations>["items"][number];

/** Fila de conversas (protótipo 05): busca, abas com contadores, filtro por motivo e itens. */
export function ConversationQueue({
  fresh,
  onOpen,
  onSeeFresh,
}: {
  /** Conversas que chegaram depois que o console abriu: ganham destaque até serem abertas. */
  fresh: ReadonlySet<string>;
  onOpen: (conversationId: string) => void;
  onSeeFresh: () => void;
}) {
  const [tab, setTab] = useState<ConsoleTab>("for_you");
  const [reason, setReason] = useState<HandoffReason | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 250);
  const params = useParams<{ conversationId?: string }>();
  const now = useNow(30_000);

  // Até hidratar, a query fica parada: servidor e cliente desenham o mesmo esqueleto (sem
  // isso, a lista e os contadores das abas vinham do cache só no cliente).
  const hydrated = useHydrated();
  const queue = useQuery(
    api.console.listConversations,
    hydrated
      ? {
          tab,
          reason: reason ?? undefined,
          search: debouncedSearch.trim() === "" ? undefined : debouncedSearch,
        }
      : "skip",
  );

  function showFresh() {
    setTab("for_you");
    setReason(null);
    setSearch("");
    onSeeFresh();
  }

  return (
    <section className={classes.queue} aria-label="Fila de conversas">
      <div className={classes.queueHeader}>
        <h1 className={classes.queueTitle}>Conversas</h1>
        {fresh.size > 0 ? (
          <button type="button" className={classes.freshButton} onClick={showFresh}>
            {fresh.size === 1 ? "1 nova" : `${fresh.size} novas`}
          </button>
        ) : (
          <span className={classes.available}>Disponível</span>
        )}
      </div>

      <div className={classes.queueTools}>
        <TextInput
          size="sm"
          variant="filled"
          classNames={{ input: classes.searchInput }}
          placeholder="Pesquisar conversa ou chamado"
          aria-label="Pesquisar por funcionário, assunto ou código do chamado"
          leftSection={<SearchIcon size={ICON_SIZE.md} />}
          rightSection={
            <QueueFilterMenu
              reason={reason}
              onReasonChange={setReason}
              onShowClosed={() => setTab("closed")}
            />
          }
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
      </div>

      <div className={classes.tabs} role="tablist" aria-label="Filtrar por estado">
        {OPEN_TABS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={classes.tab}
            data-active={tab === value || undefined}
            onClick={() => setTab(value)}
          >
            {CONSOLE_TAB_LABELS[value]}
            {value !== "all" && queue && (
              <span className={classes.tabCount}>{queue.counts[value]}</span>
            )}
          </button>
        ))}
      </div>

      {(reason || tab === "closed") && (
        <div className={classes.reasonFilter}>
          Filtro:
          {tab === "closed" && <span>{CONSOLE_TAB_LABELS.closed}</span>}
          {reason && (
            <StatusLabel tone={HANDOFF_REASON_TONES[reason]}>
              {HANDOFF_REASON_LABELS[reason]}
            </StatusLabel>
          )}
          <UnstyledButton
            fz={12}
            c="var(--nexo-color-primary)"
            onClick={() => {
              setReason(null);
              if (tab === "closed") setTab("all");
            }}
          >
            limpar
          </UnstyledButton>
        </div>
      )}

      <div className={classes.queueList}>
        {queue === undefined ? (
          <QueueItemsSkeleton />
        ) : queue.items.length === 0 ? (
          <p className={classes.queueEmpty}>{emptyQueueText(tab, debouncedSearch, reason)}</p>
        ) : (
          queue.items.map((item) => (
            <QueueRow
              key={item._id}
              item={item}
              now={now}
              active={params.conversationId === item._id}
              fresh={fresh.has(item._id)}
              onOpen={() => onOpen(item._id)}
            />
          ))
        )}
      </div>
    </section>
  );
}

function emptyQueueText(tab: ConsoleTab, search: string, reason: HandoffReason | null): string {
  if (search.trim() !== "" || reason) return "Nenhuma conversa com esse filtro.";
  switch (tab) {
    case "for_you":
      return "Ninguém aguardando atendente agora.";
    case "mine":
      return "Você não está atendendo nenhuma conversa.";
    case "with_agent":
      return "Nenhuma conversa com o agent agora.";
    case "closed":
      return "Nenhuma conversa encerrada ainda.";
    case "all":
      return "Nenhuma conversa aberta.";
  }
}

/**
 * Filtros que não cabem nas abas do protótipo: motivo da transferência e as encerradas
 * (decisão 13).
 */
function QueueFilterMenu({
  reason,
  onReasonChange,
  onShowClosed,
}: {
  reason: HandoffReason | null;
  onReasonChange: (reason: HandoffReason | null) => void;
  onShowClosed: () => void;
}) {
  return (
    <Menu position="bottom-end" withArrow>
      <Menu.Target>
        <UnstyledButton
          aria-label="Filtrar por motivo ou ver encerradas"
          className={classes.filterButton}
          data-active={reason !== null || undefined}
        >
          <FilterIcon size={ICON_SIZE.md} />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Motivo da transferência</Menu.Label>
        <Menu.Item onClick={() => onReasonChange(null)}>Todos os motivos</Menu.Item>
        {HANDOFF_REASONS.map((value) => (
          <Menu.Item key={value} onClick={() => onReasonChange(value)}>
            <StatusLabel tone={HANDOFF_REASON_TONES[value]} colorText={false}>
              {HANDOFF_REASON_LABELS[value]}
            </StatusLabel>
          </Menu.Item>
        ))}
        <Menu.Divider />
        <Menu.Item onClick={onShowClosed}>Ver encerradas</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function QueueRow({
  item,
  now,
  active,
  fresh,
  onOpen,
}: {
  item: QueueItem;
  now: number;
  active: boolean;
  fresh: boolean;
  onOpen: () => void;
}) {
  const statusLine = queueStatusLine({
    status: item.status,
    reason: item.reason,
    ticketCode: item.ticket?.code ?? null,
    assignedAnalystName: item.assignedAnalystName,
    isMine: item.isMine,
    agentConfidence: item.agentConfidence,
  });
  // Esperando analista, o canto mostra há quanto tempo (§7.4); senão, a hora da última mensagem.
  const corner = queueCornerText(item, now);
  // O prazo do chamado só entra na linha quando pede atenção (vencido ou vencendo).
  const slaState = item.ticket ? getSlaState(item.ticket, now) : null;
  const showSla = slaState === "overdue" || slaState === "due_soon";

  return (
    <Link
      href={`/console/${item._id}`}
      className={classes.queueItem}
      data-active={active || undefined}
      data-fresh={fresh || undefined}
      aria-current={active ? "page" : undefined}
      onClick={onOpen}
    >
      <span className={classes.queueAvatar}>
        <InitialsAvatar name={item.employeeName} size={44} />
      </span>
      <span className={classes.queueName}>{item.employeeName}</span>
      <span className={classes.queueTime} data-unread={item.unread > 0 || undefined}>
        {corner}
      </span>
      {/* Sem não lidas, a prévia ocupa também a coluna do contador (a do tempo de espera). */}
      <span className={classes.queuePreview} data-wide={item.unread === 0 || undefined}>
        {lastMessagePreview(item.lastMessage)}
      </span>
      {item.unread > 0 && (
        <span className={classes.unread} aria-label={`${item.unread} não lidas`}>
          {item.unread}
        </span>
      )}
      <span className={classes.queueMeta}>
        <StatusLabel tone={statusLine.tone} colorText={statusLine.colorText} truncate>
          {statusLine.text}
          {item.ticket && showSla && ` · ${formatSlaBadge(item.ticket, now)}`}
        </StatusLabel>
      </span>
    </Link>
  );
}

function QueueItemsSkeleton() {
  return (
    <Stack gap={0} aria-label="Carregando a fila">
      {[0, 1, 2].map((index) => (
        <div key={index} className={classes.queueItemSkeleton}>
          <Skeleton circle height={44} />
          <Stack gap={8} style={{ flex: 1 }}>
            <Skeleton height={12} width="50%" />
            <Skeleton height={10} width="85%" />
            <Skeleton height={10} width="40%" />
          </Stack>
        </div>
      ))}
    </Stack>
  );
}

export function QueueSkeleton() {
  return (
    <section className={classes.queue} aria-label="Fila de conversas">
      <div className={classes.queueHeader}>
        <h1 className={classes.queueTitle}>Conversas</h1>
      </div>
      <QueueItemsSkeleton />
    </section>
  );
}
