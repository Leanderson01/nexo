import type {
  ConfidenceLevel,
  DecisionOutcome,
  Intent,
  PolicyOutcome,
  Priority,
  ToolCallStatus,
} from "./enums";
import type { Entities, TicketSignals } from "./understanding";

// Registro de um turno do agent; alimenta o painel de decisão (§6.6, §7.3).
// A tabela `decisions` guarda isto mais `conversationId` e `messageId`.

export interface PolicyEvaluation {
  name: string;
  outcome: PolicyOutcome;
  explanation?: string;
}

/** Preenchido automaticamente pelo decorator withTrace. */
export interface ToolCallTrace {
  tool: string;
  /** Texto do chip: "consultou seus chamados". */
  label: string;
  inputSummary: string;
  outputSummary: string;
  status: ToolCallStatus;
  attempts: number;
  latencyMs: number;
}

export interface TurnUsage {
  models: string[];
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
}

export interface DecisionRecord {
  /** Nulo quando o turno falhou antes de entender a mensagem. */
  understanding: {
    intent: Intent;
    summary: string;
    entities: Entities;
    signals: TicketSignals;
  } | null;
  policies: PolicyEvaluation[];
  actions: ToolCallTrace[];
  derived?: { priority?: { value: Priority; reason: string; dueAt: number } };
  confidence: { value: number; level: ConfidenceLevel; reason: string } | null;
  /** 2 a 3 frases: por que esta ação. */
  rationale: string;
  outcome: DecisionOutcome;
  usage: TurnUsage;
  createdAt: number;
}
