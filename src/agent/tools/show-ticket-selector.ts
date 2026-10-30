import { z } from "zod";

import { loadEmployeeTickets, normalizeCode } from "./employee-tickets";
import type { AgentTool, ToolSession } from "./tool-session";

const input = z.object({
  codes: z.array(z.string()).min(2).describe("Chamados do funcionário para ele escolher."),
  prompt: z.string().describe('A pergunta do seletor, ex.: "De qual chamado você fala?".'),
});
type Input = z.infer<typeof input>;
type Output = { ok: true; shown: string[]; instruction: string };

/**
 * `showTicketSelector` (§6.4, F2): lista clicável de chamados do funcionário. Códigos que
 * não são dele ficam de fora, sem avisar quais (§3.4).
 */
export function showTicketSelectorTool(session: ToolSession): AgentTool<Input, Output> {
  return {
    name: "showTicketSelector",
    label: "mostrou seus chamados para escolher",
    description:
      "Mostra um seletor com 2 ou mais chamados do funcionário para ele escolher de qual fala.",
    inputSchema: input,
    describeInput: ({ codes }) => codes.join(", "),
    describeOutput: ({ shown }) => shown.join(", "),
    async run({ codes, prompt }, { tickets: gateway }) {
      const loaded = await loadEmployeeTickets(session, gateway);
      if (!loaded.ok) return loaded;

      const own = new Set(loaded.tickets.map((ticket) => ticket.code));
      const shown = [...new Set(codes.map(normalizeCode))].filter((code) => own.has(code));
      if (shown.length < 2) {
        return {
          ok: false,
          error:
            "O seletor precisa de 2 ou mais chamados do funcionário; com um só, use getMyTicket.",
        };
      }
      session.workspace.showTicketSelector(shown, prompt.trim());
      return {
        ok: true,
        shown,
        instruction: "O seletor já mostra a pergunta: não repita a pergunta no texto.",
      };
    },
  };
}
