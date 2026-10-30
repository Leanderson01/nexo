import type { ConversationEvent } from "@/domain/enums";
import { conversationEventText } from "../chat-texts";
import { ArrowsSwapIcon, HeadsetIcon } from "../icons";
import classes from "./blocks.module.css";

/** Linha de evento entre as mensagens: "Ana Ribeiro (Suporte N1) assumiu a conversa". */
export function ConversationEventLine({
  kind,
  actorName,
}: {
  kind: ConversationEvent;
  actorName?: string;
}) {
  return (
    <div className={classes.event} role="note">
      <span className={classes.eventContent}>
        {kind === "assigned" ? <HeadsetIcon size={12} /> : <ArrowsSwapIcon size={12} />}
        {conversationEventText(kind, actorName)}
      </span>
    </div>
  );
}
