import type { TicketStatus } from "../src/domain/enums";
import { query } from "./_generated/server";
import { requireEmployee } from "./lib/guards";
import { listOwnedTickets } from "./ticketing/reads";

// Notificações do funcionário (§11.6, T17). O evento no chat é gravado pelo serviço de
// chamados (`ticketing/notifyOwner.ts`); o toast lê daqui a atualização mais recente do
// suporte nos chamados dele e aparece quando ela muda com a tela aberta.

export interface SupportUpdateNotice {
  /** Id da linha em `ticketUpdates`: é o que a tela compara para saber se é nova. */
  id: string;
  code: string;
  /** Status novo, se a atualização mudou o status. */
  status: TicketStatus | null;
  text: string;
  authorName: string | null;
  createdAt: number;
}

/**
 * A atualização mais recente do suporte (a mesma regra do evento, `notifiesOwner`) em qualquer
 * chamado do funcionário logado; null se não houver. Lê os chamados dele e a última linha do
 * histórico de cada um: poucos documentos para o volume do projeto (dezenas de chamados por
 * pessoa).
 */
export const latestSupportUpdate = query({
  args: {},
  handler: async (ctx): Promise<SupportUpdateNotice | null> => {
    const employee = await requireEmployee(ctx);
    const tickets = await listOwnedTickets(ctx, employee._id);

    let latest: SupportUpdateNotice | null = null;
    for (const ticket of tickets) {
      const update = await ctx.db
        .query("ticketUpdates")
        .withIndex("by_ticket", (q) => q.eq("ticketId", ticket._id))
        .order("desc")
        // A mesma regra do evento no chat: `notifiesOwner` (só atualização de analista).
        .filter((q) => q.eq(q.field("authorType"), "analyst"))
        .first();
      if (!update) continue;
      if (latest && latest.createdAt >= update.createdAt) continue;
      latest = {
        id: update._id,
        code: ticket.code,
        status: update.fieldChanges?.status ?? null,
        text: update.text,
        authorName: update.authorName ?? null,
        createdAt: update.createdAt,
      };
    }
    return latest;
  },
});
