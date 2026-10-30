import { z } from "zod";

import type { AgentTool, ToolSession } from "./tool-session";
import {
  describeTicketForModel,
  formatAgo,
  gatewayFailure,
  TICKET_UPDATE_AUTHOR_NAMES,
  type TicketForModel,
} from "./ticket-view";

const input = z.object({ code: z.string().describe('Código do chamado, ex.: "INC-20311".') });
type Input = z.infer<typeof input>;
type Output = {
  ok: true;
  ticket: TicketForModel & { description: string; affected: string };
  latestUpdates: { author: string; when: string; text: string }[];
};

/** Atualizações mais recentes que o modelo vê (o card mostra o resto). */
const LATEST_UPDATES = 3;

/**
 * Esconde o código que o funcionário digitou: chamado alheio e inexistente recebem a mesma
 * resposta, sem confirmar que existem (§3.4).
 */
const NOT_FOUND_ERROR =
  'Não encontrado entre os chamados do funcionário. Diga apenas "Não encontrei esse chamado entre os seus", sem repetir o código e sem dizer se ele existe ou de quem é.';

/** `getMyTicket` (§6.4): detalhe de um chamado do funcionário; mostra o card na resposta. */
export function getMyTicketTool(session: ToolSession): AgentTool<Input, Output> {
  return {
    name: "getMyTicket",
    label: "consultou o chamado",
    description:
      "Detalhe e últimas atualizações de um chamado do funcionário. Mostra o card do chamado na resposta.",
    inputSchema: input,
    describeInput: ({ code }) => code,
    describeOutput: ({ ticket }) => `${ticket.code}: ${ticket.status}, ${ticket.deadline}`,
    async run({ code }, { tickets: gateway }) {
      const result = await gateway.getMine(code.trim().toUpperCase());
      if (!result.ok) {
        if (result.error.kind === "not_found") return { ok: false, error: NOT_FOUND_ERROR };
        return gatewayFailure(result.error, session.workspace);
      }

      const ticket = result.value;
      session.workspace.showTicket(ticket.code);
      return {
        ok: true,
        ticket: {
          ...describeTicketForModel(ticket, session.now),
          description: ticket.description,
          affected: ticket.affected,
        },
        latestUpdates: ticket.updates.slice(-LATEST_UPDATES).map((update) => ({
          author: update.authorName ?? TICKET_UPDATE_AUTHOR_NAMES[update.authorType],
          when: formatAgo(session.now - update.createdAt),
          text: update.text,
        })),
      };
    },
  };
}
