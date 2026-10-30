import { z } from "zod";

import { canReopen } from "@/domain/ticket-rules";

import type { AgentTool, ToolSession } from "./tool-session";
import { gatewayFailure } from "./ticket-view";

const input = z.object({
  code: z.string().describe("Chamado resolvido há até 7 dias, do próprio funcionário."),
  reason: z
    .string()
    .describe("Por que reabrir, passado a limpo: o problema voltou e o que já foi tentado."),
});
type Input = z.infer<typeof input>;
type Output = { ok: true; draftNumber: number; instruction: string };

/** `proposeReopen` (§6.4, §3.2): rascunho de reabertura, só dentro dos 7 dias corridos. */
export function proposeReopenTool(session: ToolSession): AgentTool<Input, Output> {
  return {
    name: "proposeReopen",
    label: "preparou a reabertura do chamado",
    description:
      "Propõe, como rascunho, reabrir um chamado resolvido há até 7 dias quando o mesmo problema voltou.",
    inputSchema: input,
    describeInput: ({ code }) => code,
    describeOutput: ({ draftNumber }) => `Rascunho D-${draftNumber}`,
    async run({ code, reason }, { tickets: gateway }) {
      const { workspace } = session;
      if (workspace.draft) return { ok: false, error: "Já há um rascunho proposto neste turno." };

      const found = await gateway.getMine(code.trim().toUpperCase());
      if (!found.ok) {
        if (found.error.kind === "not_found") {
          return { ok: false, error: "Não encontrado entre os chamados do funcionário." };
        }
        return gatewayFailure(found.error, workspace);
      }
      const ticket = found.value;
      if (!canReopen(ticket, session.now)) {
        return {
          ok: false,
          error: `${ticket.code} não pode ser reaberto (só resolvidos há até 7 dias): proponha um chamado novo com proposeTicketDraft e referenceCode ${ticket.code}.`,
        };
      }

      const draft = await session.store.createDraft(
        { kind: "reopen_ticket", code: ticket.code, reason: reason.trim() },
        false,
      );
      workspace.draft = { pendingActionId: draft.pendingActionId, kind: "reopen_ticket" };
      workspace.selectedTicketCode = ticket.code;
      return {
        ok: true,
        draftNumber: draft.draftNumber,
        instruction: `O card do rascunho já aparece. Diga que o ${ticket.code} foi resolvido há pouco e que propõe reabri-lo em vez de abrir outro; peça para confirmar.`,
      };
    },
  };
}
