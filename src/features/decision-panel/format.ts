import type { DecisionRecord, ToolCallTrace } from "@/domain/decision-record";
import type { DecisionOutcome, Intent, PolicyOutcome, Priority, TurnStage } from "@/domain/enums";
import { IMPACT_LABELS, TICKET_CATEGORY_LABELS, TICKET_KIND_LABELS } from "@/domain/labels";
import { PRIORITY_DEADLINES } from "@/domain/priority";
import { MAX_ATTEMPTS } from "@/agent/gateways/http-ticket-gateway";

// Textos do painel de decisão (§7.3). Tudo puro: recebe dados do DecisionRecord e devolve
// a frase que a tela mostra. Os números seguem o formato brasileiro ("1,2 s", "1.234").

const TIME_ZONE = "America/Sao_Paulo";

export const INTENT_LABELS: Record<Intent, string> = {
  question: "Tirar uma dúvida",
  ticket_status: "Consultar um chamado",
  open_ticket: "Abrir um chamado",
  update_ticket: "Complementar um chamado",
  confirm_or_edit_draft: "Confirmar ou corrigir o rascunho",
  talk_to_analyst: "Falar com um analista",
  out_of_scope: "Assunto fora da TI",
  greeting_or_smalltalk: "Cumprimento ou conversa",
  unclear: "Não ficou claro",
};

export const DECISION_OUTCOME_LABELS: Record<DecisionOutcome, string> = {
  answered: "Respondeu",
  asked_clarification: "Pediu um esclarecimento",
  draft_proposed: "Propôs um rascunho",
  handoff: "Transferiu para um analista",
  redirected: "Indicou outra área",
  error: "Turno com erro",
};

export const TURN_STAGE_LABELS: Record<TurnStage, string> = {
  understand: "entender a mensagem",
  decide: "aplicar as regras",
  act: "agir",
  record: "registrar o turno",
};

/**
 * Notas da seção "Por quê" que não dependem do texto do modelo (decisão 23): se uma regra
 * decidiu sozinha, sem o modelo principal, e em que etapa um turno com erro parou.
 */
export function formatTurnNotes(
  record: Pick<DecisionRecord, "shortCircuit" | "errorStage">,
): string[] {
  const notes: string[] = [];
  if (record.shortCircuit) {
    notes.push("Uma regra decidiu sozinha: o modelo principal não foi chamado neste turno.");
  }
  if (record.errorStage) {
    notes.push(`O turno parou ao ${TURN_STAGE_LABELS[record.errorStage]}.`);
  }
  return notes;
}

export const POLICY_OUTCOME_LABELS: Record<PolicyOutcome, string> = {
  triggered: "disparou",
  not_applicable: "não se aplica",
};

// ---------- O que entendi ----------

export interface EntityRow {
  label: string;
  value: string;
}

/** Entidades e sinais extraídos, só os que vieram preenchidos, na ordem da §7.3. */
export function describeEntities(understanding: NonNullable<DecisionRecord["understanding"]>) {
  const { entities, signals } = understanding;
  const rows: Array<EntityRow | null> = [
    entities.system ? { label: "Sistema", value: entities.system } : null,
    entities.errorCode ? { label: "Erro", value: entities.errorCode } : null,
    entities.os ? { label: "Sistema operacional", value: entities.os } : null,
    entities.device ? { label: "Dispositivo", value: entities.device } : null,
    entities.ticketRef ? { label: "Chamado citado", value: entities.ticketRef } : null,
    signals.category
      ? { label: "Categoria", value: TICKET_CATEGORY_LABELS[signals.category] }
      : null,
    signals.impact ? { label: "Impacto", value: IMPACT_LABELS[signals.impact] } : null,
    signals.deadlineToday === null
      ? null
      : { label: "Urgência", value: describeDeadlineToday(signals.deadlineToday) },
  ];
  return rows.filter((row): row is EntityRow => row !== null);
}

function describeDeadlineToday(deadlineToday: boolean): string {
  return deadlineToday ? "Há um compromisso hoje" : "Nenhum compromisso hoje";
}

// ---------- Prioridade calculada ----------

/** Sinais que entram em `derivePriority`; "não informado" quando o modelo não extraiu. */
export function describePrioritySignals(
  signals: NonNullable<DecisionRecord["understanding"]>["signals"],
): EntityRow[] {
  const notInformed = "não informado";
  return [
    { label: "Tipo", value: signals.kind ? TICKET_KIND_LABELS[signals.kind] : notInformed },
    { label: "Impacto", value: signals.impact ? IMPACT_LABELS[signals.impact] : notInformed },
    {
      label: "Impedido de trabalhar",
      value: signals.blocked === null ? notInformed : yesNo(signals.blocked),
    },
    {
      label: "Compromisso hoje",
      value: signals.deadlineToday === null ? notInformed : yesNo(signals.deadlineToday),
    },
  ];
}

/** "4 horas úteis, até 30/10 às 15:40". */
export function formatPriorityDeadline(priority: Priority, dueAt: number): string {
  return `${PRIORITY_DEADLINES[priority].label}, até ${formatDateTime(dueAt)}`;
}

function yesNo(value: boolean): string {
  return value ? "sim" : "não";
}

// ---------- O que fiz ----------

/**
 * Tentativas em linguagem natural (decisão 16: até 3 tentativas no serviço de chamados).
 * "funcionou de primeira", "tentativa 2 de 3 funcionou", "falhou nas 3 tentativas".
 */
export function formatAttempts(trace: Pick<ToolCallTrace, "attempts" | "status">): string {
  const { attempts, status } = trace;
  const maxAttempts = Math.max(attempts, MAX_ATTEMPTS);

  if (status === "ok") {
    if (attempts <= 1) return "funcionou de primeira";
    return `tentativa ${attempts} de ${maxAttempts} funcionou`;
  }
  if (attempts <= 1) return "falhou na primeira tentativa";
  return `falhou nas ${attempts} tentativas`;
}

// ---------- Números ----------

/** "850 ms" abaixo de 1 segundo; "1,2 s" acima. */
export function formatLatency(latencyMs: number): string {
  if (latencyMs < 1000) return `${Math.round(latencyMs)} ms`;
  const seconds = latencyMs / 1000;
  return `${seconds.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
}

/** "1.234 tokens" (singular para 1). */
export function formatTokens(tokens: number): string {
  const unit = tokens === 1 ? "token" : "tokens";
  return `${tokens.toLocaleString("pt-BR")} ${unit}`;
}

/**
 * Custo em dólares com 4 casas, ou 5 quando o valor é menor que um décimo de milésimo:
 * "US$ 0,0012", "US$ 0,00004". Turno sem modelo custa "US$ 0,00".
 */
export function formatCostUsd(costUsd: number): string {
  if (costUsd === 0) return "US$ 0,00";
  const fractionDigits = costUsd < 0.0001 ? 5 : 4;
  const value = costUsd.toLocaleString("pt-BR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return `US$ ${value}`;
}

/** Confiança de 0 a 1 com duas casas: "0,82". */
export function formatConfidenceValue(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------- Datas ----------

/** Data e hora no fuso do service desk: "30/10 às 15:40". */
export function formatDateTime(timestamp: number): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("day")}/${part("month")} às ${part("hour")}:${part("minute")}`;
}
