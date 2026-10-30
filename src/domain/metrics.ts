import { normalizeText } from "../shared/normalize-text";
import {
  HANDOFF_REASONS,
  REPLY_CORRECTION_RULES,
  type HandoffReason,
  type MessageRole,
  type MetricsPeriod,
  type PendingActionKind,
  type PendingActionStatus,
  type ReplyCorrectionRule,
} from "./enums";
import { startOfLocalDay } from "./local-day";
import type { MessagePart } from "./message-parts";

// Métricas do painel do console (§7.6, métricas de sucesso da §1). Funções puras: a query
// `metrics.dashboard` lê o banco, monta um `MetricsConversation` por conversa e chama
// `computeMetrics`.
//
// Base de tudo: as conversas **iniciadas no período**, com todos os turnos delas (mesmo os que
// caíram depois do fim do período). Uma regra só, para os números baterem entre si.
//
// Conversa atendida: teve ao menos um turno do agent (uma decisão) ou foi transferida. Conversa
// aberta e abandonada antes da primeira resposta não entra em nenhuma taxa.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Início do período: "hoje" começa à meia-noite de São Paulo; os outros contam dias corridos. */
export function periodStart(period: MetricsPeriod, now: number): number {
  switch (period) {
    case "today":
      return startOfLocalDay(now);
    case "7d":
      return now - 7 * DAY_MS;
    case "30d":
      return now - 30 * DAY_MS;
  }
}

// ---------- Entrada ----------

/** O que importa de um turno do agent (uma linha de `decisions`). */
export interface MetricsDecision {
  /** Nulo quando o turno falhou antes de entender a mensagem. */
  confidence: number | null;
  costUsd: number;
  /** Do envio da mensagem ao fim da resposta (`usage.latencyMs`). */
  latencyMs: number;
  shortCircuit: boolean;
  corrections: ReplyCorrectionRule[];
}

/** Um rascunho proposto (uma linha de `pendingActions`). */
export interface MetricsDraft {
  kind: PendingActionKind;
  status: PendingActionStatus;
}

export interface MetricsConversation {
  /** Motivo da última transferência; null se a conversa nunca foi para um analista. */
  handoffReason: HandoffReason | null;
  /**
   * O motivo de cada transferência da conversa, em ordem (uma conversa devolvida ao agent pode
   * ser transferida de novo). Vem das partes `handoff` do histórico (`transferReasons`); vazio
   * ou ausente com `handoffReason` preenchido, conta a última uma vez.
   */
  transfers?: HandoffReason[];
  decisions: MetricsDecision[];
  drafts: MetricsDraft[];
  /** O funcionário respondeu "Sim" ao "Isso resolveu?" de um artigo (ver `confirmedArticle`). */
  articleConfirmed: boolean;
}

/** Mensagem do histórico, só com o que `confirmedArticle` lê. */
export interface MetricsMessage {
  role: MessageRole;
  parts: MessagePart[];
}

// ---------- Regras por conversa ----------

/**
 * O funcionário confirmou que um artigo resolveu: uma resposta do agent com card de artigo
 * seguida de uma mensagem do funcionário que começa com "sim" ("Sim", "Sim, resolveu").
 * As opções "Sim"/"Não" do "Isso resolveu?" são fixas em código (T10b).
 */
export function confirmedArticle(messages: MetricsMessage[]): boolean {
  let lastAgentShowedArticle = false;
  for (const message of messages) {
    if (message.role === "assistant") {
      lastAgentShowedArticle = message.parts.some((part) => part.type === "article");
    } else if (message.role === "user") {
      if (lastAgentShowedArticle && startsWithYes(message.parts)) return true;
      lastAgentShowedArticle = false;
    }
  }
  return false;
}

/**
 * O motivo de cada transferência registrada no histórico: toda transferência grava uma parte
 * `handoff` com o motivo (convex/lib/handoff.ts).
 */
export function transferReasons(messages: MetricsMessage[]): HandoffReason[] {
  return messages.flatMap((message) =>
    message.parts.flatMap((part) => (part.type === "handoff" ? [part.reason] : [])),
  );
}

/** As transferências que contam para a conversa; sem histórico delas, a última, uma vez. */
function conversationTransfers(conversation: MetricsConversation): HandoffReason[] {
  if (conversation.transfers && conversation.transfers.length > 0) return conversation.transfers;
  return conversation.handoffReason === null ? [] : [conversation.handoffReason];
}

function startsWithYes(parts: MessagePart[]): boolean {
  const text = parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join(" ")
    .trim();
  return /^sim\b/.test(normalizeText(text));
}

/** Um chamado novo saiu desta conversa: rascunho de criação confirmado. */
export function createdTicket(conversation: MetricsConversation): boolean {
  return conversation.drafts.some(
    (draft) => draft.kind === "create_ticket" && draft.status === "confirmed",
  );
}

