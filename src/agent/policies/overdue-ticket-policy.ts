import { PRIORITY_LABELS } from "@/domain/labels";
import { PRIORITY_DEADLINES } from "@/domain/priority";
import { formatSlaBadge, isOverdue } from "@/domain/sla";
import type { TicketSummary } from "@/domain/ticket";

import type { Policy, PolicyResult, TurnContext } from "./policy";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * §6.3, item 4: o chamado em foco está vencido. O agent diz isso, explica o prazo e
 * **oferece** um analista com opções rápidas; transfere só se o funcionário aceitar (§3.3).
 */
export const overdueTicketPolicy: Policy = {
  name: "OverdueTicketPolicy",
  evaluate(ctx: TurnContext): PolicyResult {
    const ticket = ctx.focusedTicket;
    if (!ticket) {
      return { outcome: "not_applicable", note: "Nenhum chamado em foco." };
    }
    if (!isOverdue(ticket, ctx.now)) {
      return {
        outcome: "not_applicable",
        note: `${ticket.code}: ${formatSlaBadge(ticket, ctx.now)}.`,
      };
    }
    return {
      outcome: "triggered",
      action: { kind: "offer_handoff", reason: "overdue" },
      explanation: explainOverdue(ticket, ctx.now),
    };
  },
};

/** "INC-20311 sem atualização há 6 dias; prazo da prioridade Média é de 3 dias úteis." */
export function explainOverdue(ticket: TicketSummary, now: number): string {
  const elapsed = formatElapsed(now - ticket.lastActivityAt);
  const priority = PRIORITY_LABELS[ticket.priority];
  const deadline = PRIORITY_DEADLINES[ticket.priority].label;
  return `${ticket.code} sem atualização há ${elapsed}; prazo da prioridade ${priority} é de ${deadline}.`;
}

/** Tempo corrido arredondado para baixo: "6 dias", "1 dia", "5 horas", "40 minutos". */
function formatElapsed(durationMs: number): string {
  if (durationMs >= DAY_MS) return plural(Math.floor(durationMs / DAY_MS), "dia", "dias");
  if (durationMs >= HOUR_MS) return plural(Math.floor(durationMs / HOUR_MS), "hora", "horas");
  return plural(Math.max(1, Math.floor(durationMs / MINUTE_MS)), "minuto", "minutos");
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
