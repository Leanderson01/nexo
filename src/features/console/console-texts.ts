import type {
  AnalystLevel,
  ConversationEvent,
  ConversationStatus,
  HandoffReason,
  MessageRole,
  TicketStatus,
  TicketUpdateAuthor,
} from "@/domain/enums";
import { HANDOFF_REASON_LABELS, TICKET_STATUS_LABELS } from "@/domain/labels";
import { localDay } from "@/domain/local-day";
import { isOverdue, type SlaTicket } from "@/domain/sla";
import { isOpen } from "@/domain/ticket-rules";
import { formatShortDate, formatTime } from "@/features/chat/blocks/block-texts";
import { conversationEventText } from "@/features/chat/chat-texts";
import type { UpdatedTicket } from "@/features/notifications/notification-texts";
import type { ConsoleActionError, TicketUpdateError } from "../../../convex/console";

// Textos e cores do console do analista (§7.4, §7.5, protótipos 05 e 06). Funções puras,
// para testar sem a tela.

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Tons de status da fundação visual (`--nexo-color-status-<tom>-dot/-text/-bg`): âmbar para o
 * que espera, azul para o que está em andamento, verde para o que vai bem, vermelho para a
 * transferência e cinza para o que acabou. `violet` e `orange` existem só para os motivos de
 * transferência (definidos no `.shell` do console, a partir dos avatares da fundação).
 */
export type StatusTone =
  "warning" | "progress" | "success" | "danger" | "neutral" | "violet" | "orange";

/**
 * Uma cor por motivo de transferência (§7.4), a mesma na fila, no card de resumo e nas
 * métricas: crítico em vermelho, pedido do funcionário em violeta, chamado vencido em laranja
 * e baixa confiança no âmbar do "Agent pediu ajuda" do protótipo.
 */
export const HANDOFF_REASON_TONES: Record<HandoffReason, StatusTone> = {
  critical: "danger",
  requested: "violet",
  overdue: "orange",
  low_confidence: "warning",
};

/** Tom do status do chamado no painel do funcionário. */
export const TICKET_STATUS_TONES: Record<TicketStatus, StatusTone> = {
  open: "progress",
  in_progress: "progress",
  awaiting_analyst: "warning",
  awaiting_employee: "warning",
  approved: "success",
  resolved: "neutral",
  closed: "neutral",
};

const AVATAR_COLOR_COUNT = 7;

/** Par de cores do avatar de iniciais (`--nexo-avatar-N`), fixo para cada nome. */
export function avatarColorIndex(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 1_000_003;
  return hash % AVATAR_COLOR_COUNT;
}

export function firstName(name: string): string {
  return name.split(" ")[0] ?? name;
}

