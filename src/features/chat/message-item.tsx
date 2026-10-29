"use client";

import type { FunctionReturnType } from "convex/server";

import type { MessagePart } from "@/domain/message-parts";
import type { api } from "../../../convex/_generated/api";
import classes from "./chat.module.css";
import { analystLevelLabel } from "./chat-texts";
import { MessagePartView, type PartActions } from "./message-part-view";

export type ChatMessage = NonNullable<FunctionReturnType<typeof api.messages.list>>[number];

/** Uma mensagem do histórico, com o visual de quem escreveu (§7.2). */
export function MessageItem({ message, actions }: { message: ChatMessage; actions: PartActions }) {
  switch (message.role) {
    case "user":
      return <UserMessage parts={message.parts} />;
    case "assistant":
      return <AssistantMessage message={message} actions={actions} />;
    case "analyst":
      return <AnalystMessage message={message} actions={actions} />;
    case "system":
      return <SystemMessage parts={message.parts} actions={actions} />;
  }
}

function UserMessage({ parts }: { parts: MessagePart[] }) {
  const text = parts.map((part) => (part.type === "text" ? part.text : "")).join("");
  return <div className={classes.userBubble}>{text}</div>;
}

function AssistantMessage({ message, actions }: { message: ChatMessage; actions: PartActions }) {
  const isStreaming = message.status === "streaming";
  const hasText = message.parts.some((part) => part.type === "text" && part.text !== "");

  return (
    <div className={classes.reply}>
      <span className={classes.replyAuthor}>Nexo Assist</span>
      {isStreaming && !hasText && (
        <div className={classes.replyCard}>
          <TypingIndicator />
        </div>
      )}
      {message.parts.map((part, index) => (
        <ReplyPart
          key={index}
          part={part}
          actions={actions}
          showCaret={isStreaming && index === message.parts.length - 1}
        />
      ))}
    </div>
  );
}

function AnalystMessage({ message, actions }: { message: ChatMessage; actions: PartActions }) {
  const level = message.analyst ? analystLevelLabel(message.analyst.level) : null;
  const author = [message.analyst?.name ?? "Analista", level].filter(Boolean).join(" · ");

  return (
    <div className={classes.reply}>
      <span className={classes.replyAuthor}>{author}</span>
      {message.parts.map((part, index) => (
        <ReplyPart key={index} part={part} actions={actions} analyst />
      ))}
    </div>
  );
}

/** Texto vai dentro do balão; os outros blocos (cards, botões) ficam soltos abaixo dele. */
function ReplyPart({
  part,
  actions,
  showCaret = false,
  analyst = false,
}: {
  part: MessagePart;
  actions: PartActions;
  showCaret?: boolean;
  analyst?: boolean;
}) {
  if (part.type !== "text") return <MessagePartView part={part} actions={actions} />;

  return (
    <div className={analyst ? `${classes.replyCard} ${classes.analystCard}` : classes.replyCard}>
      <p className={classes.text}>
        {part.text}
        {showCaret && <span className={classes.caret} aria-hidden />}
      </p>
    </div>
  );
}

function SystemMessage({ parts, actions }: { parts: MessagePart[]; actions: PartActions }) {
  return (
    <>
      {parts.map((part, index) => (
        <MessagePartView key={index} part={part} actions={actions} />
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
