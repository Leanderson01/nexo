import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import {
  decisionRecordFields,
  vAnalystLevel,
  vArticleCondition,
  vConversationStatus,
  vHandoff,
  vMessagePart,
  vMessageRole,
  vMessageStatus,
  vPendingAction,
  vPendingActionStatus,
  vPersonRole,
  vPriority,
  vPrioritySignals,
  vTicketCategory,
  vTicketFieldChanges,
  vTicketKind,
  vTicketStatus,
  vTicketUpdateAuthor,
} from "./lib/validators";

// Modelo de dados (§5.11). `dueAt` e "vencido" não são guardados: saem de src/domain/sla.ts.
// Desvios da spec registrados em TASKS.md: tabela `pendingActions` (o card de rascunho
// precisa do estado final), `counters` (códigos sequenciais) e limite contado só sobre
// as mensagens do funcionário.
export default defineSchema({
  ...authTables,

  people: defineTable({
    name: v.string(),
    email: v.string(),
    role: vPersonRole,
    department: v.string(),
    level: v.optional(vAnalystLevel),
  }).index("by_email", ["email"]),

  // ---------- Conversa (dono: chat e console) ----------

  conversations: defineTable({
    employeeId: v.id("people"),
    status: vConversationStatus,
    assignedAnalystId: v.optional(v.id("people")),
    handoff: v.optional(vHandoff),
    /** Rascunho aguardando confirmação, se houver. */
    pendingActionId: v.optional(v.id("pendingActions")),
    selectedTicketCode: v.optional(v.string()),
    rollingSummary: v.optional(v.string()),
    /** Nota do analista ao devolver a conversa; o agent lê no próximo turno. */
    returnNote: v.optional(v.string()),
    /**
     * Até quando a equipe de analistas leu as mensagens do funcionário (T12): o que chegou
     * depois conta como não lido na fila do console.
     */
    analystReadAt: v.optional(v.number()),
    /** Assunto para o histórico do chat: o começo da primeira mensagem do funcionário (T5). */
    subject: v.optional(v.string()),
    employeeMessageCount: v.number(),
    agentBusy: v.boolean(),
    clarificationAttempts: v.number(),
    lastMessageAt: v.number(),
    closedAt: v.optional(v.number()),
  })
    .index("by_employee_lastMessage", ["employeeId", "lastMessageAt"])
    .index("by_status_lastMessage", ["status", "lastMessageAt"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    role: vMessageRole,
    authorId: v.optional(v.id("people")),
    parts: v.array(vMessagePart),
    status: vMessageStatus,
    decisionId: v.optional(v.id("decisions")),
    /**
     * Erro ao confirmar este rascunho (legado fora do ar): o "Tentar de novo" confirma de
     * novo, em vez de repetir o turno do agent (T11).
     */
    failedPendingActionId: v.optional(v.id("pendingActions")),
    createdAt: v.number(),
  }).index("by_conversation_createdAt", ["conversationId", "createdAt"]),

  /** Uma linha por rascunho proposto; o `_id` é a chave de idempotência da escrita. */
  pendingActions: defineTable({
    conversationId: v.id("conversations"),
    /** Número exibido no card ("Rascunho D-381"). */
    draftNumber: v.number(),
    action: vPendingAction,
    status: vPendingActionStatus,
    /** Ao confirmar, transfere a conversa (política Crítica). */
    handoffOnConfirm: v.boolean(),
    resultTicketCode: v.optional(v.string()),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  }).index("by_conversation", ["conversationId"]),

  decisions: defineTable({
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
    ...decisionRecordFields,
  })
    .index("by_conversation", ["conversationId"])
    .index("by_message", ["messageId"]),

  // ---------- Serviço de chamados (o "legado" simulado; dono: convex/ticketing) ----------

  tickets: defineTable({
    code: v.string(),
    kind: vTicketKind,
    category: vTicketCategory,
    priority: vPriority,
    priorityReason: v.string(),
    prioritySignals: vPrioritySignals,
    status: vTicketStatus,
    title: v.string(),
    description: v.string(),
    affected: v.string(),
    ownerId: v.id("people"),
    createdAt: v.number(),
    lastActivityAt: v.number(),
    resolvedAt: v.optional(v.number()),
    reopenedFrom: v.optional(v.string()),
  })
    .index("by_owner_status", ["ownerId", "status"])
    .index("by_code", ["code"]),

  ticketUpdates: defineTable({
    ticketId: v.id("tickets"),
    authorType: vTicketUpdateAuthor,
    authorName: v.optional(v.string()),
    text: v.string(),
    fieldChanges: v.optional(vTicketFieldChanges),
    createdAt: v.number(),
  }).index("by_ticket", ["ticketId"]),

  idempotencyKeys: defineTable({
    key: v.string(),
    /** Toda escrita do serviço resulta em um chamado; guardamos o código dele. */
    ticketCode: v.string(),
    createdAt: v.number(),
  }).index("by_key", ["key"]),

  /** Sequências: "INC", "REQ" e "draft". */
  counters: defineTable({
    name: v.string(),
    value: v.number(),
  }).index("by_name", ["name"]),

  // ---------- Central de ajuda ----------

  articles: defineTable({
    slug: v.string(),
    title: v.string(),
    body: v.string(),
    tags: v.array(v.string()),
    conditions: v.optional(v.array(vArticleCondition)),
    /** Título, corpo e tags concatenados: o índice de busca do Convex aceita um campo só. */
    searchText: v.string(),
  })
    .index("by_slug", ["slug"])
    .searchIndex("search_text", { searchField: "searchText" }),

  // ---------- Limites de uso (deploy) ----------

  usage: defineTable({
    /** "2026-10-29", no fuso America/Sao_Paulo. */
    day: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    estimatedCostUsd: v.number(),
    transcriptionSeconds: v.number(),
    transcriptionCount: v.number(),
  }).index("by_day", ["day"]),
});
