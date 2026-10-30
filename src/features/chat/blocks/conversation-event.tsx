import type { ConversationEvent } from "@/domain/enums";
import type { UpdatedTicket } from "@/features/notifications/notification-texts";
import { conversationEventText } from "../chat-texts";
import { HeadsetIcon, ICON_SIZE, TransferIcon } from "@/shared/icons";
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
        {kind === "assigned" ? (
          <HeadsetIcon size={ICON_SIZE.sm} />
        ) : (
          <TransferIcon size={ICON_SIZE.sm} />
        )}
        {conversationEventText(kind, actorName, ticket)}
      </span>
    </div>
  );
}
