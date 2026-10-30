import type {
  AnalystLevel,
  ConversationEvent,
  ConversationStatus,
  HandoffReason,
} from "@/domain/enums";
import { CONVERSATION_STATUS_LABELS } from "@/domain/labels";
import { ticketUpdatedText, type UpdatedTicket } from "@/features/notifications/notification-texts";
import { nextBusinessDayText } from "./blocks/block-texts";

// Textos do chat que dependem de dados (estado, eventos, banner). Puros, para testar.

/** Teto diário de custo atingido (§12.3): no campo bloqueado e no aviso do "Nova conversa". */
export const DAILY_LIMIT_TEXT =
  "O Nexo Assist atingiu o limite de uso de hoje. Você pode falar com um analista ou tentar amanhã.";

export interface AnalystInfo {
  name: string;
  level: AnalystLevel | null;
}

export function analystLevelLabel(level: AnalystLevel | null): string | null {
  return level ? `Suporte ${level}` : null;
}

function firstName(name: string): string {
  return name.split(" ")[0] ?? name;
}

/** Selo do cabeçalho: "Nexo Assist", "Aguardando analista", "Com Ana, Suporte N1"... */
export function conversationStatusText(
  status: ConversationStatus,
  analyst: AnalystInfo | null,
): string {
  if (status === "with_analyst" && analyst) {
    const level = analystLevelLabel(analyst.level);
    return level ? `Com ${firstName(analyst.name)}, ${level}` : `Com ${firstName(analyst.name)}`;
  }
  return CONVERSATION_STATUS_LABELS[status];
}

/** Linha de evento no histórico (§7.2). */
export function conversationEventText(
  kind: ConversationEvent,
  actorName?: string,
  ticket: UpdatedTicket = {},
): string {
  switch (kind) {
    case "transferred":
      return "Conversa transferida para um analista";
    case "assigned":
      return actorName ? `${actorName} assumiu a conversa` : "Um analista assumiu a conversa";
    case "returned_to_agent":
      return "Você voltou a falar com o Nexo Assist";
    case "closed":
      return "Conversa encerrada";
    case "draft_cancelled":
      return "Rascunho cancelado";
    case "ticket_updated":
      return ticketUpdatedText(ticket);
  }
}

export interface HandoffBannerText {
  title: string;
  /** Aviso de fora do horário; casos críticos têm plantão e não recebem o aviso. */
  outOfHoursNote: string | null;
}

/** O motivo em linguagem simples, para o funcionário (o console usa os rótulos curtos). */
const HANDOFF_REASON_FOR_EMPLOYEE: Record<HandoffReason, string> = {
  requested: "você pediu para falar com uma pessoa",
  critical: "é um caso crítico e precisa de atenção imediata",
  overdue: "seu chamado passou do prazo",
  low_confidence: "o Nexo Assist não teve certeza de como ajudar",
};

/**
 * Texto do banner de transferência (§3.8). Com `transferredAt`, o aviso de fora do horário
 * diz quando o atendimento recomeça ("na segunda-feira, 03 nov, a partir das 8h").
 */
export function handoffBannerText(
  reason: HandoffReason,
  outOfHours: boolean,
  transferredAt?: number,
): HandoffBannerText {
  const when =
    transferredAt === undefined ? "no próximo dia útil" : nextBusinessDayText(transferredAt);
  return {
    title: `Transferimos para um analista: ${HANDOFF_REASON_FOR_EMPLOYEE[reason]}.`,
    outOfHoursNote:
      outOfHours && reason !== "critical"
        ? `Estamos fora do horário de atendimento (8h às 18h, dias úteis). Um analista responde ${when}.`
        : null,
  };
}

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** Data no histórico de conversas: "16 de out., 14:20". */
export function formatConversationDate(timestamp: number): string {
  return DATE_TIME_FORMAT.format(timestamp);
}