/** "Pedro Santos" → "PS", para o avatar. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Tempo decorrido curto, para a fila: "agora", "12 min", "2h 05", "3 dias". */
export function elapsedText(since: number, now: number): string {
  const elapsed = Math.max(0, now - since);
  if (elapsed < MINUTE_MS) return "agora";
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)} min`;
  if (elapsed < DAY_MS) {
    const hours = Math.floor(elapsed / HOUR_MS);
    const minutes = Math.floor((elapsed % HOUR_MS) / MINUTE_MS);
    return `${hours}h ${String(minutes).padStart(2, "0")}`;
  }
  const days = Math.floor(elapsed / DAY_MS);
  return days === 1 ? "1 dia" : `${days} dias`;
}

/** O dia de São Paulo anterior ao de `now`, como "2026-10-29". */
function yesterday(now: number): string {
  return localDay(now - DAY_MS);
}

/**
 * Canto direito do item da fila (§7.4): enquanto a conversa espera um analista, o tempo de
 * espera ("espera 12 min"); fora isso, o horário da última mensagem, como no protótipo.
 */
export function queueCornerText(
  item: { status: ConversationStatus; waitingSince: number | null; lastMessageAt: number },
  now: number,
): string {
  if (item.status === "waiting_analyst" && item.waitingSince !== null) {
    const waited = elapsedText(item.waitingSince, now);
    return waited === "agora" ? "agora" : `espera ${waited}`;
  }
  return queueTimeText(item.lastMessageAt, now);
}

/** Faixa de espera da conversa: "acabou de chegar" no primeiro minuto, depois "espera há 12 min". */
export function waitingBarText(since: number, now: number): string {
  const waited = elapsedText(since, now);
  return waited === "agora" ? "acabou de chegar" : `espera há ${waited}`;
}

/** Horário do item da fila, como no protótipo: "agora", "10:05", "ontem" ou "16 out". */
export function queueTimeText(timestamp: number, now: number): string {
  if (now - timestamp < MINUTE_MS) return "agora";
  if (localDay(timestamp) === localDay(now)) return formatTime(timestamp);
  if (localDay(timestamp) === yesterday(now)) return "ontem";
  return formatShortDate(timestamp);
}

/** Separador de dia no histórico: "Hoje", "Ontem" ou "16 out". */
export function dayLabel(timestamp: number, now: number): string {
  if (localDay(timestamp) === localDay(now)) return "Hoje";
  if (localDay(timestamp) === yesterday(now)) return "Ontem";
  return formatShortDate(timestamp);
}

export interface QueueStatusInput {
  status: ConversationStatus;
  reason: HandoffReason | null;
  ticketCode: string | null;
  /** Confiança do último turno do agent (0 a 1), mostrada quando o motivo é baixa confiança. */
  agentConfidence?: number | null;
  assignedAnalystName: string | null;
  isMine: boolean;
}

export interface StatusLine {
  text: string;
  tone: StatusTone;
  /** Pinta o texto com o tom; senão só o ponto ("Agent atendendo" tem o texto neutro). */
  colorText: boolean;
}

/** Linha de status do item da fila: o motivo, quem atende ou o estado. */
export function queueStatusLine(item: QueueStatusInput): StatusLine {
  switch (item.status) {
    case "waiting_analyst": {
      const reason = item.reason ?? "requested";
      const confidence =
        reason === "low_confidence" && item.agentConfidence != null
          ? `confiança ${Math.round(item.agentConfidence * 100)}%`
          : null;
      const text = [HANDOFF_REASON_LABELS[reason], confidence, item.ticketCode]
        .filter(Boolean)
        .join(" · ");
      return {
        text,
        tone: HANDOFF_REASON_TONES[reason],
        colorText: true,
      };
    }
    case "with_analyst":
      return item.isMine
        ? { text: "Você está atendendo", tone: "progress", colorText: true }
        : {
            text: `Com ${firstName(item.assignedAnalystName ?? "outro analista")}`,
            tone: "neutral",
            colorText: false,
          };
    case "agent":
      return { text: "Agent atendendo", tone: "success", colorText: false };
    case "closed":
      return { text: "Encerrada", tone: "neutral", colorText: false };
  }
}

/** Prévia da última mensagem: "Nexo: ..." para o agent, "Analista: ..." para o analista. */
export function lastMessagePreview(
  lastMessage: { role: MessageRole; text: string } | null,
): string {
  if (!lastMessage) return "Sem mensagens ainda";
  switch (lastMessage.role) {
    case "assistant":
      return `Nexo: ${lastMessage.text}`;
    case "analyst":
      return `Analista: ${lastMessage.text}`;
    default:
      return lastMessage.text;
  }
}

/** Selo de estado no cabeçalho da conversa. */
export function conversationBadge(
  status: ConversationStatus,
  assignedAnalystName: string | null,
  isMine: boolean,
): { label: string; tone: StatusTone } {
  switch (status) {
    case "waiting_analyst":
      return { label: "Aguardando atendente", tone: "warning" };
    case "with_analyst":
      return isMine
        ? { label: "Em atendimento", tone: "progress" }
        : {
            label: `Em atendimento por ${firstName(assignedAnalystName ?? "outro analista")}`,
            tone: "neutral",
          };
    case "agent":
      return { label: "Com o agent", tone: "success" };
    case "closed":
      return { label: "Encerrada", tone: "neutral" };
  }
}

export function analystLevelText(level: AnalystLevel | null): string | null {
  return level ? `Suporte ${level}` : null;
}

/** Confiança do agent no card de resumo: "41% · Baixa". */
export function confidenceText(value: number, levelLabel: string): string {
  return `${Math.round(value * 100)}% · ${levelLabel}`;
}

/**
 * Linha de evento para o analista. O chat fala com o funcionário ("Você voltou a falar com o
 * Nexo Assist"); aqui o texto diz quem fez e o que acontece com o agent.
 */
export function consoleEventText(
  kind: ConversationEvent,
  actorName?: string,
  ticket: UpdatedTicket = {},
): string {
  switch (kind) {
    case "ticket_updated":
      return actorName && ticket.code
        ? `${actorName} atualizou o ${ticket.code}${ticket.status ? `: ${TICKET_STATUS_LABELS[ticket.status]}` : ""}`
        : conversationEventText(kind, actorName, ticket);
    case "assigned":
      return actorName
        ? `${actorName} assumiu · agent pausado`
        : "Analista assumiu · agent pausado";
    case "returned_to_agent":
      return actorName ? `${actorName} devolveu ao agent` : "Devolvida ao agent";
    case "closed":
      return actorName ? `${actorName} encerrou a conversa` : "Conversa encerrada";
    default:
      return conversationEventText(kind, actorName, ticket);
  }
}

// ---------- Erros das ações ----------

export const CONSOLE_ACTION_ERROR_TEXTS: Record<ConsoleActionError, string> = {
  not_found: "Não encontramos essa conversa.",
  invalid_transition:
    "A conversa mudou de estado enquanto isso (outro analista pode ter assumido). Confira e tente de novo.",
  not_assigned: "Só quem assumiu o atendimento pode fazer isso.",
  empty: "Escreva uma mensagem antes de enviar.",
};

export const TICKET_UPDATE_ERROR_TEXTS: Record<TicketUpdateError, string> = {
  not_found: "Não encontramos esse chamado entre os do funcionário.",
  closed: "Esse chamado está fechado e não recebe atualizações.",
  empty: "Escreva a atualização antes de registrar.",
};

// ---------- Painel do funcionário ----------

/**
 * Segunda linha de um chamado no painel: "INC-20298 · Em andamento" ou, encerrado,
 * "INC-19877 · Resolvido em 02 set". O prazo só aparece quando pede atenção (vencido ou
 * vencendo), como `slaNote`.
 */
export function ticketStatusText(ticket: { status: TicketStatus; resolvedAt?: number }): string {
  const label = TICKET_STATUS_LABELS[ticket.status];
  return !isOpen(ticket.status) && ticket.resolvedAt
    ? `${label} em ${formatShortDate(ticket.resolvedAt)}`
    : label;
}

/** "3 abertos · 2 encerrados". */
export function ticketCountsText(statuses: TicketStatus[]): string {
  const open = statuses.filter(isOpen).length;
  const closed = statuses.length - open;
  const openText = open === 1 ? "1 aberto" : `${open} abertos`;
  const closedText = closed === 1 ? "1 encerrado" : `${closed} encerrados`;
  return `${openText} · ${closedText}`;
}

/** Vencidos no topo (§7.4); o resto mantém a ordem recebida (atividade mais recente primeiro). */
export function overdueFirst<T extends SlaTicket>(tickets: T[], now: number): T[] {
  const overdue = tickets.filter((ticket) => isOverdue(ticket, now));
  const others = tickets.filter((ticket) => !isOverdue(ticket, now));
  return [...overdue, ...others];
}

const UPDATE_AUTHOR_LABELS: Record<TicketUpdateAuthor, string> = {
  employee: "Funcionário",
  agent: "Nexo Assist",
  analyst: "Analista",
};

/** Autor de uma atualização no histórico: "Carlos Mendes (Analista)" ou só o papel. */
export function updateAuthorText(authorType: TicketUpdateAuthor, authorName?: string): string {
  const role = UPDATE_AUTHOR_LABELS[authorType];
  return authorName ? `${authorName} · ${role}` : role;
}

/**
 * Texto de uma atualização no histórico do chamado. As transferências gravadas antes da
 * correção levavam o id interno da conversa ("… pelo Nexo Assist (conversa k170…)."), que
 * não diz nada ao analista: sai da tela.
 */
export function ticketUpdateText(text: string): string {
  return text.replace(/\s*\(conversa [a-z0-9]{16,}\)/g, "");
}