export function wasAttended(conversation: MetricsConversation): boolean {
  return conversation.decisions.length > 0 || conversation.handoffReason !== null;
}

/**
 * Resolvida sem fila (§7.6, ao pé da letra): sem transferência e sem chamado criado, **ou**
 * com um artigo confirmado pelo funcionário ("Sim, resolveu").
 */
export function resolvedWithoutQueue(conversation: MetricsConversation): boolean {
  const noQueue = conversation.handoffReason === null && !createdTicket(conversation);
  return noQueue || conversation.articleConfirmed;
}

/**
 * Rascunho que conta: os substituídos por um rascunho mais novo na mesma conversa ficam de
 * fora, senão uma proposta refeita contaria duas vezes.
 */
function countsAsProposal(draft: MetricsDraft): boolean {
  return draft.status !== "superseded";
}

/** Duplicado evitado: proposta de atualizar ou reabrir um chamado, em vez de criar outro. */
function avoidsDuplicate(draft: MetricsDraft): boolean {
  return draft.kind === "update_ticket" || draft.kind === "reopen_ticket";
}

// ---------- Painel ----------

export interface DashboardMetrics {
  /** Conversas atendidas: a base das taxas e do custo por conversa. */
  conversations: number;
  resolvedWithoutQueue: { count: number; rate: number | null };
  /** Rascunhos que contam (não substituídos) e, deles, os que atualizam ou reabrem. */
  drafts: { total: number; duplicatesAvoided: number; ticketsCreated: number };
  /**
   * Cada transferência conta (uma conversa transferida duas vezes soma 2 em `total` e no
   * motivo de cada uma); `conversations` é quantas conversas foram transferidas ao menos uma vez.
   */
  handoffs: { total: number; conversations: number; byReason: Record<HandoffReason, number> };
  /** Turnos do agent no período (linhas de `decisions`). */
  turns: number;
  /** Média de 0 a 1 dos turnos que entenderam a mensagem; null sem nenhum. */
  averageConfidence: number | null;
  totalCostUsd: number;
  /** Custo total dividido pelas conversas com ao menos um turno; null sem nenhuma. */
  averageCostPerConversationUsd: number | null;
  /** Média da latência de todos os turnos; null sem nenhum. */
  averageResponseMs: number | null;
  shortCircuits: number;
  correctionsByRule: Record<ReplyCorrectionRule, number>;
}

export function computeMetrics(all: MetricsConversation[]): DashboardMetrics {
  const conversations = all.filter(wasAttended);
  const decisions = conversations.flatMap((conversation) => conversation.decisions);
  const drafts = conversations
    .flatMap((conversation) => conversation.drafts)
    .filter(countsAsProposal);
  const resolved = conversations.filter(resolvedWithoutQueue).length;
  const withTurns = conversations.filter((conversation) => conversation.decisions.length > 0);
  const confidences = decisions.flatMap((decision) =>
    decision.confidence === null ? [] : [decision.confidence],
  );
  const totalCostUsd = sum(decisions.map((decision) => decision.costUsd));

  return {
    conversations: conversations.length,
    resolvedWithoutQueue: { count: resolved, rate: ratio(resolved, conversations.length) },
    drafts: {
      total: drafts.length,
      duplicatesAvoided: drafts.filter(avoidsDuplicate).length,
      ticketsCreated: conversations.filter(createdTicket).length,
    },
    handoffs: countHandoffs(conversations),
    turns: decisions.length,
    averageConfidence: average(confidences),
    totalCostUsd,
    averageCostPerConversationUsd: withTurns.length === 0 ? null : totalCostUsd / withTurns.length,
    averageResponseMs: average(decisions.map((decision) => decision.latencyMs)),
    shortCircuits: decisions.filter((decision) => decision.shortCircuit).length,
    correctionsByRule: countCorrections(decisions),
  };
}

function countHandoffs(conversations: MetricsConversation[]): DashboardMetrics["handoffs"] {
  const byReason = Object.fromEntries(HANDOFF_REASONS.map((reason) => [reason, 0])) as Record<
    HandoffReason,
    number
  >;
  let total = 0;
  let transferred = 0;
  for (const conversation of conversations) {
    const transfers = conversationTransfers(conversation);
    if (transfers.length > 0) transferred += 1;
    for (const reason of transfers) {
      byReason[reason] += 1;
      total += 1;
    }
  }
  return { total, conversations: transferred, byReason };
}

function countCorrections(decisions: MetricsDecision[]): Record<ReplyCorrectionRule, number> {
  const counts = Object.fromEntries(REPLY_CORRECTION_RULES.map((rule) => [rule, 0])) as Record<
    ReplyCorrectionRule,
    number
  >;
  for (const decision of decisions) {
    for (const rule of decision.corrections) counts[rule] += 1;
  }
  return counts;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : sum(values) / values.length;
}

function ratio(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}
