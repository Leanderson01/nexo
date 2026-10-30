import { v, type Infer, type VLiteral, type VUnion } from "convex/values";

import {
  CONFIDENCE_LEVELS,
  CONVERSATION_EVENTS,
  CONVERSATION_STATUSES,
  DECISION_OUTCOMES,
  GATEWAY_ERROR_KINDS,
  HANDOFF_REASONS,
  IMPACTS,
  INTENTS,
  MESSAGE_ROLES,
  MESSAGE_STATUSES,
  PENDING_ACTION_STATUSES,
  PERSON_ROLES,
  POLICY_ACTION_KINDS,
  POLICY_OUTCOMES,
  PRIORITIES,
  ANALYST_LEVELS,
  TICKET_CATEGORIES,
  TICKET_KINDS,
  TICKET_STATUSES,
  TICKET_UPDATE_AUTHORS,
  TOOL_CALL_STATUSES,
  TURN_STAGES,
} from "../../src/domain/enums";
import type { DecisionRecord } from "../../src/domain/decision-record";
import type { Handoff } from "../../src/domain/conversation";
import type { MessagePart } from "../../src/domain/message-parts";
import type { PendingAction } from "../../src/domain/pending-action";
import type { NewTicket, TicketFieldChanges } from "../../src/domain/ticket";
import type { ArticleCondition } from "../../src/domain/article";
import { assertTypesMatch, type Equals } from "../../src/shared/type-equals";

// Validators do Convex derivados de src/domain. Enums saem dos arrays de enums.ts;
// estruturas são escritas aqui e conferidas contra os tipos do domínio em tempo de
// compilação (assertTypesMatch), para que as duas definições nunca divirjam.

function literals<const T extends readonly [string, ...string[]]>(values: T) {
  return v.union(...values.map((value) => v.literal(value))) as unknown as VUnion<
    T[number],
    VLiteral<T[number], "required">[],
    "required",
    never
  >;
}

export const vTicketKind = literals(TICKET_KINDS);
export const vTicketCategory = literals(TICKET_CATEGORIES);
export const vPriority = literals(PRIORITIES);
export const vTicketStatus = literals(TICKET_STATUSES);
export const vImpact = literals(IMPACTS);
export const vTicketUpdateAuthor = literals(TICKET_UPDATE_AUTHORS);
export const vPersonRole = literals(PERSON_ROLES);
export const vAnalystLevel = literals(ANALYST_LEVELS);
export const vConversationStatus = literals(CONVERSATION_STATUSES);
export const vConversationEvent = literals(CONVERSATION_EVENTS);
export const vHandoffReason = literals(HANDOFF_REASONS);
export const vMessageRole = literals(MESSAGE_ROLES);
export const vMessageStatus = literals(MESSAGE_STATUSES);
export const vPendingActionStatus = literals(PENDING_ACTION_STATUSES);
export const vIntent = literals(INTENTS);
export const vConfidenceLevel = literals(CONFIDENCE_LEVELS);
export const vPolicyOutcome = literals(POLICY_OUTCOMES);
export const vToolCallStatus = literals(TOOL_CALL_STATUSES);
export const vDecisionOutcome = literals(DECISION_OUTCOMES);
export const vPolicyActionKind = literals(POLICY_ACTION_KINDS);
export const vTurnStage = literals(TURN_STAGES);
export const vGatewayErrorKind = literals(GATEWAY_ERROR_KINDS);

// ---------- Chamados ----------

export const vPrioritySignals = v.object({
  impact: vImpact,
  blocked: v.boolean(),
  deadlineToday: v.boolean(),
});

export const vTicketFieldChanges = v.object({
  status: v.optional(vTicketStatus),
  priority: v.optional(vPriority),
  priorityReason: v.optional(v.string()),
  category: v.optional(vTicketCategory),
});
assertTypesMatch<Equals<Infer<typeof vTicketFieldChanges>, TicketFieldChanges>>();

export const vNewTicket = v.object({
  kind: vTicketKind,
  category: vTicketCategory,
  title: v.string(),
  description: v.string(),
  affected: v.string(),
  prioritySignals: vPrioritySignals,
  priority: vPriority,
  priorityReason: v.string(),
  reopenedFrom: v.optional(v.string()),
});
assertTypesMatch<Equals<Infer<typeof vNewTicket>, NewTicket>>();

