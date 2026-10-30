"use client";

import type { FunctionReturnType } from "convex/server";

import type { MessagePart } from "@/domain/message-parts";
import type { api } from "../../../convex/_generated/api";
import { QuickReplies } from "./blocks/quick-replies";
import { ReplyBubble } from "./blocks/reply-bubble";
import { LiveActionChips, ReplyHeader } from "./blocks/reply-header";
import { toReplySegments } from "./blocks/reply-segments";
import classes from "./chat.module.css";
import { analystLevelLabel } from "./chat-texts";
import { MessagePartView, type PartActions } from "./message-part-view";

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
      return <UserMessage parts={message.parts} />;
    case "assistant":
      return <AssistantMessage message={message} actions={actions} onShowDetails={onShowDetails} />;
    case "analyst":
      return <AnalystMessage message={message} actions={actions} />;
    case "system":
      return <SystemMessage message={message} actions={actions} />;
  }
}

function UserMessage({ parts }: { parts: MessagePart[] }) {
  const text = parts.map((part) => (part.type === "text" ? part.text : "")).join("");
  return <div className={classes.userBubble}>{text}</div>;
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
      </ReplyHeader>
      {isStreaming && !hasText && (
        <div className={classes.replyCard}>
          <TypingIndicator />
        </div>
      )}
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

function TypingIndicator() {
  return (
    <span className={classes.typing} role="status" aria-label="Nexo Assist está digitando">
      <span />
      <span />
      <span />
    </span>
  );
}
