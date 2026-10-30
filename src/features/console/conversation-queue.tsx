"use client";

import { Avatar, Menu, Skeleton, Stack, TextInput, UnstyledButton } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { HANDOFF_REASONS, type ConsoleTab, type HandoffReason } from "@/domain/enums";
import { CONSOLE_TAB_LABELS, HANDOFF_REASON_LABELS } from "@/domain/labels";
import { formatSlaBadge } from "@/domain/sla";
import { DotLabel } from "@/features/chat/blocks/dot-label";
import { useNow } from "@/features/chat/blocks/use-now";
import { api } from "../../../convex/_generated/api";
import classes from "./console.module.css";
import {
  HANDOFF_REASON_COLORS,
  elapsedText,
  initials,
  lastMessagePreview,
  queueStatusLine,
} from "./console-texts";
import { FilterIcon, SearchIcon } from "./icons";

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

  const queue = useQuery(api.console.listConversations, {
    tab,
    reason: reason ?? undefined,
    search: debouncedSearch.trim() === "" ? undefined : debouncedSearch,
  });

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
          radius="md"
          placeholder="Pesquisar conversa ou chamado"
          aria-label="Pesquisar por funcionário, assunto ou código do chamado"
          leftSection={<SearchIcon size={14} />}
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
            <DotLabel color={HANDOFF_REASON_COLORS[reason]} colorText>
              {HANDOFF_REASON_LABELS[reason]}
            </DotLabel>
          )}
          <UnstyledButton
            fz={12}
            c="blue.7"
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
          c={reason ? "blue.7" : "gray.6"}
          style={{ display: "grid", placeItems: "center" }}
        >
          <FilterIcon size={14} />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Motivo da transferência</Menu.Label>
        <Menu.Item onClick={() => onReasonChange(null)}>Todos os motivos</Menu.Item>
        {HANDOFF_REASONS.map((value) => (
          <Menu.Item key={value} onClick={() => onReasonChange(value)}>
            <DotLabel color={HANDOFF_REASON_COLORS[value]}>{HANDOFF_REASON_LABELS[value]}</DotLabel>
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
  });
  // Quem espera mostra há quanto tempo; o resto, quando foi a última mensagem.
  const time = elapsedText(item.waitingSince ?? item.lastMessageAt, now);

  return (
    <Link
      href={`/console/${item._id}`}
      className={classes.queueItem}
      data-active={active || undefined}
      data-fresh={fresh || undefined}
      aria-current={active ? "page" : undefined}
      onClick={onOpen}
    >
      <Avatar
        className={classes.queueAvatar}
        size={36}
        radius="xl"
        color="initials"
        name={item.employeeName}
      >
        {initials(item.employeeName)}
      </Avatar>
      <span className={classes.queueName}>{item.employeeName}</span>
      <span className={classes.queueTime} data-unread={item.unread > 0 || undefined}>
        {time}
      </span>
      <span className={classes.queuePreview}>{lastMessagePreview(item.lastMessage)}</span>
      {item.unread > 0 ? (
        <span className={classes.unread} aria-label={`${item.unread} não lidas`}>
          {item.unread}
        </span>
      ) : (
        <span />
      )}
      <span className={classes.queueMeta}>
        <DotLabel color={statusLine.color} colorText>
          {statusLine.text}
        </DotLabel>
        {item.ticket && item.status !== "closed" && (
          <span className={classes.slaNote}>{formatSlaBadge(item.ticket, now)}</span>
        )}
      </span>
    </Link>
  );
}

function QueueItemsSkeleton() {
  return (
    <Stack gap="md" p={8} aria-label="Carregando a fila">
      {[0, 1, 2].map((index) => (
        <Stack key={index} gap={6}>
          <Skeleton height={12} width="50%" />
          <Skeleton height={10} width="85%" />
          <Skeleton height={10} width="40%" />
        </Stack>
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
