import type { TicketGateway } from "@/agent/gateways/ticket-gateway";
import type { TicketSummary } from "@/domain/ticket";

import type { ToolFailure, ToolSession } from "./tool-session";
import { gatewayFailure } from "./ticket-view";

/**
 * Os chamados do funcionário: os já consultados neste turno ou, se ainda não, uma consulta
 * nova. Serve para conferir que um código citado pelo modelo é mesmo do funcionário.
 */
export async function loadEmployeeTickets(
  session: ToolSession,
  gateway: TicketGateway,
): Promise<{ ok: true; tickets: TicketSummary[] } | ToolFailure> {
  if (session.workspace.employeeTickets) {
    return { ok: true, tickets: session.workspace.employeeTickets };
  }
  const result = await gateway.listMine();
  if (!result.ok) return gatewayFailure(result.error, session.workspace);
  session.workspace.employeeTickets = result.value;
  return { ok: true, tickets: result.value };
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}
