import {
  CONSOLE_TABS,
  type ConsoleTab,
  type ConversationStatus,
  type HandoffReason,
} from "./enums";

// Regras da fila do console do analista (§7.4): em que aba cada conversa aparece e em que
// ordem. Funções puras; a query `console.listConversations` monta as entradas e aplica.

export interface QueueEntry {
  status: ConversationStatus;
  /** Motivo da transferência, se a conversa passou por um analista. */
  reason: HandoffReason | null;
  /** Em atendimento pelo analista que está olhando a fila. */
  isMine: boolean;
  /** Desde quando espera um analista (o instante da transferência), ou null se não espera. */
  waitingSince: number | null;
  lastMessageAt: number;
}

export function belongsToTab(entry: QueueEntry, tab: ConsoleTab): boolean {
  switch (tab) {
    case "all":
      return entry.status !== "closed";
    case "for_you":
      return entry.status === "waiting_analyst";
    case "with_agent":
      return entry.status === "agent";
    case "mine":
      return entry.status === "with_analyst" && entry.isMine;
    case "closed":
      return entry.status === "closed";
  }
}

/** Quantas conversas cada aba tem, para os contadores do protótipo ("Para você 3"). */
export function countByTab(entries: QueueEntry[]): Record<ConsoleTab, number> {
  const counts = Object.fromEntries(CONSOLE_TABS.map((tab) => [tab, 0])) as Record<
    ConsoleTab,
    number
  >;
  for (const entry of entries) {
    for (const tab of CONSOLE_TABS) {
      if (belongsToTab(entry, tab)) counts[tab] += 1;
    }
  }
  return counts;
}

/** Aguardando ou em atendimento: é o trabalho do analista, e vem antes do resto. */
function needsAnalyst(entry: QueueEntry): boolean {
  return entry.status === "waiting_analyst" || entry.status === "with_analyst";
}

/**
 * Ordem da fila (§7.4): primeiro as conversas com analista, com as críticas na frente e,
 * entre elas, quem espera há mais tempo; depois as outras (com o agent ou encerradas),
 * da atividade mais recente para a mais antiga.
 */
export function compareQueueEntries(a: QueueEntry, b: QueueEntry): number {
  if (needsAnalyst(a) !== needsAnalyst(b)) return needsAnalyst(a) ? -1 : 1;

  if (!needsAnalyst(a)) return b.lastMessageAt - a.lastMessageAt;

  const aCritical = a.reason === "critical";
  const bCritical = b.reason === "critical";
  if (aCritical !== bCritical) return aCritical ? -1 : 1;

  return (a.waitingSince ?? a.lastMessageAt) - (b.waitingSince ?? b.lastMessageAt);
}
