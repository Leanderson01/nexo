import type {
  ConfidenceLevel,
  DecisionOutcome,
  GatewayErrorKind,
  Intent,
  PolicyActionKind,
  PolicyOutcome,
  Priority,
  ReplyCorrectionRule,
  ToolCallStatus,
  TurnStage,
} from "./enums";
import type { Entities, TicketSignals } from "./understanding";

// Registro de um turno do agent; alimenta o painel de decisão (§6.6, §7.3).
// A tabela `decisions` guarda isto mais `conversationId` e `messageId`.
// Os campos opcionais marcados com "decisão 23" vão além da §6.6 (TASKS.md).

export interface PolicyEvaluation {
  name: string;
  outcome: PolicyOutcome;
  /** Quando disparou, o motivo; quando não se aplica, a nota da política. */
  explanation?: string;
  /** Quando disparou, o que mandou fazer (ex.: ofereceu × transferiu). Decisão 23. */
  actionKind?: PolicyActionKind;
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
  /** Erro de cada tentativa que falhou, em ordem ("503 na 1ª, timeout na 2ª"). Decisão 23. */
  attemptErrors?: GatewayErrorKind[];
}

export interface TurnUsage {
  models: string[];
  inputTokens: number;
  /** Parte da entrada que veio do cache de prompt (cobrada com desconto). Decisão 23. */
  cachedInputTokens?: number;
  outputTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
}

/** Correção feita em código na resposta do AGIR (decisão 25). */
export interface ReplyCorrection {
  rule: ReplyCorrectionRule;
  /** O que estava errado e o que o código fez, em uma frase. */
  explanation: string;
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
  /** Verdadeiro quando uma política decidiu sozinha e o modelo principal não foi chamado. Decisão 23. */
  shortCircuit?: boolean;
  /** Em turno com `outcome: "error"`, a etapa onde parou. Decisão 23. */
  errorStage?: TurnStage;
  /** Correções feitas em código na resposta do modelo, quando houve. Decisão 25. */
  corrections?: ReplyCorrection[];
  usage: TurnUsage;
  createdAt: number;
}
