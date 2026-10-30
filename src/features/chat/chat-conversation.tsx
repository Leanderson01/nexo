"use client";

import { Alert, Button, Group, Skeleton, Stack, Text } from "@mantine/core";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useRef, type RefObject } from "react";

import { useSignedInQuery } from "@/features/auth/use-signed-in-query";
import { api } from "../../../convex/_generated/api";
import { DecisionPanelDrawer, useDecisionPanel } from "../decision-panel/decision-panel-drawer";
import { findChosenText } from "./blocks/reply-segments";
import { useBlockActions } from "./blocks/use-block-actions";
import classes from "./chat.module.css";
import { ChatHeader } from "./chat-header";
import { Composer } from "./composer";
import { canType, getComposerState } from "./composer-state";
import { DailyLimitNotice } from "./daily-limit-notice";
import { EmptyState } from "./empty-state";
import {
  MessageItem,
  PendingAgentReply,
  PendingUserMessage,
  type ChatMessage,
} from "./message-item";
import { countInFlight, isWaitingForAgent } from "./pending-messages";
import { useEmployeeDeliveryAcks, useEmployeeReceiptAcks } from "./use-employee-receipt-acks";
import { useRequestAnalyst } from "./use-chat-mutations";
import { useNewConversation } from "./use-new-conversation";
import { useSendMessage } from "./use-send-message";

/**
 * A tela do chat. Com `conversationId` null é a conversa nova: estado vazio, e o primeiro
 * envio cria a conversa. Tudo chega em tempo real pelas queries do Convex, inclusive o
 * texto do agent em streaming; recarregar no meio não perde nada.
 */
export function ChatConversation({ conversationId }: { conversationId: string | null }) {
  const args = conversationId ? { conversationId } : "skip";
  const conversation = useSignedInQuery(api.conversations.get, args);
  const messages = useSignedInQuery(api.messages.list, args);
  const newConversationLimit = useSignedInQuery(
    api.conversations.messageLimit,
    conversationId ? "skip" : {},
  );
  const person = useQuery(api.auth.currentPerson);

  const sender = useSendMessage(conversationId, messages ?? []);
  useEmployeeReceiptAcks(conversationId, messages);
  // As respostas das outras conversas também chegaram: o chat está aberto (✓✓ cinza).
  useEmployeeDeliveryAcks();
  const newConversation = useNewConversation();
  const requestAnalyst = useRequestAnalyst();
  // Confirmar, cancelar e editar o rascunho e o "Tentar de novo" do erro (§6.5).
  const blockActions = useBlockActions(conversationId);
  // "Ver detalhes" dos chips abre o painel de decisão daquela resposta (§7.3).
  const decisionPanel = useDecisionPanel();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const scroller = useStickToBottom(scrollerRef, messages, sender.pending.length);

  if (conversationId && (conversation === null || messages === null)) {
    return <ConversationNotFound />;
  }

  const isLoading =
    conversationId !== null && (conversation === undefined || messages === undefined);
  const status = conversation?.status ?? "agent";
  const messageLimit = conversation?.messageLimit ?? newConversationLimit ?? 30;
  // As mensagens a caminho já contam (UX1): no contador e, indo para o agent, como turno em
  // andamento, com o "digitando…" na hora.
  const waitingForAgent = isWaitingForAgent(sender.pending);
  const employeeMessageCount =
    (conversation?.employeeMessageCount ?? 0) + countInFlight(sender.pending);
  const composerState = getComposerState({
    status,
    agentBusy: (conversation?.agentBusy ?? false) || waitingForAgent,
    employeeMessageCount,
    messageLimit,
    // Na conversa nova o campo fica livre: o envio salva a mensagem e abre a conversa, que
    // então mostra o aviso com "Falar com um analista".
    dailyLimitReached: conversation?.dailyLimitReached ?? false,
  });
  const canSend = canType(composerState);

  function send(text: string) {
    scroller.stickToBottom();
    sender.send(text, composerState === "analyst" ? "analyst" : "agent");
  }

  const visibleMessages = messages ?? [];
  const lastMessageId = visibleMessages.at(-1)?._id;

  return (
    <>
      <ChatHeader status={status} analyst={conversation?.analyst ?? null} />

      <div className={classes.scroller} ref={scrollerRef} onScroll={scroller.onScroll}>
        <div className={classes.column}>
          {isLoading ? (
            <MessagesSkeleton />
          ) : visibleMessages.length === 0 && sender.pending.length === 0 ? (
            <EmptyState
              firstName={person?.name.split(" ")[0] ?? null}
              onSend={send}
              disabled={!canSend}
            />
          ) : (
            visibleMessages.map((message: ChatMessage, index) => (
              <MessageItem
                key={message._id}
                message={message}
                onShowDetails={decisionPanel.open}
                actions={{
                  onSend: send,
                  // Opções e seletor só valem na última mensagem (depois do uso, desabilitam).
                  interactive: canSend && message._id === lastMessageId,
                  chosenText: findChosenText(visibleMessages, index),
                  draft: blockActions.draft,
                  onRetry: blockActions.onRetry,
                }}
              />
            ))
          )}
          {sender.pending.map((pending) => (
            <PendingUserMessage
              key={pending.clientId}
              pending={pending}
              onRetry={() => {
                scroller.stickToBottom();
                sender.retry(pending);
              }}
              onDiscard={() => sender.discard(pending)}
            />
          ))}
          {waitingForAgent && <PendingAgentReply />}
        </div>
      </div>

      {blockActions.notice && (
        <Group className={classes.composerArea} pb={0}>
          <Alert
            color={NOTICE_COLORS[blockActions.notice.tone]}
            variant="light"
            w="100%"
            withCloseButton
            onClose={blockActions.dismissNotice}
          >
            <Text size="sm">{blockActions.notice.message}</Text>
          </Alert>
        </Group>
      )}
      {newConversation.error && (
        <Text size="xs" c="red.7" className={classes.composerArea} pb={4}>
          {newConversation.error}
        </Text>
      )}

      <Composer
        state={composerState}
        employeeMessageCount={employeeMessageCount}
        messageLimit={messageLimit}
        onSend={send}
        isCreatingConversation={newConversation.isCreating}
        onNewConversation={({ inheritSummary }) =>
          newConversation.startNewConversation({
            inheritSummaryFrom: inheritSummary && conversationId ? conversationId : undefined,
          })
        }
        onRequestAnalyst={
          conversationId && status === "agent"
            ? () => void requestAnalyst({ conversationId })
            : undefined
        }
      />

      <DailyLimitNotice {...newConversation.dailyLimitNotice} />
      <DecisionPanelDrawer decisionId={decisionPanel.decisionId} onClose={decisionPanel.close} />
    </>
  );
}

