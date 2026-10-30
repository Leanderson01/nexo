import type { FunctionReturnType } from "convex/server";

import type { AnalystLevel, TicketStatus } from "@/domain/enums";
import type { TicketDetail, TicketSummary } from "@/domain/ticket";
import type { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// Estado local das ações do console com atualização otimista (UX1). Funções puras: recebem o
// resultado da query como está no cliente e devolvem a cópia com o efeito provável. O Convex
// aplica no clique e desfaz quando a mutation termina, com o resultado real já na query; se a
// mutation recusar (ex.: outro analista assumiu antes), a tela volta ao que era e o erro aparece.

export type ConsoleConversationData = NonNullable<
  FunctionReturnType<typeof api.console.getConversation>
>;
export type ConsoleMessage = NonNullable<
  FunctionReturnType<typeof api.console.listMessages>
>[number];
export type ConsoleQueue = FunctionReturnType<typeof api.console.listConversations>;
type QueueItem = ConsoleQueue["items"][number];

/** Quem está no console, como `auth.currentPerson` devolve. */
export interface ConsoleAnalyst {
  name: string;
  level?: AnalystLevel;
}

// ---------- Mensagem do analista ----------

/** A mensagem entra no fim do histórico com o reloginho, até a salva chegar. */
export function withAnalystMessage(
  messages: ConsoleMessage[],
  message: {
    id: Id<"messages">;
    conversationId: Id<"conversations">;
    text: string;
    analyst: ConsoleAnalyst | null;
    now: number;
  },
): ConsoleMessage[] {
  return [
    ...messages,
    {
      _id: message.id,
      _creationTime: message.now,
      conversationId: message.conversationId,
      role: "analyst",
      parts: [{ type: "text", text: message.text.trim() }],
      status: "complete",
      createdAt: message.now,
      analyst: message.analyst
        ? { name: message.analyst.name, level: message.analyst.level ?? null }
        : null,
      receipt: "sending",
    },
  ];
}

// ---------- Estado da conversa ----------

/** Assumir: a conversa passa a ser deste analista, e o campo de resposta aparece. */
export function withAssigned(
  conversation: ConsoleConversationData,
  analyst: ConsoleAnalyst | null,
  now: number,
): ConsoleConversationData {
  if (conversation.status !== "waiting_analyst") return conversation;
  return {
    ...conversation,
    status: "with_analyst",
    isMine: true,
    assignedAnalyst: analyst ? { name: analyst.name, level: analyst.level ?? null } : null,
    analystReadAt: now,
  };
}

/** Devolver ao agent: volta para o Nexo Assist, sem analista. */
export function withReturnedToAgent(
  conversation: ConsoleConversationData,
): ConsoleConversationData {
  if (conversation.status !== "waiting_analyst" && conversation.status !== "with_analyst") {
    return conversation;
  }
  return { ...conversation, status: "agent", isMine: false, assignedAnalyst: null };
}

/** Encerrar: a conversa fica encerrada, sem ninguém atendendo. */
export function withClosed(
  conversation: ConsoleConversationData,
  now: number,
): ConsoleConversationData {
  if (conversation.status === "closed") return conversation;
  return {
    ...conversation,
    status: "closed",
    isMine: false,
    assignedAnalyst: null,
    closedAt: now,
  };
}

/** Marcar como lida: a leitura da equipe vai até agora. */
export function withRead(
  conversation: ConsoleConversationData,
  now: number,
): ConsoleConversationData {
  return { ...conversation, analystReadAt: now };
}

// ---------- Fila ----------

export type QueueChange = Partial<
  Pick<QueueItem, "status" | "isMine" | "assignedAnalystName" | "waitingSince" | "unread">
>;

export const QUEUE_CHANGES = {
  assigned: (analyst: ConsoleAnalyst | null): QueueChange => ({
    status: "with_analyst",
    isMine: true,
    assignedAnalystName: analyst?.name ?? null,
    unread: 0,
  }),
  returned: {
    status: "agent",
    isMine: false,
    assignedAnalystName: null,
    waitingSince: null,
    unread: 0,
  } satisfies QueueChange,
  closed: {
    status: "closed",
    isMine: false,
    assignedAnalystName: null,
    waitingSince: null,
    unread: 0,
  } satisfies QueueChange,
  read: { unread: 0 } satisfies QueueChange,
};

/**
 * O item da conversa na fila com a mudança. A aba e os contadores não são refeitos aqui: a
 * resposta do servidor, logo depois, põe o item na aba certa.
 */
export function withQueueChange(
  queue: ConsoleQueue,
  conversationId: string,
  change: QueueChange,
): ConsoleQueue {
  return {
    ...queue,
    items: queue.items.map((item) => (item._id === conversationId ? { ...item, ...change } : item)),
  };
}

// ---------- Chamado ----------

/** "Registrar atualização": a atualização entra no histórico do chamado, com o status novo. */
export function withTicketUpdate(
  ticket: TicketDetail,
  update: { text: string; status?: TicketStatus; analystName: string | null; now: number },
): TicketDetail {
  return {
    ...ticket,
    status: update.status ?? ticket.status,
    lastActivityAt: update.now,
    updates: [
      ...ticket.updates,
      {
        authorType: "analyst",
        authorName: update.analystName ?? undefined,
        text: update.text.trim(),
        fieldChanges: update.status === undefined ? undefined : { status: update.status },
        createdAt: update.now,
      },
    ],
  };
}

/** O status novo também na lista de chamados do painel. */
export function withTicketSummaryStatus(
  tickets: TicketSummary[],
  code: string,
  status: TicketStatus,
  now: number,
): TicketSummary[] {
  return tickets.map((ticket) =>
    ticket.code === code ? { ...ticket, status, lastActivityAt: now } : ticket,
  );
}
