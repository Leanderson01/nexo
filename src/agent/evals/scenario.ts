import type { DecisionRecord } from "@/domain/decision-record";
import type {
  ConfidenceLevel,
  ConversationStatus,
  DecisionOutcome,
  HandoffReason,
  Intent,
  PendingActionStatus,
  Priority,
  TicketCategory,
  TicketKind,
  ToolCallStatus,
} from "@/domain/enums";
import type { MessagePart } from "@/domain/message-parts";
import type { PendingAction } from "@/domain/pending-action";
import type { Ticket, TicketCode } from "@/domain/ticket";

// Formato dos cenários de avaliação do agent (§13.2). Um cenário é uma especificação
// escrita como dados: quem fala, o que diz e o que precisa ser verdade depois de cada
// turno e no fim. O runner (T14b) executa os passos e entrega o que observou para
// `checkScenario`, que compara as duas coisas.

// ---------- Nomes que as expectativas citam ----------

/**
 * Nomes das políticas da §6.3, na ordem de avaliação. O `name` de cada `Policy` da T9
 * precisa ser exatamente um destes, senão as expectativas sobre políticas não casam.
 */
export const POLICY_NAMES = [
  "OutOfScopePolicy",
  "ExplicitHandoffPolicy",
  "CriticalPolicy",
  "OverdueTicketPolicy",
  "LowConfidencePolicy",
] as const;
export type PolicyName = (typeof POLICY_NAMES)[number];