export const vArticleCondition = v.object({ field: v.string(), appliesTo: v.array(v.string()) });
assertTypesMatch<Equals<Infer<typeof vArticleCondition>, ArticleCondition>>();

// ---------- Conversa ----------

export const vHandoff = v.object({
  reason: vHandoffReason,
  summary: v.string(),
  ticketCode: v.optional(v.string()),
  at: v.number(),
});
assertTypesMatch<Equals<Infer<typeof vHandoff>, Handoff>>();

export const vPendingAction = v.union(
  v.object({ kind: v.literal("create_ticket"), ticket: vNewTicket }),
  v.object({
    kind: v.literal("update_ticket"),
    code: v.string(),
    text: v.string(),
    fieldChanges: v.optional(vTicketFieldChanges),
  }),
  v.object({ kind: v.literal("reopen_ticket"), code: v.string(), reason: v.string() }),
);
assertTypesMatch<Equals<Infer<typeof vPendingAction>, PendingAction>>();

export const vMessagePart = v.union(
  v.object({ type: v.literal("text"), text: v.string() }),
  v.object({
    type: v.literal("article"),
    slug: v.string(),
    title: v.string(),
    excerpt: v.string(),
  }),
  v.object({ type: v.literal("ticket"), code: v.string() }),
  v.object({ type: v.literal("ticketSelector"), codes: v.array(v.string()), prompt: v.string() }),
  v.object({ type: v.literal("draft"), pendingActionId: v.string() }),
  v.object({
    type: v.literal("quickReplies"),
    options: v.array(v.object({ label: v.string(), value: v.string() })),
  }),
  v.object({ type: v.literal("handoff"), reason: vHandoffReason, outOfHours: v.boolean() }),
  v.object({
    type: v.literal("event"),
    kind: vConversationEvent,
    actorName: v.optional(v.string()),
  }),
  v.object({ type: v.literal("error"), message: v.string(), retryable: v.boolean() }),
);
assertTypesMatch<Equals<Infer<typeof vMessagePart>, MessagePart>>();

// ---------- Decisão ----------

const vEntities = v.object({
  system: v.union(v.string(), v.null()),
  errorCode: v.union(v.string(), v.null()),
  os: v.union(v.string(), v.null()),
  device: v.union(v.string(), v.null()),
  ticketRef: v.union(v.string(), v.null()),
});

const vTicketSignals = v.object({
  kind: v.union(vTicketKind, v.null()),
  category: v.union(vTicketCategory, v.null()),
  impact: v.union(vImpact, v.null()),
  blocked: v.union(v.boolean(), v.null()),
  deadlineToday: v.union(v.boolean(), v.null()),
});

/** Campos do DecisionRecord; a tabela `decisions` soma conversationId e messageId. */
export const decisionRecordFields = {
  understanding: v.union(
    v.object({
      intent: vIntent,
      summary: v.string(),
      entities: vEntities,
      signals: vTicketSignals,
    }),
    v.null(),
  ),
  policies: v.array(
    v.object({
      name: v.string(),
      outcome: vPolicyOutcome,
      explanation: v.optional(v.string()),
      actionKind: v.optional(vPolicyActionKind),
    }),
  ),
  actions: v.array(
    v.object({
      tool: v.string(),
      label: v.string(),
      inputSummary: v.string(),
      outputSummary: v.string(),
      status: vToolCallStatus,
      attempts: v.number(),
      latencyMs: v.number(),
      attemptErrors: v.optional(v.array(vGatewayErrorKind)),
    }),
  ),
  derived: v.optional(
    v.object({
      priority: v.optional(v.object({ value: vPriority, reason: v.string(), dueAt: v.number() })),
    }),
  ),
  confidence: v.union(
    v.object({ value: v.number(), level: vConfidenceLevel, reason: v.string() }),
    v.null(),
  ),
  rationale: v.string(),
  outcome: vDecisionOutcome,
  shortCircuit: v.optional(v.boolean()),
  errorStage: v.optional(vTurnStage),
  usage: v.object({
    models: v.array(v.string()),
    inputTokens: v.number(),
    cachedInputTokens: v.optional(v.number()),
    outputTokens: v.number(),
    estimatedCostUsd: v.number(),
    latencyMs: v.number(),
  }),
  createdAt: v.number(),
};
export const vDecisionRecord = v.object(decisionRecordFields);
assertTypesMatch<Equals<Infer<typeof vDecisionRecord>, DecisionRecord>>();
