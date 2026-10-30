"use client";

import { Menu, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { NexoMark } from "@/features/auth/login/icons";
import { SignOutButton } from "@/features/auth/sign-out-button";
import { BellIcon, BellOffIcon, ChartIcon, ConversationsIcon, ICON_SIZE } from "@/shared/icons";
import { api } from "../../../convex/_generated/api";
import classes from "./console.module.css";
import { ConversationQueue, QueueSkeleton } from "./conversation-queue";
import { InitialsAvatar } from "./initials-avatar";
import { useFreshConversations } from "./use-fresh-conversations";
import { useQueueAlerts } from "./use-queue-alerts";

export const CONSOLE_PATH = "/console";
export const METRICS_PATH = "/console/metrics";

function isMetricsPath(pathname: string | null): boolean {
  return pathname?.startsWith(METRICS_PATH) ?? false;
}

/**
 * Moldura do console (protótipo 05): trilho com o contador de quem espera, a fila e a área
 * da conversa. A fila "Para você" sem filtro alimenta o contador, o destaque das novas, o
 * título da aba e o aviso sonoro (§11.6). No painel de métricas a fila sai e a área ocupa a
 * largura toda.
 */
export function ConsoleFrame({ children }: { children: React.ReactNode }) {
  const waiting = useQuery(api.console.listConversations, { tab: "for_you" });
  const waitingIds = waiting?.items.map((item) => item._id);
  const waitingCount = waiting?.counts.for_you ?? 0;
  const { fresh, markSeen, markAllSeen } = useFreshConversations(waitingIds);
  const { soundOn, toggleSound } = useQueueAlerts(waitingIds, waitingCount);

  return (
    <div className={classes.shell}>
      <nav className={classes.rail} aria-label="Navegação do console">
        <span className={classes.railBrand}>
          <NexoMark size={22} />
        </span>
        {/* O trilho e a fila leem a rota (usePathname/useParams): com Cache Components, vão num Suspense. */}
        <Suspense fallback={<RailLinks waitingCount={waitingCount} pathname={null} />}>
          <CurrentRailLinks waitingCount={waitingCount} />
        </Suspense>
        <div className={classes.railFooter}>
          <SoundToggle on={soundOn} onToggle={toggleSound} />
          <AccountMenu />
        </div>
      </nav>
      <Suspense fallback={<QueueSkeleton />}>
        <QueueColumn fresh={fresh} onOpen={markSeen} onSeeFresh={markAllSeen} />
      </Suspense>
      <main className={classes.main}>{children}</main>
    </div>
  );
}

function QueueColumn(props: React.ComponentProps<typeof ConversationQueue>) {
  const pathname = usePathname();
  return isMetricsPath(pathname) ? null : <ConversationQueue {...props} />;
}

function CurrentRailLinks({ waitingCount }: { waitingCount: number }) {
  return <RailLinks waitingCount={waitingCount} pathname={usePathname()} />;
}

function RailLinks({ waitingCount, pathname }: { waitingCount: number; pathname: string | null }) {
  const onMetrics = isMetricsPath(pathname);
  return (
    <>
      <Tooltip label="Conversas" position="right" withArrow>
        <Link
          href={CONSOLE_PATH}
          className={classes.railItem}
          data-active={pathname !== null && !onMetrics ? true : undefined}
          aria-label={`Conversas: ${waitingCount} aguardando analista`}
        >
          <ConversationsIcon size={ICON_SIZE.lg} />
          {waitingCount > 0 && <span className={classes.railBadge}>{waitingCount}</span>}
        </Link>
      </Tooltip>
      <Tooltip label="Métricas" position="right" withArrow>
        <Link
          href={METRICS_PATH}
          className={classes.railItem}
          data-active={onMetrics ? true : undefined}
          aria-label="Métricas do atendimento"
        >
          <ChartIcon size={ICON_SIZE.lg} />
        </Link>
      </Tooltip>
    </>
  );
}

/** Liga e desliga o aviso sonoro de conversa nova na fila (lembrado neste navegador). */
function SoundToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const label = on ? "Desligar o som de conversa nova" : "Ligar o som de conversa nova";
  return (
    <Tooltip label={label} position="right" withArrow>
      <UnstyledButton
        className={classes.railItem}
        data-on={on || undefined}
        onClick={onToggle}
        aria-label={label}
        aria-pressed={on}
      >
        {on ? <BellIcon size={ICON_SIZE.lg} /> : <BellOffIcon size={ICON_SIZE.lg} />}
      </UnstyledButton>
    </Tooltip>
  );
}

function AccountMenu() {
  const person = useQuery(api.auth.currentPerson);

  return (
    <Menu position="right-end" withArrow>
      <Menu.Target>
        <UnstyledButton className={classes.avatarButton} aria-label="Sua conta">
          {/* O analista sempre no azul da marca; o ponto verde repete o "Disponível" da fila. */}
          <InitialsAvatar name={person?.name ?? ""} size={32} colorIndex={0} />
          <span className={classes.onlineDot} aria-hidden />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>
          <Text size="sm" fw={600} c="var(--nexo-color-text)">
            {person?.name}
          </Text>
          <Text size="xs" c="dimmed">
            {person?.level ? `Suporte ${person.level}` : "Analista"}
          </Text>
        </Menu.Label>
        <Menu.Divider />
        <div style={{ padding: 6 }}>
          <SignOutButton fullWidth />
        </div>
      </Menu.Dropdown>
    </Menu>
  );
}
