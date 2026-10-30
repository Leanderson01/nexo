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
import { isOverdue, type SlaTicket } from "@/domain/sla";
import { isOpen } from "@/domain/ticket-rules";
import { conversationEventText } from "@/features/chat/chat-texts";
import type { UpdatedTicket } from "@/features/notifications/notification-texts";
import type { ConsoleActionError } from "../../../convex/console";

// Textos e cores do console do analista (§7.4, §7.5, protótipos 05 e 06). Funções puras,
// para testar sem a tela.

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Cor (nome do Mantine) de cada motivo de transferência na fila. */
export const HANDOFF_REASON_COLORS: Record<HandoffReason, string> = {
  critical: "red",
  overdue: "orange",
  low_confidence: "yellow",
  requested: "blue",
};

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

export interface QueueStatusInput {
  status: ConversationStatus;
  reason: HandoffReason | null;
  ticketCode: string | null;
  assignedAnalystName: string | null;
  isMine: boolean;
}

/** Linha colorida do item da fila: o motivo, quem atende ou o estado. */
export function queueStatusLine(item: QueueStatusInput): { text: string; color: string } {
  switch (item.status) {
    case "waiting_analyst": {
      const reason = item.reason ?? "requested";
      const label = HANDOFF_REASON_LABELS[reason];
      return {
        text: item.ticketCode ? `${label} · ${item.ticketCode}` : label,
        color: HANDOFF_REASON_COLORS[reason],
      };
    }
    case "with_analyst":
      return item.isMine
        ? { text: "Você está atendendo", color: "blue" }
        : {
            text: `Com ${firstName(item.assignedAnalystName ?? "outro analista")}`,
            color: "gray",
          };
    case "agent":
      return { text: "Agent atendendo", color: "green" };
    case "closed":
      return { text: "Encerrada", color: "gray" };
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
): { label: string; color: string } {
  switch (status) {
    case "waiting_analyst":
      return { label: "Aguardando atendente", color: "yellow" };
    case "with_analyst":
      return isMine
        ? { label: "Em atendimento", color: "blue" }
        : {
            label: `Em atendimento por ${firstName(assignedAnalystName ?? "outro analista")}`,
            color: "gray",
          };
    case "agent":
      return { label: "Com o agent", color: "green" };
    case "closed":
      return { label: "Encerrada", color: "gray" };
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
      return `${conversationEventText(kind, actorName)} · agent pausado`;
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

// ---------- Painel do funcionário ----------

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