/** Erro em vermelho; limite ou recusa sem falha (nada quebrou) em âmbar, como o contador. */
const NOTICE_COLORS = { error: "red", warning: "orange" } as const;

/**
 * Mantém a rolagem no fim enquanto chegam mensagens e pedaços de texto, a menos que a
 * pessoa tenha subido para ler o histórico.
 */
function useStickToBottom(
  ref: RefObject<HTMLDivElement | null>,
  content: unknown,
  pendingCount: number,
) {
  const shouldStick = useRef(true);

  useEffect(() => {
    const element = ref.current;
    if (element && shouldStick.current) element.scrollTop = element.scrollHeight;
  }, [ref, content, pendingCount]);

  return {
    onScroll: () => {
      const element = ref.current;
      if (!element) return;
      const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
      shouldStick.current = distanceFromBottom < 80;
    },
    stickToBottom: () => {
      shouldStick.current = true;
    },
  };
}

/** Esqueleto da tela inteira, enquanto ainda não se sabe qual conversa abrir. */
export function ChatLoading() {
  return (
    <>
      <ChatHeader status={null} analyst={null} />
      <div className={classes.scroller}>
        <div className={classes.column}>
          <MessagesSkeleton />
        </div>
      </div>
    </>
  );
}

function MessagesSkeleton() {
  return (
    <Stack gap="lg" aria-label="Carregando a conversa">
      <Skeleton height={40} width="55%" ml="auto" radius="md" />
      <Stack gap={6}>
        <Skeleton height={12} width={90} />
        <Skeleton height={64} width="70%" radius="md" />
      </Stack>
      <Skeleton height={40} width="45%" ml="auto" radius="md" />
    </Stack>
  );
}

function ConversationNotFound() {
  return (
    <Stack align="center" gap="sm" py={96} ta="center">
      <Text fw={600}>Não encontramos essa conversa.</Text>
      <Text size="sm" c="dimmed">
        Ela pode ter sido removida ou não pertencer à sua conta.
      </Text>
      <Button component={Link} href="/chat" variant="default" size="xs">
        Voltar ao atendimento
      </Button>
    </Stack>
  );
}
