"use client";

import { Avatar, Menu, Text, UnstyledButton } from "@mantine/core";
import { useQuery } from "convex/react";
import Link from "next/link";
import { Suspense } from "react";

import { NexoMark } from "@/features/auth/login/icons";
import { SignOutButton } from "@/features/auth/sign-out-button";
import { ChatBubbleIcon } from "@/features/chat/icons";
import { api } from "../../../convex/_generated/api";
import classes from "./console.module.css";
import { initials } from "./console-texts";
import { ConversationQueue, QueueSkeleton } from "./conversation-queue";
import { useFreshConversations } from "./use-fresh-conversations";

export const CONSOLE_PATH = "/console";

/**
 * Moldura do console (protótipo 05): trilho com o contador de quem espera, a fila e a área
 * da conversa. A fila "Para você" sem filtro alimenta o contador e o destaque das novas.
 */
export function ConsoleFrame({ children }: { children: React.ReactNode }) {
  const waiting = useQuery(api.console.listConversations, { tab: "for_you" });
  const waitingIds = waiting?.items.map((item) => item._id);
  const { fresh, markSeen, markAllSeen } = useFreshConversations(waitingIds);

  return (
    <div className={classes.shell}>
      <ConsoleRail waitingCount={waiting?.counts.for_you ?? 0} />
      {/* A fila lê o id da conversa aberta (useParams): com Cache Components, vai num Suspense. */}
      <Suspense fallback={<QueueSkeleton />}>
        <ConversationQueue fresh={fresh} onOpen={markSeen} onSeeFresh={markAllSeen} />
      </Suspense>
      <main className={classes.main}>{children}</main>
    </div>
  );
}

function ConsoleRail({ waitingCount }: { waitingCount: number }) {
  const person = useQuery(api.auth.currentPerson);

  return (
    <nav className={classes.rail} aria-label="Navegação do console">
      <span className={classes.railBrand}>
        <NexoMark />
      </span>
      <Link
        href={CONSOLE_PATH}
        className={classes.railItem}
        data-active
        aria-label={`Conversas: ${waitingCount} aguardando analista`}
      >
        <ChatBubbleIcon size={18} />
        {waitingCount > 0 && <span className={classes.railBadge}>{waitingCount}</span>}
      </Link>

      <div className={classes.railFooter}>
        <Menu position="right-end" withArrow>
          <Menu.Target>
            <UnstyledButton className={classes.avatarButton} aria-label="Sua conta">
              <Avatar size={30} radius="xl" color="blue">
                {person ? initials(person.name) : ""}
              </Avatar>
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>
              <Text size="sm" fw={600} c="dark.7">
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
      </div>
    </nav>
  );
}
