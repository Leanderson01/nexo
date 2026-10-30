"use client";

import { Avatar, NavLink, Skeleton, Stack, Text } from "@mantine/core";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

import { useSignedInQuery } from "@/features/auth/use-signed-in-query";
import { NexoMark } from "@/features/auth/login/icons";
import { SignOutButton } from "@/features/auth/sign-out-button";
import { ChatIcon, LogoutIcon, PlusIcon, UserIcon } from "@/shared/icons";
import { api } from "../../../convex/_generated/api";
import classes from "./chat.module.css";
import { activeNavItem, CHAT_PATH, PROFILE_PATH } from "./chat-navigation";
import { formatConversationDate } from "./chat-texts";
import { DailyLimitNotice } from "./daily-limit-notice";
import { useNewConversation } from "./use-new-conversation";

/** Navegação lateral do protótipo + histórico de conversas e "Nova conversa" (decisão 13). */
export function ChatSidebar() {
  return (
    <nav className={classes.sidebar} aria-label="Navegação">
      <NexoBrand />
      <ChatNavigation />
    </nav>
  );
}

export function NexoBrand() {
  return (
    <div className={classes.brand}>
      <span className={classes.brandMark}>
        <NexoMark size={18} />
      </span>
      Nexo Assist
    </div>
  );
}

const NAV_ITEM_CLASSES = {
  root: classes.navItem,
  label: classes.navItemLabel,
  section: classes.navItemSection,
};

/**
 * O conteúdo da navegação: telas, histórico, "Nova conversa", a pessoa e "Sair". A lateral
 * (a partir de 768 px) e a gaveta do celular (`MobileNavigation`) mostram o mesmo.
 */
export function ChatNavigation() {
  const activeItem = activeNavItem(usePathname());

  return (
    <>
      <NavLink
        component={Link}
        href={CHAT_PATH}
        label="Atendimento"
        leftSection={<ChatIcon />}
        active={activeItem === "attendance"}
        classNames={NAV_ITEM_CLASSES}
      />
      <NavLink
        component={Link}
        href={PROFILE_PATH}
        label="Meu perfil"
        leftSection={<UserIcon />}
        active={activeItem === "profile"}
        classNames={NAV_ITEM_CLASSES}
      />

      <ConversationHistory />
      <CurrentPerson />
    </>
  );
}

function ConversationHistory() {
  const conversations = useSignedInQuery(api.conversations.listMine, {});
  const params = useParams<{ conversationId?: string }>();
  const { startNewConversation, isCreating, error, dailyLimitNotice } = useNewConversation();

  return (
    <>
      <div className={classes.sectionTitle}>Conversas</div>
      <NavLink
        component="button"
        label="Nova conversa"
        leftSection={<PlusIcon />}
        disabled={isCreating}
        onClick={() => startNewConversation()}
        classNames={NAV_ITEM_CLASSES}
      />
      {error && (
        <Text size="xs" c="red.7" px={10} pb={6}>
          {error}
        </Text>
      )}
      <DailyLimitNotice {...dailyLimitNotice} />

      <div className={classes.history}>
        {conversations === undefined ? (
          <Stack gap={6}>
            <Skeleton height={40} />
            <Skeleton height={40} />
          </Stack>
        ) : conversations.length === 0 ? (
          <div className={classes.historyEmpty}>Suas conversas aparecem aqui.</div>
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
              <div className={classes.historyDate}>
                {formatConversationDate(conversation.lastMessageAt)}
                {conversation.status === "closed" && " · encerrada"}
              </div>
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
      {/* A pessoa leva ao "Meu perfil"; o "Sair" abaixo é que encerra a sessão. */}
      <Link href={PROFILE_PATH} className={classes.person} aria-label="Abrir meu perfil">
        <Avatar size={34} radius="xl" classNames={{ placeholder: classes.avatar }}>
          {person ? initials(person.name) : null}
        </Avatar>
        <div className={classes.personText}>
          <div className={classes.personName}>{person?.name ?? " "}</div>
          <div className={classes.personEmail}>{person?.email ?? " "}</div>
        </div>
      </Link>
      <SignOutButton
        variant="subtle"
        color="gray"
        leftSection={<LogoutIcon />}
        classNames={{
          root: classes.signOut,
          inner: classes.signOutInner,
          section: classes.signOutSection,
        }}
      />
    </div>
  );
}

function initials(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.at(-1)?.[0] ?? "")).toUpperCase();
}
