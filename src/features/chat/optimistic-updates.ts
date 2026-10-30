import type { FunctionReturnType } from "convex/server";

import type { api } from "../../../convex/_generated/api";
import type { Id, TableNames } from "../../../convex/_generated/dataModel";

// Estado local das mutations otimistas do chat (UX1). Funções puras: recebem o resultado da
// query como está no cliente e devolvem a cópia com o efeito provável. O Convex aplica na
// hora do clique e desfaz quando a mutation termina (com o resultado real já na query).

export type ConversationSummary = FunctionReturnType<typeof api.conversations.listMine>[number];
export type ConversationHeader = NonNullable<FunctionReturnType<typeof api.conversations.get>>;

/** Prefixo dos ids criados no cliente: o histórico mostra o item, mas sem link. */
const OPTIMISTIC_ID_PREFIX = "optimistic:";

export function optimisticId<Table extends TableNames>(key: string | number): Id<Table> {
  return `${OPTIMISTIC_ID_PREFIX}${key}` as Id<Table>;
}

export function isOptimisticId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_ID_PREFIX);
}

/** "Nova conversa": a conversa aparece no topo do histórico, ainda sem assunto. */
export function withNewConversation(
  conversations: ConversationSummary[],
  id: Id<"conversations">,
  now: number,
): ConversationSummary[] {
  return [{ _id: id, status: "agent", subject: null, lastMessageAt: now }, ...conversations];
}

/** "Falar com um analista": a conversa passa a aguardar o analista. */
export function withAnalystRequested(conversation: ConversationHeader): ConversationHeader {
  if (conversation.status !== "agent") return conversation;
  return { ...conversation, status: "waiting_analyst" };
}

/** O mesmo pedido, no item do histórico. */
export function withSummaryStatus(
  conversations: ConversationSummary[],
  conversationId: string,
  status: ConversationSummary["status"],
): ConversationSummary[] {
  return conversations.map((conversation) =>
    conversation._id === conversationId ? { ...conversation, status } : conversation,
  );
}
