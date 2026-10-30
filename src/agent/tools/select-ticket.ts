import { z } from "zod";

import { loadEmployeeTickets, normalizeCode } from "./employee-tickets";
import type { AgentTool, ToolSession } from "./tool-session";
import { describeTicketForModel, type TicketForModel } from "./ticket-view";

const input = z.object({ code: z.string().describe("Chamado do funcionário que entra em foco.") });
type Input = z.infer<typeof input>;
type Output = { ok: true; ticket: TicketForModel };

/** `selectTicket` (§6.4): põe um chamado do funcionário em foco na conversa. */
export function selectTicketTool(session: ToolSession): AgentTool<Input, Output> {
  return {
    name: "selectTicket",
    label: "selecionou o chamado",
    description:
      "Define o chamado em foco na conversa (ex.: depois que o funcionário escolheu no seletor).",
    inputSchema: input,
    describeInput: ({ code }) => code,
    describeOutput: ({ ticket }) => `em foco: ${ticket.code}`,
    async run({ code }, { tickets: gateway }) {
      const loaded = await loadEmployeeTickets(session, gateway);
      if (!loaded.ok) return loaded;

      const ticket = loaded.tickets.find((candidate) => candidate.code === normalizeCode(code));
      if (!ticket) {
        return { ok: false, error: "Não encontrado entre os chamados do funcionário." };
      }
      session.workspace.selectedTicketCode = ticket.code;
      return { ok: true, ticket: describeTicketForModel(ticket, session.now) };
    },
  };
}
