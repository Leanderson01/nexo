"use client";

import { Button } from "@mantine/core";
import type { FunctionReturnType } from "convex/server";

import type { MessagePart } from "@/domain/message-parts";
import type { ReceiptStatus } from "@/domain/read-receipts";
import { ListenButton } from "@/features/voice/listen-button";
import { speakableText } from "@/features/voice/speech";
import type { api } from "../../../convex/_generated/api";
import { formatTime } from "./blocks/block-texts";
import { QuickReplies } from "./blocks/quick-replies";
import { ReplyBubble } from "./blocks/reply-bubble";
import { LiveActionChips, ReplyHeader } from "./blocks/reply-header";
import { toReplySegments } from "./blocks/reply-segments";
import { TypingBubble } from "./blocks/typing-bubble";
import classes from "./chat.module.css";
import { analystLevelLabel } from "./chat-texts";
import { MessagePartView, type PartActions } from "./message-part-view";
import type { PendingMessage } from "./pending-messages";
import { ReadReceipt } from "./read-receipt";

export type ChatMessage = NonNullable<FunctionReturnType<typeof api.messages.list>>[number];

/** Uma mensagem do histórico, com o visual de quem escreveu (§7.2). */
export function MessageItem({
  message,
  actions,
  onShowDetails,
}: {
  message: ChatMessage;
  actions: PartActions;
  /** "Ver detalhes" dos chips: abre o painel de decisão (T8). */
  onShowDetails?: (decisionId: string) => void;
}) {
  switch (message.role) {
    case "user":
      return (
        <UserMessage
          text={joinText(message.parts)}
          createdAt={message.createdAt}
          receipt={message.receipt}
        />
      );
    case "assistant":
      return <AssistantMessage message={message} actions={actions} onShowDetails={onShowDetails} />;
    case "analyst":
      return <AnalystMessage message={message} actions={actions} />;
    case "system":
      return <SystemMessage message={message} actions={actions} />;
  }
}

function joinText(parts: MessagePart[]): string {
  return parts.map((part) => (part.type === "text" ? part.text : "")).join("");
}

/** Balão do funcionário com o horário e o ✓ embaixo (UX1); sem ✓ nas mensagens antigas. */
function UserMessage({
  text,
  createdAt,
  receipt,
}: {
  text: string;
  createdAt: number;
  receipt: ReceiptStatus | null;
}) {
  return (
    <div className={classes.userMessage}>
      <div className={classes.userBubble}>{text}</div>
      <div className={classes.userMeta}>
        {formatTime(createdAt)}
        {receipt && <ReadReceipt status={receipt} />}
      </div>
    </div>
  );
}

/**
 * A mensagem otimista (UX1): com o reloginho enquanto a rota não responde; se falhar, o erro
 * com "Tentar de novo" (quando adianta) e "Descartar".
 */
export function PendingUserMessage({
  pending,
  onRetry,
  onDiscard,
}: {
  pending: PendingMessage;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  if (!pending.failure) {
    return <UserMessage text={pending.text} createdAt={pending.sentAt} receipt="sending" />;
  }
  return (
    <div className={classes.userMessage}>
      <div className={classes.userBubble} data-failed>
        {pending.text}
      </div>
      <div className={classes.userMeta} data-tone="error" role="alert">
        <span>Não enviada. {pending.failure.message}</span>
        {pending.failure.retryable && (
          <Button size="compact-xs" variant="subtle" color="red" onClick={onRetry}>
            Tentar de novo
          </Button>
        )}
        <Button size="compact-xs" variant="subtle" color="gray" onClick={onDiscard}>
          Descartar
        </Button>
      </div>
    </div>
  );
}

/** O "digitando…" do agent na hora do envio, antes de a resposta em streaming existir. */
export function PendingAgentReply() {
  return (
    <div className={classes.reply}>
      <ReplyHeader author="Nexo Assist" />
      <TypingBubble />
    </div>
  );
}

function AssistantMessage({
  message,
  actions,
  onShowDetails,
}: {
  message: ChatMessage;
  actions: PartActions;
  onShowDetails?: (decisionId: string) => void;
}) {
  const isStreaming = message.status === "streaming";
  const hasText = message.parts.some((part) => part.type === "text" && part.text !== "");

  return (
    <div className={classes.reply}>
      <ReplyHeader author="Nexo Assist">
        {message.decisionId && !isStreaming && (
          <LiveActionChips
            messageId={message._id}
            decisionId={message.decisionId}
            onShowDetails={onShowDetails}
          />
        )}
        {!isStreaming && <ListenButton text={speakableText(message.parts)} />}
      </ReplyHeader>
      {isStreaming && !hasText && <TypingBubble />}
      <ReplyParts message={message} actions={actions} showCaret={isStreaming} />
    </div>
  );
}

function AnalystMessage({ message, actions }: { message: ChatMessage; actions: PartActions }) {
  return (
    <div className={classes.reply}>
      <ReplyHeader
        author={message.analyst?.name ?? "Analista"}
        badge={message.analyst ? analystLevelLabel(message.analyst.level) : null}
      />
      <ReplyParts message={message} actions={actions} analyst />
    </div>
  );
}

/** Texto (com as opções rápidas que vêm logo depois) em balão; os outros blocos soltos. */
function ReplyParts({
  message,
  actions,
  showCaret = false,
  analyst = false,
}: {
  message: ChatMessage;
  actions: PartActions;
  showCaret?: boolean;
  analyst?: boolean;
}) {
  const segments = toReplySegments(message.parts);
  return segments.map((segment, index) => {
    if (segment.kind === "block") {
      return (
        <MessagePartView
          key={index}
          part={segment.part}
          actions={actions}
          createdAt={message.createdAt}
        />
      );
    }
    if (segment.text === "" && !segment.quickReplies) return null;
    return (
      <ReplyBubble
        key={index}
        text={segment.text}
        analyst={analyst}
        showCaret={showCaret && index === segments.length - 1}
      >
        {segment.quickReplies && (
          <QuickReplies
            options={segment.quickReplies.options}
            chosenText={actions.chosenText}
            interactive={actions.interactive}
            onChoose={actions.onSend}
          />
        )}
      </ReplyBubble>
    );
  });
}

function SystemMessage({ message, actions }: { message: ChatMessage; actions: PartActions }) {
  return (
    <>
      {message.parts.map((part, index) => (
        <MessagePartView key={index} part={part} actions={actions} createdAt={message.createdAt} />
      ))}
    </>
  );
}
