import type { DecisionRecord, ToolCallTrace } from "@/domain/decision-record";
import type { HandoffReason, PendingActionKind } from "@/domain/enums";
import type { MessagePart } from "@/domain/message-parts";
import type { SignalName } from "@/domain/signal-evidence";
import type { DuplicateAction } from "@/domain/ticket-rules";
import type { TicketCode, TicketSummary } from "@/domain/ticket";

// O que um turno vai juntando enquanto roda: as tools escrevem aqui (chamadas registradas,
// cards, opções, rascunho, transferência) e, no fim, o pipeline monta a resposta e o
// `DecisionRecord` a partir disto. Um objeto por turno, nunca compartilhado.

type ArticlePart = Extract<MessagePart, { type: "article" }>;
export type DerivedPriorityRecord = NonNullable<NonNullable<DecisionRecord["derived"]>["priority"]>;

/** O artigo mais relevante: vale, falta confirmar a condição ou não vale (e por quê). */
export interface TopArticle {
  part: ArticlePart;
  status: "applies" | "needs_confirmation" | "does_not_apply";
  appliesTo: string[];
  knownValue: string | null;
}

export class TurnWorkspace {
  /** Preenchido pelo `withTrace`, na ordem das chamadas. */
  readonly traces: ToolCallTrace[] = [];

  /** Chamados do funcionário, quando já foram consultados neste turno. */
  employeeTickets: TicketSummary[] | null = null;
  /** Chamado em foco resolvido entre ENTENDER e DECIDIR (decisão 2). */
  focusedTicket: TicketSummary | null = null;
  /** Chamado escolhido pelo agent neste turno (`selectTicket`); vira o novo foco. */
  selectedTicketCode: TicketCode | null = null;

  /** Parecidos do `findSimilarTickets` com a sugestão de cada um; `null` = não consultou. */
  similarTickets: Map<TicketCode, DuplicateAction> | null = null;
  /** Artigo que vale para o caso; vira card se a resposta se basear nele. */
  applicableArticle: ArticlePart | null = null;

  /** O artigo mais relevante tem condição ainda não confirmada: o turno pergunta antes (F1). */
  askedArticleCondition = false;
  /** A pergunta da condição (texto e opções definidos em código), quando o turno pergunta. */
  conditionQuestion: { question: string; options: string[] } | null = null;
  /** O artigo mais relevante da busca e se ele vale para o caso (o texto final depende disso). */
  topArticle: TopArticle | null = null;

  /** A CriticalPolicy mandou: o rascunho transfere ao confirmar ou cancelar. */
  criticalCase = false;
  draft: { pendingActionId: string; kind: PendingActionKind } | null = null;
  /** Campos do texto do rascunho trocados pela fala do funcionário (§11.2, sem invenção). */
  correctedDescriptionFields: string[] = [];
  derivedPriority: DerivedPriorityRecord | null = null;
  handoff: HandoffReason | null = null;
  /** O serviço de chamados falhou depois das tentativas: o turno termina com erro honesto. */
  legacyUnavailable = false;
  /** O rascunho foi recusado por falta de sinais: o AGIR para e a pergunta sai em código. */
  draftNeedsSignals = false;
  /**
   * A atualização dependia de um sinal que a fala não confirmou (mudaria a prioridade): o AGIR
   * para e a pergunta sai em código, citando o chamado.
   */
  updateNeedsSignal: { code: TicketCode; signal: SignalName } | null = null;

  private quickReplies: string[] | null = null;
  private readonly ticketCards: TicketCode[] = [];
  private selector: { codes: TicketCode[]; prompt: string } | null = null;

  showTicket(code: TicketCode): void {
    if (!this.ticketCards.includes(code)) this.ticketCards.push(code);
  }

  /** Mostra estas opções rápidas; uma nova chamada substitui a anterior. */
  offerQuickReplies(labels: string[]): void {
    this.quickReplies = labels;
  }

  /** As opções rápidas atuais, para a conferência depois do AGIR. */
  quickReplyLabels(): string[] | null {
    return this.quickReplies ? [...this.quickReplies] : null;
  }

  clearQuickReplies(): void {
    this.quickReplies = null;
  }

  /** O seletor de chamados está na resposta. */
  hasTicketSelector(): boolean {
    return this.selector !== null;
  }

  showTicketSelector(codes: TicketCode[], prompt: string): void {
    this.selector = { codes, prompt };
  }

  /** Códigos dos cards de chamado mostrados, na ordem. */
  shownTickets(): TicketCode[] {
    return [...this.ticketCards];
  }

  /** Partes estruturadas, gravadas depois do texto: cards, seletor, rascunho e opções. */
  structuredParts(options: { includeArticle: boolean }): MessagePart[] {
    const parts: MessagePart[] = [];
    if (options.includeArticle && this.applicableArticle) parts.push(this.applicableArticle);
    for (const code of this.ticketCards) parts.push({ type: "ticket", code });
    if (this.selector) parts.push({ type: "ticketSelector", ...this.selector });
    if (this.draft) parts.push({ type: "draft", pendingActionId: this.draft.pendingActionId });
    if (this.quickReplies) {
      parts.push({
        type: "quickReplies",
        options: this.quickReplies.map((label) => ({ label, value: label })),
      });
    }
    return parts;
  }
}