/** Tools do agent (§6.4). O `tool` de cada `ToolCallTrace` da T10 usa estes nomes. */
export const TOOL_NAMES = [
  "searchKnowledgeBase",
  "listMyTickets",
  "getMyTicket",
  "findSimilarTickets",
  "proposeTicketDraft",
  "proposeTicketUpdate",
  "proposeReopen",
  "selectTicket",
  "requestHandoff",
  "offerQuickReplies",
  "showTicketSelector",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

/** Tools que gravam alguma coisa (rascunho ou estado da conversa). */
export const PROPOSAL_TOOLS: ToolName[] = [
  "proposeTicketDraft",
  "proposeTicketUpdate",
  "proposeReopen",
];

// ---------- Regras de texto ----------

/**
 * Uma regra sobre um texto. `description` diz, em português, o que o padrão detecta;
 * é ela que aparece na falha ("o texto não pode: manda reinstalar o cliente da VPN").
 */
export interface TextRule {
  description: string;
  pattern: RegExp;
}

export interface TextExpectation {
  /** Cada regra precisa casar com o texto da resposta. */
  mustMatch?: TextRule[];
  /** Nenhuma regra pode casar com o texto da resposta. */
  mustNotMatch?: TextRule[];
}

// ---------- Partes da resposta ----------

/** Descreve uma parte da resposta; só os campos informados são comparados. */
export type PartExpectation =
  | { type: "article"; slug?: string }
  | { type: "ticket"; code?: TicketCode }
  | { type: "ticketSelector"; includesCodes?: TicketCode[] }
  | { type: "draft" }
  /** `includesLabel`: alguma opção contém este texto (sem diferenciar maiúsculas). */
  | { type: "quickReplies"; includesLabel?: string }
  | { type: "handoff"; reason?: HandoffReason }
  | { type: "error"; retryable?: boolean };

export interface PartsExpectation {
  mustInclude?: PartExpectation[];
  mustNotInclude?: PartExpectation[];
}

// ---------- Expectativas de um turno ----------

/** Tool que precisa ter sido chamada no turno; `status` e `attempts` são opcionais. */
export interface ToolCallExpectation {
  tool: ToolName;
  status?: ToolCallStatus;
  attempts?: number;
}

/**
 * O que precisa ser verdade depois de um turno do agent, olhando o `DecisionRecord`
 * do turno e a mensagem de resposta. Campo ausente = não verificado.
 * Quando aceita uma lista (`outcome`, `intent`), qualquer valor da lista serve.
 */
export interface TurnExpectation {
  outcome?: DecisionOutcome | DecisionOutcome[];
  intent?: Intent | Intent[];
  confidenceLevel?: ConfidenceLevel;
  policiesTriggered?: PolicyName[];
  policiesNotTriggered?: PolicyName[];
  toolsCalled?: ToolCallExpectation[];
  toolsForbidden?: ToolName[];
  /** Curto-circuito: o turno não chamou nenhuma tool. */
  noToolCalls?: boolean;
  /** `derived.priority.value` do `DecisionRecord`. */
  priority?: Priority;
  parts?: PartsExpectation;
  text?: TextExpectation;
  /**
   * Privacidade: estes códigos não podem aparecer no texto, nas partes (cards e seletor)
   * nem na saída resumida de nenhuma tool do turno.
   */
  mustNotExpose?: TicketCode[];
}

// ---------- Passos ----------

/**
 * Um passo do roteiro. `message` é uma mensagem do funcionário; com `via: "quickReply"`
 * ela é o clique numa opção rápida (o chat envia o rótulo como texto), e o verificador
 * confere que a resposta anterior ofereceu essa opção. `confirmDraft` e `cancelDraft` são
 * os botões do card de rascunho: não passam pelo LLM nem geram `DecisionRecord`.
 */
export type ScenarioStep =
  | { kind: "message"; text: string; via: "typed" | "quickReply"; expect?: TurnExpectation }
  | { kind: "confirmDraft" }
  | { kind: "cancelDraft" }
  /** O analista devolve a conversa ao agent no console (§7.5), com a nota opcional. */
  | { kind: "returnToAgent"; note: string };

// ---------- Estado final ----------

/** Último rascunho proposto na conversa (a linha mais recente de `pendingActions`). */
export type ProposedActionExpectation = { status?: PendingActionStatus } & (
  | {
      kind: "create_ticket";
      ticketKind?: TicketKind;
      category?: TicketCategory;
      priority?: Priority;
      /** `null` = o rascunho não pode referenciar chamado antigo. */
      reopenedFrom?: TicketCode | null;
      descriptionMustMatch?: TextRule[];
      /** Fatos que a descrição não pode trazer (inventados: nada disso foi dito). */
      descriptionMustNotMatch?: TextRule[];
    }
  | { kind: "update_ticket"; code: TicketCode }
  | { kind: "reopen_ticket"; code: TicketCode }
);

export interface CreatedTicketExpectation {
  kind?: TicketKind;
  category?: TicketCategory;
  priority?: Priority;
  reopenedFrom?: TicketCode | null;
}

export interface FinalStateExpectation {
  conversationStatus?: ConversationStatus;
  /** `null` = a conversa não pode ter sido transferida. */
  handoffReason?: HandoffReason | null;
  /** `null` = nenhum rascunho foi proposto na conversa. */
  proposedAction?: ProposedActionExpectation | null;
  /** Chamados criados durante o cenário, na ordem; `[]` = nenhum. A contagem é exata. */
  ticketsCreated?: CreatedTicketExpectation[];
  /** Nada persistido (mensagens e `DecisionRecord`s) pode casar com estas regras. */
  storedDataMustNotMatch?: TextRule[];
}

// ---------- Cenário ----------

export interface ScenarioSetup {
  /** Variáveis do modo caos do serviço de chamados (§5.6), aplicadas só neste cenário. */
  env?: Partial<Record<"TICKETING_FAILURE_RATE" | "TICKETING_LATENCY_MS", string>>;
}

export interface Scenario {
  /** Estável e único; aparece na tabela do runner. */
  id: string;
  title: string;
  /** `spec`: um dos 13 da tabela da §13.2. `extra`: regra da spec que a tabela não cobre. */
  source: "spec" | "extra";
  /** Onde a regra está na spec ou no TASKS.md. */
  reference: string;
  /** E-mail do funcionário no seed. O cenário sempre começa numa conversa nova (decisão 1). */
  employeeEmail: string;
  /** Chamados do seed citados no cenário, separados pelo dono (conferido nos testes). */
  tickets: { ofEmployee: TicketCode[]; ofOthers: TicketCode[] };
  setup?: ScenarioSetup;
  steps: ScenarioStep[];
  final: FinalStateExpectation;
}

// ---------- O que o runner observa ----------

export interface ObservedReply {
  /** Texto final da mensagem do assistente (partes `text` concatenadas). */
  text: string;
  parts: MessagePart[];
}

/** Um item por passo, na mesma ordem de `scenario.steps`. */
export interface ObservedStep {
  /** `DecisionRecord` do turno; `null` nos botões de rascunho ou se nada foi registrado. */
  decision: DecisionRecord | null;
  /** Resposta gerada pelo passo; `null` se nenhuma mensagem do assistente apareceu. */
  reply: ObservedReply | null;
}

export type ObservedTicket = Pick<
  Ticket,
  "code" | "kind" | "category" | "priority" | "reopenedFrom" | "title" | "description"
>;

export interface ObservedFinalState {
  conversationStatus: ConversationStatus;
  handoffReason: HandoffReason | null;
  proposedAction: { action: PendingAction; status: PendingActionStatus } | null;
  ticketsCreated: ObservedTicket[];
  /** Textos persistidos: mensagens da conversa e `DecisionRecord`s em JSON. */
  storedTexts: string[];
}

export interface ObservedScenario {
  steps: ObservedStep[];
  final: ObservedFinalState;
}

// ---------- Atalhos para escrever passos ----------

export function say(text: string, expect?: TurnExpectation): ScenarioStep {
  return { kind: "message", text, via: "typed", expect };
}

export function pick(label: string, expect?: TurnExpectation): ScenarioStep {
  return { kind: "message", text: label, via: "quickReply", expect };
}

export function confirmDraft(): ScenarioStep {
  return { kind: "confirmDraft" };
}

export function cancelDraft(): ScenarioStep {
  return { kind: "cancelDraft" };
}

export function returnToAgent(note: string): ScenarioStep {
  return { kind: "returnToAgent", note };
}
