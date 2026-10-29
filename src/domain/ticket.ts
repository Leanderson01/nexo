import type {
  Impact,
  Priority,
  TicketCategory,
  TicketKind,
  TicketStatus,
  TicketUpdateAuthor,
} from "./enums";

/** "INC-20311", "REQ-10442". */
export type TicketCode = string;

/** Sinais que o LLM extrai; a prioridade é derivada deles em código (§3.5). */
export interface PrioritySignals {
  impact: Impact;
  blocked: boolean;
  deadlineToday: boolean;
}

export interface DerivedPriority {
  priority: Priority;
  reason: string;
}

export interface Ticket {
  code: TicketCode;
  kind: TicketKind;
  category: TicketCategory;
  priority: Priority;
  priorityReason: string;
  /** Guardados para recalcular a prioridade quando uma atualização muda a gravidade. */
  prioritySignals: PrioritySignals;
  status: TicketStatus;
  title: string;
  description: string;
  /** Quem é afetado, em texto ("Somente você", "Equipe de Operações"). */
  affected: string;
  createdAt: number;
  /** Criação ou última atividade do suporte; base do prazo (§3.6). */
  lastActivityAt: number;
  resolvedAt?: number;
  reopenedFrom?: TicketCode;
}

export type TicketSummary = Pick<
  Ticket,
  "code" | "kind" | "category" | "priority" | "status" | "title" | "createdAt" | "lastActivityAt"
> & { resolvedAt?: number };

export interface TicketFieldChanges {
  status?: TicketStatus;
  priority?: Priority;
  priorityReason?: string;
  category?: TicketCategory;
}

export interface TicketUpdate {
  authorType: TicketUpdateAuthor;
  authorName?: string;
  text: string;
  fieldChanges?: TicketFieldChanges;
  createdAt: number;
}

export interface TicketDetail extends Ticket {
  updates: TicketUpdate[];
}

export interface NewTicket {
  kind: TicketKind;
  category: TicketCategory;
  title: string;
  description: string;
  affected: string;
  prioritySignals: PrioritySignals;
  priority: Priority;
  priorityReason: string;
  reopenedFrom?: TicketCode;
}

export interface TicketUpdateInput {
  text: string;
  fieldChanges?: TicketFieldChanges;
}

export interface TicketFilter {
  onlyOpen?: boolean;
}

export interface SimilarityQuery {
  description: string;
  category: TicketCategory | null;
}
