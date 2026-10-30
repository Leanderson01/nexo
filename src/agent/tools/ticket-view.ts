import type { GatewayError } from "@/agent/gateways/gateway-error";
import type { TurnWorkspace } from "@/agent/pipeline/turn-workspace";
import type { TicketUpdateAuthor } from "@/domain/enums";
import { PRIORITY_LABELS, TICKET_CATEGORY_LABELS, TICKET_STATUS_LABELS } from "@/domain/labels";
import { PRIORITY_DEADLINES } from "@/domain/priority";
import { formatSlaBadge, isOverdue } from "@/domain/sla";
import type { TicketSummary } from "@/domain/ticket";

// Como um chamado aparece para o modelo: rótulos em português e o prazo já calculado em
// código, para o agent nunca inventar status nem prazo (§6.4).

export interface TicketForModel {
  code: string;
  title: string;
  status: string;
  priority: string;
  category: string;
  deadline: string;
  overdue: boolean;
  lastActivity: string;
}

/** Quem escreveu uma atualização, quando o serviço não manda o nome. */
export const TICKET_UPDATE_AUTHOR_NAMES: Record<TicketUpdateAuthor, string> = {
  employee: "Você",
  agent: "Nexo Assist",
  analyst: "Suporte",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export function describeTicketForModel(ticket: TicketSummary, now: number): TicketForModel {
  return {
    code: ticket.code,
    title: ticket.title,
    status: TICKET_STATUS_LABELS[ticket.status],
    priority: `${PRIORITY_LABELS[ticket.priority]} (prazo de ${PRIORITY_DEADLINES[ticket.priority].label})`,
    category: TICKET_CATEGORY_LABELS[ticket.category],
    deadline: formatSlaBadge(ticket, now),
    overdue: isOverdue(ticket, now),
    lastActivity: formatAgo(now - ticket.lastActivityAt),
  };
}

/** Uma linha por chamado, para o contexto do turno. */
export function ticketLine(ticket: TicketSummary, now: number): string {
  const view = describeTicketForModel(ticket, now);
  return `${view.code} · ${view.title} · ${view.status} · ${view.priority} · ${view.deadline} · última atividade ${view.lastActivity}`;
}

/** "há 6 dias", "há 3 horas", "há poucos minutos". */
export function formatAgo(durationMs: number): string {
  if (durationMs >= DAY_MS) {
    const days = Math.floor(durationMs / DAY_MS);
    return `há ${days} ${days === 1 ? "dia" : "dias"}`;
  }
  if (durationMs >= HOUR_MS) {
    const hours = Math.floor(durationMs / HOUR_MS);
    return `há ${hours} ${hours === 1 ? "hora" : "horas"}`;
  }
  return "há poucos minutos";
}

export const LEGACY_UNAVAILABLE_ERROR =
  "O sistema de chamados está instável e não respondeu depois de 3 tentativas. Não invente dados de chamados.";

/**
 * Erro do serviço de chamados para o modelo. `unavailable` (depois do retry do gateway)
 * marca o turno: ele termina com a mensagem honesta e o "Tentar de novo" (§10).
 */
export function gatewayFailure(
  error: GatewayError,
  workspace: TurnWorkspace,
): { ok: false; error: string } {
  if (error.kind === "unavailable") {
    workspace.legacyUnavailable = true;
    return { ok: false, error: LEGACY_UNAVAILABLE_ERROR };
  }
  return { ok: false, error: error.message };
}
