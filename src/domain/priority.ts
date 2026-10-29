import type { Impact, Priority, TicketKind } from "./enums";
import { PRIORITY_LABELS } from "./labels";
import type { DerivedPriority } from "./ticket";

export interface PriorityInput {
  kind: TicketKind;
  impact: Impact;
  blocked: boolean;
  deadlineToday: boolean;
}

/**
 * Deriva a prioridade dos sinais extraídos pelo LLM (§3.5).
 * O LLM nunca escolhe a prioridade; esta função é a única que decide.
 */
export function derivePriority(input: PriorityInput): DerivedPriority {
  const affectsGroup = input.impact === "team" || input.impact === "company";

  if (affectsGroup && input.blocked) {
    return { priority: "CRITICAL", reason: "Parado para uma equipe/empresa" };
  }
  if (input.deadlineToday) {
    return { priority: "HIGH", reason: "Compromisso hoje em risco" };
  }
  if (input.blocked) {
    return { priority: "HIGH", reason: "Impede uma pessoa de trabalhar" };
  }
  if (input.kind === "INC") {
    return { priority: "MEDIUM", reason: "Atrapalha, mas há alternativa" };
  }
  return { priority: "LOW", reason: "Pedido sem urgência" };
}

export interface PriorityDeadline {
  hours: number;
  /** `calendar`: horas corridas (plantão 24h). `business`: horas úteis (§3.6). */
  clock: "calendar" | "business";
  /** Como o prazo aparece para o funcionário. */
  label: string;
}

/** Prazos da §3.6: 3 dias úteis = 30 horas úteis, 5 dias úteis = 50 horas úteis. */
export const PRIORITY_DEADLINES: Record<Priority, PriorityDeadline> = {
  CRITICAL: { hours: 1, clock: "calendar", label: "1 hora corrida" },
  HIGH: { hours: 4, clock: "business", label: "4 horas úteis" },
  MEDIUM: { hours: 30, clock: "business", label: "3 dias úteis" },
  LOW: { hours: 50, clock: "business", label: "5 dias úteis" },
};

/** Texto do rascunho e do painel: "Alta: impede uma pessoa de trabalhar. Prazo: 4 horas úteis." */
export function explainPriority(derived: DerivedPriority): string {
  const label = PRIORITY_LABELS[derived.priority];
  const deadline = PRIORITY_DEADLINES[derived.priority].label;
  return `${label}: ${lowercaseFirst(derived.reason)}. Prazo: ${deadline}.`;
}

function lowercaseFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
