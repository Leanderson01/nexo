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
