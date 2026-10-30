// Fonte única dos enums do projeto. Tipos TS, schemas Zod e validators do Convex
// derivam destes arrays; nunca repita uma destas listas em outro lugar.
// Os valores são códigos estáveis em inglês; os rótulos em português ficam em labels.ts.

export const TICKET_KINDS = ["INC", "REQ"] as const;
export type TicketKind = (typeof TICKET_KINDS)[number];

export const TICKET_CATEGORIES = [
  "access",
  "network_vpn",
  "hardware",
  "software",
  "email",
  "other",
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const TICKET_STATUSES = [
  "open",
  "in_progress",
  "awaiting_analyst",
  "awaiting_employee",
  "approved",
  "resolved",
  "closed",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const IMPACTS = ["individual", "team", "company"] as const;
export type Impact = (typeof IMPACTS)[number];

export const TICKET_UPDATE_AUTHORS = ["employee", "agent", "analyst"] as const;
export type TicketUpdateAuthor = (typeof TICKET_UPDATE_AUTHORS)[number];

export const PERSON_ROLES = ["employee", "analyst"] as const;
export type PersonRole = (typeof PERSON_ROLES)[number];

export const ANALYST_LEVELS = ["N1", "N2"] as const;
export type AnalystLevel = (typeof ANALYST_LEVELS)[number];

export const CONVERSATION_STATUSES = [
  "agent",
  "waiting_analyst",
  "with_analyst",
  "closed",
] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const CONVERSATION_EVENTS = [
  "transferred",
  "assigned",
  "returned_to_agent",
  "closed",
  "draft_cancelled",
  /** O suporte atualizou um chamado do funcionário (T17, §11.6); a parte leva o código. */
  "ticket_updated",
] as const;
export type ConversationEvent = (typeof CONVERSATION_EVENTS)[number];

export const HANDOFF_REASONS = ["requested", "critical", "overdue", "low_confidence"] as const;
export type HandoffReason = (typeof HANDOFF_REASONS)[number];

export const MESSAGE_ROLES = ["user", "assistant", "analyst", "system"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const MESSAGE_STATUSES = ["streaming", "complete", "error"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const PENDING_ACTION_KINDS = ["create_ticket", "update_ticket", "reopen_ticket"] as const;
export type PendingActionKind = (typeof PENDING_ACTION_KINDS)[number];

export const PENDING_ACTION_STATUSES = ["pending", "confirmed", "cancelled", "superseded"] as const;
export type PendingActionStatus = (typeof PENDING_ACTION_STATUSES)[number];

export const INTENTS = [
  "question",
  "ticket_status",
  "open_ticket",
  "update_ticket",
  "confirm_or_edit_draft",
  "talk_to_analyst",
  "out_of_scope",
  "greeting_or_smalltalk",
  "unclear",
] as const;
export type Intent = (typeof INTENTS)[number];

export const OUT_OF_SCOPE_AREAS = ["hr", "finance", "facilities"] as const;
export type OutOfScopeArea = (typeof OUT_OF_SCOPE_AREAS)[number];

/** Por que o agent recusa sem chamar o modelo: pedido para mudar as regras ou assunto fora de TI sem área. */
export const REFUSAL_TOPICS = ["rule_change", "not_it"] as const;
export type RefusalTopic = (typeof REFUSAL_TOPICS)[number];

/** O que uma política que disparou mandou fazer (espelha `PolicyAction` em src/agent/policies). */
export const POLICY_ACTION_KINDS = [
  "handoff",
  "redirect_out_of_scope",
  "refuse",
  "offer_handoff",
  "ask_clarification",
] as const;
export type PolicyActionKind = (typeof POLICY_ACTION_KINDS)[number];

/** Etapas do turno do agent (§6.1); usadas para dizer onde um turno falhou. */
export const TURN_STAGES = ["understand", "decide", "act", "record"] as const;
export type TurnStage = (typeof TURN_STAGES)[number];

/**
 * Regras conferidas em código depois do AGIR (decisão 25): o que o modelo escreveu e foi
 * corrigido antes de a resposta ser concluída.
 * - `foreign_ticket_code`: citou um código de chamado que não é do funcionário;
 * - `draft_claim_without_draft`: disse que preparou um rascunho sem chamar a tool de proposta;
 * - `critical_without_draft`: caso crítico em que o rascunho não saiu no turno (§6.3);
 * - `no_ticket_found_offer`: não achou o chamado e não ofereceu abrir um (F2);
 * - `tool_call_as_text`: escreveu a chamada de uma tool como texto (ex.: `offerQuickReplies({...})`);
 * - `empty_reply`: terminou sem texto e sem partes (o gpt-oss às vezes deixa a resposta só no
 *   raciocínio);
 * - `quick_replies_as_text`: escreveu as opções rápidas como texto (`[options] ...`, JSON,
 *   "Opções: - Sim - Não") em vez de chamar a tool.
 */
export const REPLY_CORRECTION_RULES = [
  "foreign_ticket_code",
  "draft_claim_without_draft",
  "critical_without_draft",
  "no_ticket_found_offer",
  "tool_call_as_text",
  "empty_reply",
  "quick_replies_as_text",
] as const;
export type ReplyCorrectionRule = (typeof REPLY_CORRECTION_RULES)[number];

export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const POLICY_OUTCOMES = ["not_applicable", "triggered"] as const;
export type PolicyOutcome = (typeof POLICY_OUTCOMES)[number];

export const TOOL_CALL_STATUSES = ["ok", "error"] as const;
export type ToolCallStatus = (typeof TOOL_CALL_STATUSES)[number];

export const DECISION_OUTCOMES = [
  "answered",
  "asked_clarification",
  "draft_proposed",
  "handoff",
  "redirected",
  "error",
] as const;
export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number];

export const GATEWAY_ERROR_KINDS = ["unavailable", "not_found", "conflict", "validation"] as const;
export type GatewayErrorKind = (typeof GATEWAY_ERROR_KINDS)[number];

/**
 * Abas da fila do console (§7.4, protótipo 05): todas as abertas, aguardando analista
 * ("Para você"), com o agent, em atendimento por mim e encerradas (decisão 13).
 */
export const CONSOLE_TABS = ["all", "for_you", "with_agent", "mine", "closed"] as const;
export type ConsoleTab = (typeof CONSOLE_TABS)[number];

/** Períodos do painel de métricas (§7.6): desde a meia-noite de São Paulo, 7 e 30 dias. */
export const METRICS_PERIODS = ["today", "7d", "30d"] as const;
export type MetricsPeriod = (typeof METRICS_PERIODS)[number];
