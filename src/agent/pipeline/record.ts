import { confidenceLevel } from "@/agent/policies/low-confidence-policy";
import type { DecisiveAction, GuidingAction } from "@/agent/policies/run-policies";
import type { DecisionRecord, PolicyEvaluation, ToolCallTrace } from "@/domain/decision-record";
import type { DecisionOutcome, PendingActionKind, TurnStage } from "@/domain/enums";
import {
  CONFIDENCE_LEVEL_LABELS,
  HANDOFF_REASON_LABELS,
  OUT_OF_SCOPE_AREA_LABELS,
} from "@/domain/labels";
import type { Understanding } from "@/domain/understanding";

import type { DerivedPriorityRecord } from "./turn-workspace";
import type { UsageTotals } from "./turn-usage";

// REGISTRAR (§6.6): monta o `DecisionRecord` do turno, com os campos da decisão 23, a partir do
// que as etapas produziram. Puro: quem grava é o pipeline.

export interface RecordInput {
  now: number;
  latencyMs: number;
  understanding: Understanding | null;
  evaluations: PolicyEvaluation[];
  decisiveAction: DecisiveAction | null;
  guidingActions: GuidingAction[];
  traces: ToolCallTrace[];
  derivedPriority: DerivedPriorityRecord | null;
  outcome: DecisionOutcome;
  shortCircuit: boolean;
  draftKind: PendingActionKind | null;
  errorStage: TurnStage | null;
  usage: UsageTotals;
}

export function buildDecisionRecord(input: RecordInput): DecisionRecord {
  const { understanding } = input;
  return {
    understanding: understanding && {
      intent: understanding.intent,
      summary: understanding.summary,
      entities: understanding.entities,
      signals: understanding.ticketSignals,
    },
    policies: input.evaluations,
    actions: input.traces,
    ...(input.derivedPriority && { derived: { priority: input.derivedPriority } }),
    confidence: understanding && {
      value: understanding.confidence,
      level: confidenceLevel(understanding.confidence),
      reason: understanding.confidenceReason,
    },
    rationale: buildRationale(input),
    outcome: input.outcome,
    shortCircuit: input.shortCircuit,
    ...(input.errorStage && { errorStage: input.errorStage }),
    usage: {
      models: input.usage.models,
      inputTokens: input.usage.inputTokens,
      cachedInputTokens: input.usage.cachedInputTokens,
      outputTokens: input.usage.outputTokens,
      estimatedCostUsd: input.usage.estimatedCostUsd,
      latencyMs: input.latencyMs,
    },
    createdAt: input.now,
  };
}

/** 2 a 3 frases: o que entendeu, o que as políticas decidiram e o que o turno fez. */
export function buildRationale(input: RecordInput): string {
  return [understoodSentence(input.understanding), policySentence(input), actionSentence(input)]
    .filter((sentence) => sentence !== "")
    .join(" ");
}

function understoodSentence(understanding: Understanding | null): string {
  if (!understanding) return "Não foi possível entender a mensagem.";
  const level = CONFIDENCE_LEVEL_LABELS[confidenceLevel(understanding.confidence)].toLowerCase();
  return `Entendeu, com confiança ${level}: ${withPeriod(lowercaseFirst(understanding.summary))}`;
}

function policySentence(input: RecordInput): string {
  if (input.decisiveAction) {
    const policy = triggeredPolicyName(input.evaluations, input.decisiveAction.kind);
    return `${policy ?? "Uma política"} decidiu ${describeDecisive(input.decisiveAction)}, sem chamar o modelo principal.`;
  }
  if (input.guidingActions.length > 0) {
    return `As políticas orientaram a resposta: ${input.guidingActions.map(describeGuiding).join("; ")}.`;
  }
  if (input.evaluations.length > 0) return "Nenhuma política disparou.";
  return "";
}

function actionSentence(input: RecordInput): string {
  switch (input.outcome) {
    case "draft_proposed":
      return `Propôs um rascunho (${DRAFT_KIND_TEXT[input.draftKind ?? "create_ticket"]}) para o funcionário confirmar; nada foi gravado no sistema de chamados.`;
    case "handoff":
      return "Transferiu a conversa para um analista com o resumo do caso.";
    case "redirected":
      return "Respondeu em código, sem abrir chamado.";
    case "asked_clarification":
      return "Fez uma pergunta antes de seguir.";
    case "answered":
      return input.traces.length > 0
        ? `Respondeu depois de: ${unique(input.traces.map((trace) => trace.label)).join(", ")}.`
        : "Respondeu sem consultar outros sistemas.";
    case "error":
      return `O turno parou na etapa ${STAGE_TEXT[input.errorStage ?? "act"]} e mostrou a opção de tentar de novo.`;
  }
}

const DRAFT_KIND_TEXT: Record<PendingActionKind, string> = {
  create_ticket: "chamado novo",
  update_ticket: "atualização de chamado",
  reopen_ticket: "reabertura de chamado",
};

const STAGE_TEXT: Record<TurnStage, string> = {
  understand: "ENTENDER (modelo indisponível)",
  decide: "DECIDIR (sistema de chamados indisponível)",
  act: "AGIR",
  record: "REGISTRAR",
};

function triggeredPolicyName(evaluations: PolicyEvaluation[], kind: string): string | null {
  return (
    evaluations.find(
      (evaluation) => evaluation.outcome === "triggered" && evaluation.actionKind === kind,
    )?.name ?? null
  );
}

function describeDecisive(action: DecisiveAction): string {
  switch (action.kind) {
    case "handoff":
      return `transferir (${HANDOFF_REASON_LABELS[action.reason].toLowerCase()})`;
    case "redirect_out_of_scope":
      return `redirecionar para ${OUT_OF_SCOPE_AREA_LABELS[action.area]}`;
    case "refuse":
      return action.topic === "rule_change"
        ? "recusar o pedido para mudar as regras"
        : "recusar um assunto fora de TI";
  }
}

function describeGuiding(action: GuidingAction): string {
  if (action.kind === "ask_clarification") return "pedir um esclarecimento";
  return action.reason === "critical"
    ? "caso crítico, rascunho que transfere ao confirmar"
    : `oferecer um analista (${HANDOFF_REASON_LABELS[action.reason].toLowerCase()})`;
}

function withPeriod(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function lowercaseFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
