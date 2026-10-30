import type { TicketGateway } from "@/agent/gateways/ticket-gateway";
import type { Handoff } from "@/domain/conversation";
import type { Result } from "@/domain/result";

import type { AgentTransferError } from "../../../convex/agent";
import type { AgentStore } from "./agent-store";

/**
 * Transfere a conversa para um analista (§3.3) e, se há chamado em foco, registra a
 * transferência no chamado (`markHandoff`). A conversa é o que importa: se o legado falhar na
 * anotação, a transferência continua valendo e a falha só vai para o log.
 */
export async function handOffToAnalyst(options: {
  store: Pick<AgentStore, "transfer">;
  tickets: TicketGateway;
  conversationId: string;
  handoff: Omit<Handoff, "at">;
}): Promise<Result<null, AgentTransferError>> {
  const { store, tickets, conversationId, handoff } = options;
  const transferred = await store.transfer(handoff);
  if (!transferred.ok || !handoff.ticketCode) return transferred;

  const marked = await tickets.markHandoff(handoff.ticketCode, conversationId);
  if (!marked.ok) {
    console.warn("[handOffToAnalyst] markHandoff falhou; a conversa já foi transferida", {
      conversationId,
      ticketCode: handoff.ticketCode,
      error: marked.error,
    });
  }
  return transferred;
}
