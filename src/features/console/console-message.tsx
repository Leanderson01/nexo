"use client";

import type { FunctionReturnType } from "convex/server";

import type { ConversationEvent } from "@/domain/enums";
import { HANDOFF_REASON_LABELS } from "@/domain/labels";
import type { MessagePart } from "@/domain/message-parts";
import { formatTime } from "@/features/chat/blocks/block-texts";
import { QuickReplies } from "@/features/chat/blocks/quick-replies";
import { LiveActionChips } from "@/features/chat/blocks/reply-header";
import { toReplySegments } from "@/features/chat/blocks/reply-segments";
import { TypingBubble } from "@/features/chat/blocks/typing-bubble";
import { ArrowsSwapIcon, HeadsetIcon } from "@/features/chat/icons";
import { MessagePartView, type PartActions } from "@/features/chat/message-part-view";
import type { api } from "../../../convex/_generated/api";
import classes from "./console.module.css";
import { analystLevelText, consoleEventText } from "./console-texts";

export type ConsoleMessage = NonNullable<
  FunctionReturnType<typeof api.console.listMessages>
>[number];

/** No console, os blocos são só leitura: nada de enviar opção, confirmar ou tentar de novo. */
const READ_ONLY_ACTIONS: Omit<PartActions, "chosenText"> = {
  onSend: () => {},
  interactive: false,
  draft: { onConfirm: () => {}, onCancel: () => {}, onSaveEdit: () => {} },
  onRetry: () => {},
};

/**
 * Uma mensagem do histórico, do ponto de vista do analista (protótipos 05 e 06): funcionário
 * à esquerda; agent em azul e analista em verde, à direita; eventos centralizados.
 */
export function ConsoleMessageItem({
  message,
  chosenText,
  onShowDetails,
}: {
  message: ConsoleMessage;
  /** O que o funcionário respondeu depois: marca a opção escolhida nos blocos. */
  chosenText: string | null;
  /** "Ver detalhes" de uma resposta do agent: abre o painel de decisão. */
  onShowDetails: (decisionId: string) => void;
}) {
  switch (message.role) {
    case "user":
      return (
        <div className={classes.employeeRow}>
          <TextBubble text={joinText(message.parts)} createdAt={message.createdAt} />
        </div>
      );
    case "assistant":
      return (
        <div className={classes.replyRow}>
          <div className={classes.replyAuthor}>
            Nexo Assist <span className={classes.iaBadge}>IA</span>
            {message.decisionId && message.status !== "streaming" && (
              <LiveActionChips
                messageId={message._id}
                decisionId={message.decisionId}
                onShowDetails={onShowDetails}
              />
            )}
          </div>
          {message.status === "streaming" && joinText(message.parts) === "" && <TypingBubble />}
          <ReplyParts message={message} author="agent" chosenText={chosenText} />
        </div>
      );
    case "analyst":
      return (
        <div className={classes.replyRow}>
          <div className={classes.replyAuthor}>
            {message.analyst?.name ?? "Analista"}
            {message.analyst && (
              <span className={classes.levelBadge}>{analystLevelText(message.analyst.level)}</span>
            )}
          </div>
          <ReplyParts message={message} author="analyst" chosenText={chosenText} />
        </div>
      );
    case "system":
      return (
        <>
          {message.parts.map((part, index) => (
            <SystemLine key={index} part={part} createdAt={message.createdAt} />
          ))}
        </>
      );
  }
}

function joinText(parts: MessagePart[]): string {
  return parts.map((part) => (part.type === "text" ? part.text : "")).join("");
}

function TextBubble({
  text,
  createdAt,
  author,
  children,
}: {
  text: string;
  createdAt: number;
  author?: "agent" | "analyst";
  children?: React.ReactNode;
}) {
  return (
    <div className={classes.bubble} data-author={author}>
      {text}
      {children}
      <span className={classes.bubbleTime}>{formatTime(createdAt)}</span>
    </div>
  );
}

function ReplyParts({
  message,
  author,
  chosenText,
}: {
  message: ConsoleMessage;
  author: "agent" | "analyst";
  chosenText: string | null;
}) {
  const actions: PartActions = { ...READ_ONLY_ACTIONS, chosenText };
  return toReplySegments(message.parts).map((segment, index) => {
    if (segment.kind === "block") {
      return (
        // `disabled` desliga os botões dos cards (rascunho, seletor) sem mexer nos blocos.
        <fieldset key={index} className={classes.blocks} disabled>
          <MessagePartView part={segment.part} actions={actions} createdAt={message.createdAt} />
        </fieldset>
      );
    }
    if (segment.text === "" && !segment.quickReplies) return null;
    return (
      <TextBubble key={index} text={segment.text} createdAt={message.createdAt} author={author}>
        {segment.quickReplies && (
          <QuickReplies
            options={segment.quickReplies.options}
            chosenText={chosenText}
            interactive={false}
            onChoose={() => {}}
          />
        )}
      </TextBubble>
    );
  });
}

/** Transferência e eventos, centralizados com o horário ("Ana Ribeiro assumiu · 10:12"). */
function SystemLine({ part, createdAt }: { part: MessagePart; createdAt: number }) {
  if (part.type === "handoff") {
    return (
      <EventLine icon={<ArrowsSwapIcon size={12} />}>
        Transferida para analista · {HANDOFF_REASON_LABELS[part.reason]}
        {part.outOfHours && " · fora do horário"} · {formatTime(createdAt)}
      </EventLine>
    );
  }
  if (part.type === "event") {
    // A linha da transferência já sai do bloco `handoff` acima.
    if (part.kind === "transferred") return null;
    return (
      <EventLine icon={eventIcon(part.kind)}>
        {consoleEventText(part.kind, part.actorName, {
          code: part.ticketCode,
          status: part.ticketStatus,
        })}{" "}
        · {formatTime(createdAt)}
      </EventLine>
    );
  }
  return null;
}

function eventIcon(kind: ConversationEvent) {
  return kind === "assigned" ? <HeadsetIcon size={12} /> : <ArrowsSwapIcon size={12} />;
}

function EventLine({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={classes.event} role="note">
      <span className={classes.eventContent}>
        {icon}
        {children}
      </span>
    </div>
  );
}
