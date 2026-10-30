"use client";

import { Avatar, Button, Group, NavLink, Skeleton, Stack, Text } from "@mantine/core";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

import { useSignedInQuery } from "@/features/auth/use-signed-in-query";
import { NexoMark } from "@/features/auth/login/icons";
import { SignOutButton } from "@/features/auth/sign-out-button";
import { api } from "../../../convex/_generated/api";
import classes from "./chat.module.css";
import { activeNavItem, CHAT_PATH, PROFILE_PATH } from "./chat-navigation";
import { formatConversationDate } from "./chat-texts";
import { ChatBubbleIcon, PlusIcon, UserIcon } from "./icons";
import { useNewConversation } from "./use-new-conversation";

/** Navegação lateral do protótipo + histórico de conversas e "Nova conversa" (decisão 13). */
export function ChatSidebar() {
  const activeItem = activeNavItem(usePathname());

  return (
    <nav className={classes.sidebar} aria-label="Navegação">
      <div className={classes.brand}>
        <span className={classes.brandMark}>
          <NexoMark />
        </span>
        Nexo Assist
      </div>

      <NavLink
        component={Link}
        href={CHAT_PATH}
        label="Atendimento"
        leftSection={<ChatBubbleIcon size={15} />}
        active={activeItem === "attendance"}
      />
      <NavLink
        component={Link}
        href={PROFILE_PATH}
        label="Meu perfil"
        leftSection={<UserIcon size={15} />}
        active={activeItem === "profile"}
      />

      <ConversationHistory />
      <CurrentPerson />
    </nav>
  );
}

function ConversationHistory() {
  const conversations = useSignedInQuery(api.conversations.listMine, {});
  const params = useParams<{ conversationId?: string }>();
  const { startNewConversation, isCreating, error } = useNewConversation();

  return (
    <>
      <div className={classes.sectionTitle}>Conversas</div>
      <Button
        variant="light"
        size="xs"
        mx={8}
        mb={6}
        leftSection={<PlusIcon size={14} />}
        loading={isCreating}
        onClick={() => startNewConversation()}
      >
        Nova conversa
      </Button>
      {error && (
        <Text size="xs" c="red.7" px={8} pb={6}>
          {error}
        </Text>
      )}

      <div className={classes.history}>
        {conversations === undefined ? (
          <Stack gap={6} px={8}>
            <Skeleton height={34} />
            <Skeleton height={34} />
          </Stack>
        ) : conversations.length === 0 ? (
          <Text size="xs" c="dimmed" px={8}>
            Suas conversas aparecem aqui.
          </Text>
        ) : (
          conversations.map((conversation) => (
            <Link
              key={conversation._id}
              href={`/chat/${conversation._id}`}
              className={classes.historyItem}
              data-active={params.conversationId === conversation._id || undefined}
            >
              <div className={classes.historySubject}>
                {conversation.subject ?? "Conversa nova"}
              </div>
              <Text size="xs" c="dimmed">
                {formatConversationDate(conversation.lastMessageAt)}
                {conversation.status === "closed" && " · encerrada"}
              </Text>
            </Link>
          ))
        )}
      </div>
    </>
  );
}

function CurrentPerson() {
  const person = useQuery(api.auth.currentPerson);

  return (
    <div className={classes.sidebarFooter}>
      <Group gap={8} wrap="nowrap" mb={8}>
        <Avatar size={30} radius="xl" color="blue">
          {person ? initials(person.name) : null}
        </Avatar>
        <div style={{ minWidth: 0 }}>
          <Text size="sm" fw={600} truncate>
            {person?.name ?? " "}
          </Text>
          <Text size="xs" c="dimmed" truncate>
            {person?.email ?? " "}
          </Text>
        </div>
      </Group>
      <SignOutButton variant="subtle" color="gray" fullWidth justify="flex-start" />
    </div>
  );
}

function initials(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.at(-1)?.[0] ?? "")).toUpperCase();
}
