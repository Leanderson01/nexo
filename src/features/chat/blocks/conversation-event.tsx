import type { ConversationEvent } from "@/domain/enums";
import type { UpdatedTicket } from "@/features/notifications/notification-texts";
import { conversationEventText } from "../chat-texts";
import { ArrowsSwapIcon, HeadsetIcon } from "../icons";
import classes from "./blocks.module.css";

/** Linha de evento entre as mensagens: "Ana Ribeiro (Suporte N1) assumiu a conversa". */
export function ConversationEventLine({
  kind,
  actorName,
  ticket,
}: {
  kind: ConversationEvent;
  actorName?: string;
  /** Só em `ticket_updated`: o chamado que o suporte atualizou (T17). */
  ticket?: UpdatedTicket;
}) {
  return (
    <div className={classes.event} role="note">
      <span className={classes.eventContent}>
        {kind === "assigned" ? <HeadsetIcon size={12} /> : <ArrowsSwapIcon size={12} />}
        {conversationEventText(kind, actorName, ticket)}
      </span>
    </div>
  );
}
