import { BUSINESS_TIME_ZONE, addBusinessHours } from "@/domain/business-hours";
import type { PendingActionStatus, Priority, TicketStatus } from "@/domain/enums";
import type { PendingAction } from "@/domain/pending-action";
import { PRIORITY_DEADLINES } from "@/domain/priority";
import type { SlaState } from "@/domain/sla";

// Textos e cores dos blocos de mensagem (§7.2). Funções puras, para testar sem a tela.
// Datas sempre no fuso do service desk, para não depender do fuso da máquina.

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// ---------- Datas ----------

const timeFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: BUSINESS_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

const dayMonthFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: BUSINESS_TIME_ZONE,
  day: "2-digit",
  month: "short",
});

const weekdayFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: BUSINESS_TIME_ZONE,
  weekday: "long",
});

const calendarDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "13:43". */
export function formatTime(timestamp: number): string {
  return timeFormat.format(timestamp);
}

/** "16 out" (o protótipo usa o mês sem ponto). */
export function formatShortDate(timestamp: number): string {
  return dayMonthFormat.format(timestamp).replace(" de ", " ").replace(".", "");
}

/** "16 out, 14:20". */
export function formatDateTime(timestamp: number): string {
  return `${formatShortDate(timestamp)}, ${formatTime(timestamp)}`;
}

function isSameDay(a: number, b: number): boolean {
  return calendarDayFormat.format(a) === calendarDayFormat.format(b);
}

/** "agora há pouco", "há 5 min", "há 3h", "há 1 dia", "há 5 dias". */
export function relativeTimeText(timestamp: number, now: number): string {
  const elapsed = Math.max(0, now - timestamp);
  if (elapsed < MINUTE_MS) return "agora há pouco";
  if (elapsed < HOUR_MS) return `há ${Math.floor(elapsed / MINUTE_MS)} min`;
  if (elapsed < DAY_MS) return `há ${Math.floor(elapsed / HOUR_MS)}h`;
  const days = Math.floor(elapsed / DAY_MS);
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}

// ---------- Prioridade e prazo ----------

/** Prazo do rascunho: "resposta até 13:43" no mesmo dia, senão "resposta até 31 out, 09:00". */
export function draftDeadlineText(dueAt: number, now: number): string {
  const when = isSameDay(dueAt, now) ? formatTime(dueAt) : formatDateTime(dueAt);
  return `resposta até ${when}`;
}

/** Motivo da prioridade com o prazo: "Compromisso hoje em risco · prazo de 4 horas úteis". */
export function priorityMotiveText(priority: Priority, reason: string): string {
  return `${reason} · prazo de ${PRIORITY_DEADLINES[priority].label}`;
}

// ---------- Transferência ----------

/**
 * Quando o atendimento humano recomeça, para o aviso de fora do horário:
 * "hoje, a partir das 8h" ou "na segunda-feira, 3 nov, a partir das 8h".
 */
export function nextBusinessDayText(at: number): string {
  // Somar zero horas úteis leva o instante para o próximo início de expediente.
  const start = addBusinessHours(at, 0);
  const startHour = `a partir das ${Number(formatTime(start).slice(0, 2))}h`;
  if (isSameDay(start, at)) return `hoje, ${startHour}`;
  return `na ${weekdayFormat.format(start)}, ${formatShortDate(start)}, ${startHour}`;
}

// ---------- Rascunho ----------

/** Linha de cima do card: "Novo chamado", "Atualização do INC-20395", "Reabertura do INC-20150". */
export function draftKindText(action: PendingAction): string {
  switch (action.kind) {
    case "create_ticket":
      return "Novo chamado";
    case "update_ticket":
      return `Atualização do ${action.code}`;
    case "reopen_ticket":
      return `Reabertura do ${action.code}`;
  }
}

/** "Rascunho D-381" (decisão 12). */
export function draftNumberText(draftNumber: number): string {
  return `Rascunho D-${draftNumber}`;
}

/** Selo do canto do card de rascunho. */
export function draftStatusText(
  status: PendingActionStatus,
  resultTicketCode: string | null,
): string {
  switch (status) {
    case "pending":
      return "Aguardando confirmação";
    case "confirmed":
      return resultTicketCode ? `Confirmado · ${resultTicketCode}` : "Confirmado";
    case "cancelled":
      return "Cancelado";
    case "superseded":
      return "Substituído por um rascunho novo";
  }
}

// ---------- Seletor de chamados ----------

/** O que vai como mensagem do funcionário ao escolher: "INC-20311 · Notebook lento". */
export function ticketChoiceText(code: string, title: string | null): string {
  return title ? `${code} · ${title}` : code;
}

// ---------- Cores (nomes de cor do Mantine) ----------

export const TICKET_STATUS_COLORS: Record<TicketStatus, string> = {
  open: "blue",
  in_progress: "blue",
  awaiting_analyst: "yellow",
  awaiting_employee: "violet",
  approved: "teal",
  resolved: "teal",
  closed: "gray",
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  CRITICAL: "red",
  HIGH: "orange",
  MEDIUM: "gray",
  LOW: "gray",
};

/** Cor do selo de prazo; "no prazo" e "encerrado" ficam neutros. */
export const SLA_STATE_COLORS: Record<SlaState, string> = {
  overdue: "orange",
  due_soon: "yellow",
  paused: "violet",
  on_time: "teal",
  closed: "gray",
};

export const DRAFT_STATUS_COLORS: Record<PendingActionStatus, string> = {
  pending: "yellow",
  confirmed: "teal",
  cancelled: "gray",
  superseded: "gray",
};
