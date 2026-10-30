import { z } from "zod";

import type { AgentTool, ToolSession } from "./tool-session";
import { describeTicketForModel, gatewayFailure, type TicketForModel } from "./ticket-view";

const input = z.object({
  onlyOpen: z
    .boolean()
    .nullable()
    .describe("true para só os abertos; null ou false para todos (inclui resolvidos recentes)."),
});
type Input = z.infer<typeof input>;
type Output = { ok: true; tickets: TicketForModel[] };

/** `listMyTickets` (§6.4): os chamados do funcionário logado, com o prazo calculado. */
export function listMyTicketsTool(session: ToolSession): AgentTool<Input, Output> {
  return {
    name: "listMyTickets",
    label: "consultou seus chamados",
    description:
      "Lista os chamados do funcionário logado com status, prioridade e prazo já calculados.",
    inputSchema: input,
    describeInput: ({ onlyOpen }) => (onlyOpen ? "só os abertos" : "todos"),
    describeOutput: ({ tickets }) =>
      tickets.length === 0
        ? "nenhum chamado"
        : `${tickets.length} chamado(s): ${tickets.map((ticket) => ticket.code).join(", ")}`,
    async run({ onlyOpen }, { tickets: gateway }) {
      const result = await gateway.listMine(onlyOpen ? { onlyOpen: true } : undefined);
      if (!result.ok) return gatewayFailure(result.error, session.workspace);

      if (!onlyOpen) session.workspace.employeeTickets = result.value;
      return {
        ok: true,
        tickets: result.value.map((ticket) => describeTicketForModel(ticket, session.now)),
      };
    },
  };
}
