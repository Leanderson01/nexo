"use client";

import type { MessagePart } from "@/domain/message-parts";
import { ArticleCard } from "./blocks/article-card";
import { ConversationEventLine } from "./blocks/conversation-event";
import { LiveDraftCard, type DraftCallbacks } from "./blocks/draft-card";
import { ErrorBlock } from "./blocks/error-block";
import { HandoffBanner } from "./blocks/handoff-banner";
import { QuickReplies } from "./blocks/quick-replies";
import { ReplyBubble } from "./blocks/reply-bubble";
import { LiveTicketCard } from "./blocks/ticket-card";
import { LiveTicketSelector } from "./blocks/ticket-selector";

// Um bloco por `type` de MessagePart (§7.2). Os componentes ficam em ./blocks.

export interface PartActions {
  /** Envia um texto como mensagem do funcionário (opções rápidas, seletor). */
  onSend: (text: string) => void;
  /** Falso quando o bloco já foi usado ou o campo está bloqueado. */
  interactive: boolean;
  /** O que o funcionário mandou logo depois desta mensagem: marca a opção escolhida. */
  chosenText: string | null;
  /** Botões do card de rascunho (a T11 liga às rotas). */
  draft: DraftCallbacks;
  /** "Tentar de novo" do erro (a T11 liga à rota de retry). */
  onRetry: () => void;
}

export function MessagePartView({
  part,
  actions,
  createdAt,
}: {
  part: MessagePart;
  actions: PartActions;
  /** Quando a mensagem foi criada: o banner de fora do horário diz quando o atendimento volta. */
  createdAt: number;
}) {
  switch (part.type) {
    case "text":
      return <ReplyBubble text={part.text} />;
    case "article":
      return <ArticleCard title={part.title} excerpt={part.excerpt} />;
    case "ticket":
      return <LiveTicketCard code={part.code} />;
    case "ticketSelector":
      return (
        <>
          <ReplyBubble text={part.prompt} />
          <LiveTicketSelector
            codes={part.codes}
            prompt={part.prompt}
            chosenText={actions.chosenText}
            interactive={actions.interactive}
            onChoose={actions.onSend}
          />
        </>
      );
    case "draft":
      return <LiveDraftCard pendingActionId={part.pendingActionId} callbacks={actions.draft} />;
    case "quickReplies":
      return (
        <QuickReplies
          options={part.options}
          chosenText={actions.chosenText}
          interactive={actions.interactive}
          onChoose={actions.onSend}
        />
      );
    case "handoff":
      return (
        <HandoffBanner
          reason={part.reason}
          outOfHours={part.outOfHours}
          transferredAt={createdAt}
        />
      );
    case "event":
      return <ConversationEventLine kind={part.kind} actorName={part.actorName} />;
    case "error":
      return (
        <ErrorBlock message={part.message} retryable={part.retryable} onRetry={actions.onRetry} />
      );
  }
}
