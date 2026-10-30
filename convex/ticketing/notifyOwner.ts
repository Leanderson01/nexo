import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { TicketFieldChanges } from "../../src/domain/ticket";

// Aviso ao dono quando o suporte atualiza um chamado dele (§11.6, T17). Num legado de verdade
// isto seria um webhook do sistema de chamados para o Nexo; aqui os dois vivem no mesmo Convex
// e o aviso é gravado na mesma transação da atualização, então nunca sai em dobro nem se perde.
//
// O aviso é uma mensagem `system` com o evento `ticket_updated` na conversa em andamento do
// funcionário. Sem conversa aberta, não há onde escrever: o toast do chat
// (`notifications.latestSupportUpdate`) avisa do mesmo jeito, porque lê o histórico do chamado.

/** A conversa em andamento do funcionário: a mais recente que não foi encerrada. */
export async function findOngoingConversation(
  ctx: QueryCtx,
  employeeId: Id<"people">,
): Promise<Doc<"conversations"> | null> {
  return await ctx.db
    .query("conversations")
    .withIndex("by_employee_lastMessage", (q) => q.eq("employeeId", employeeId))
    .order("desc")
    .filter((q) => q.neq(q.field("status"), "closed"))
    .first();
}

/**
 * Grava "O chamado INC-20311 foi atualizado: Em andamento" na conversa em andamento do dono.
 * Não mexe em `lastMessageAt`: o aviso não muda a ordem do histórico nem da fila do console.
 */
export async function notifyOwnerInChat(
  ctx: MutationCtx,
  ticket: Doc<"tickets">,
  update: { fieldChanges?: TicketFieldChanges; authorName?: string },
  now: number,
): Promise<void> {
  const conversation = await findOngoingConversation(ctx, ticket.ownerId);
  if (!conversation) return;

  await ctx.db.insert("messages", {
    conversationId: conversation._id,
    role: "system",
    parts: [
      {
        type: "event",
        kind: "ticket_updated",
        ticketCode: ticket.code,
        ...(update.authorName !== undefined && { actorName: update.authorName }),
        ...(update.fieldChanges?.status !== undefined && {
          ticketStatus: update.fieldChanges.status,
        }),
      },
    ],
    status: "complete",
    createdAt: now,
  });
}
