import type { DecisionRecord } from "@/domain/decision-record";
import type {
  ConversationStatus,
  HandoffReason,
  MessageRole,
  PendingActionStatus,
} from "@/domain/enums";
import type { MessagePart } from "@/domain/message-parts";
import type { PendingAction } from "@/domain/pending-action";
import type { NewTicket } from "@/domain/ticket";

import type { ObservedFinalState, ObservedReply, ObservedStep, ObservedTicket } from "./scenario";

// Puro: transforma o que o runner leu do Convex (`evalsSupport.observe`) no formato que
// `checkScenario` compara. Os tipos abaixo são o pedaço dos documentos que usamos; o retorno
// da query do Convex encaixa neles sem conversão.

export interface SnapshotMessage {
  _id: string;
  role: MessageRole;
  parts: MessagePart[];
  createdAt: number;
}

export type SnapshotDecision = DecisionRecord & {
  _id: string;
  _creationTime: number;
  conversationId: string;
  messageId: string;
};

export interface SnapshotPendingAction {
  _id: string;
  action: PendingAction;
  status: PendingActionStatus;
  createdAt: number;
}

export type SnapshotTicket = Pick<
  NewTicket,
  "kind" | "category" | "priority" | "title" | "description"
> & {
  code: string;
  reopenedFrom?: string;
  createdAt: number;
};

export interface ConversationSnapshot {
  conversation: {
    status: ConversationStatus;
    handoff?: { reason: HandoffReason };
    pendingActionId?: string;
  };
  messages: SnapshotMessage[];
  decisions: SnapshotDecision[];
  pendingActions: SnapshotPendingAction[];
  employeeTickets: SnapshotTicket[];
}

// ---------- Um passo ----------

/**
 * O que um passo produziu: todas as mensagens que não são do funcionário e que não existiam
 * antes do passo. A transferência grava o banner numa mensagem `system` separada da
 * resposta do agent, então as duas contam como "a resposta" do passo.
 */
export function newRepliesSince(
  messageIdsBefore: ReadonlySet<string>,
  after: ConversationSnapshot,
): SnapshotMessage[] {
  return after.messages
    .filter((message) => !messageIdsBefore.has(message._id) && message.role !== "user")
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function observeStep(
  messageIdsBefore: ReadonlySet<string>,
  after: ConversationSnapshot,
): ObservedStep {
  const replies = newRepliesSince(messageIdsBefore, after);
  return { reply: toObservedReply(replies), decision: decisionOf(replies, after.decisions) };
}

/** Partes `text` concatenadas (uma mensagem por parágrafo) e todas as partes, em ordem. */
export function toObservedReply(messages: SnapshotMessage[]): ObservedReply | null {
  if (messages.length === 0) return null;
  const text = messages
    .map((message) => textOf(message.parts))
    .filter((piece) => piece !== "")
    .join("\n\n");
  return { text, parts: messages.flatMap((message) => message.parts) };
}

function textOf(parts: MessagePart[]): string {
  return parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

/** O `DecisionRecord` ligado a uma das mensagens do passo (o último, se houver mais de um). */
function decisionOf(
  messages: SnapshotMessage[],
  decisions: SnapshotDecision[],
): DecisionRecord | null {
  const ids = new Set(messages.map((message) => message._id));
  const linked = decisions.filter((decision) => ids.has(decision.messageId));
  const last = linked.at(-1);
  return last ? toDecisionRecord(last) : null;
}

export function toDecisionRecord(row: SnapshotDecision): DecisionRecord {
  const { _id, _creationTime, conversationId, messageId, ...record } = row;
  void _id;
  void _creationTime;
  void conversationId;
  void messageId;
  return record;
}

// ---------- Fim do cenário ----------

export function observeFinalState(
  snapshot: ConversationSnapshot,
  ticketCodesBefore: ReadonlySet<string>,
): ObservedFinalState {
  return {
    conversationStatus: snapshot.conversation.status,
    handoffReason: snapshot.conversation.handoff?.reason ?? null,
    proposedAction: latestPendingAction(snapshot.pendingActions),
    ticketsCreated: snapshot.employeeTickets
      .filter((ticket) => !ticketCodesBefore.has(ticket.code))
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(toObservedTicket),
    storedTexts: storedTexts(snapshot),
  };
}

function latestPendingAction(rows: SnapshotPendingAction[]): ObservedFinalState["proposedAction"] {
  const latest = [...rows].sort((a, b) => a.createdAt - b.createdAt).at(-1);
  return latest ? { action: latest.action, status: latest.status } : null;
}

function toObservedTicket(ticket: SnapshotTicket): ObservedTicket {
  return {
    code: ticket.code,
    kind: ticket.kind,
    category: ticket.category,
    priority: ticket.priority,
    reopenedFrom: ticket.reopenedFrom,
    title: ticket.title,
    description: ticket.description,
  };
}

/** Tudo o que ficou gravado da conversa, em JSON: mensagens, decisões e rascunhos. */
function storedTexts(snapshot: ConversationSnapshot): string[] {
  return [
    ...snapshot.messages.map((message) => JSON.stringify(message.parts)),
    ...snapshot.decisions.map((decision) => JSON.stringify(toDecisionRecord(decision))),
    ...snapshot.pendingActions.map((row) => JSON.stringify(row.action)),
  ];
}

// ---------- Custo ----------

export interface UsageSummary {
  turns: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export const NO_USAGE: UsageSummary = { turns: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };

/** Soma tokens e custo estimado dos `DecisionRecord`s (um por turno do agent). */
export function sumUsage(decisions: Pick<DecisionRecord, "usage">[]): UsageSummary {
  return decisions.reduce(addDecisionUsage, NO_USAGE);
}

function addDecisionUsage(
  total: UsageSummary,
  decision: Pick<DecisionRecord, "usage">,
): UsageSummary {
  return {
    turns: total.turns + 1,
    inputTokens: total.inputTokens + decision.usage.inputTokens,
    outputTokens: total.outputTokens + decision.usage.outputTokens,
    costUsd: total.costUsd + decision.usage.estimatedCostUsd,
  };
}

export function addUsage(a: UsageSummary, b: UsageSummary): UsageSummary {
  return {
    turns: a.turns + b.turns,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    costUsd: a.costUsd + b.costUsd,
  };
}
