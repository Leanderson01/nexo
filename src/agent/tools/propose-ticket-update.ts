import { z } from "zod";

import { IMPACTS } from "@/domain/enums";
import { PRIORITY_LABELS } from "@/domain/labels";
import { derivePriority } from "@/domain/priority";
import type { TicketDetail, TicketFieldChanges } from "@/domain/ticket";
import { isOpen } from "@/domain/ticket-rules";

import type { AgentTool, ToolSession } from "./tool-session";
import { gatewayFailure } from "./ticket-view";

const input = z.object({
  code: z.string().describe("Chamado ABERTO do funcionário a complementar."),
  text: z.string().describe("A informação nova, passada a limpo em norma culta."),
  impact: z.enum(IMPACTS).nullable().describe("Só se a informação nova mudar o impacto."),
  blocked: z.boolean().nullable().describe("Só se a informação nova mudar o bloqueio."),
  deadlineToday: z.boolean().nullable().describe("Só se surgiu um compromisso hoje."),
});
type Input = z.infer<typeof input>;
type Output = {
  ok: true;
  draftNumber: number;
  newPriority: string | null;
  instruction: string;
};

const NOT_FOUND_ERROR =
  'Não encontrado entre os chamados do funcionário. Diga apenas "Não encontrei esse chamado entre os seus".';

/**
 * `proposeTicketUpdate` (§6.4, F3): rascunho de atualização de um chamado aberto. Se os sinais
 * novos mudam a gravidade, propõe também a nova prioridade, derivada em código.
 */
export function proposeTicketUpdateTool(session: ToolSession): AgentTool<Input, Output> {
  return {
    name: "proposeTicketUpdate",
    label: "preparou a atualização do chamado",
    description:
      "Propõe, como rascunho, acrescentar uma informação a um chamado aberto do funcionário (em vez de abrir outro).",
    inputSchema: input,
    describeInput: ({ code, text }) => `${code}: "${text}"`,
    describeOutput: ({ draftNumber, newPriority }) =>
      `Rascunho D-${draftNumber}${newPriority ? `, nova prioridade ${newPriority}` : ""}`,
    async run(fields, { tickets: gateway }) {
      const { workspace } = session;
      if (workspace.draft) return { ok: false, error: "Já há um rascunho proposto neste turno." };

      const found = await gateway.getMine(fields.code.trim().toUpperCase());
      if (!found.ok) {
        if (found.error.kind === "not_found") return { ok: false, error: NOT_FOUND_ERROR };
        return gatewayFailure(found.error, workspace);
      }
      const ticket = found.value;
      if (!isOpen(ticket.status)) {
        return {
          ok: false,
          error: `${ticket.code} está encerrado e não recebe atualização: use proposeReopen (até 7 dias) ou proposeTicketDraft com referenceCode.`,
        };
      }

      const fieldChanges = reclassify(ticket, fields);
      const draft = await session.store.createDraft(
        {
          kind: "update_ticket",
          code: ticket.code,
          text: fields.text.trim(),
          ...(fieldChanges && { fieldChanges }),
        },
        workspace.criticalCase || fieldChanges?.priority === "CRITICAL",
      );
      workspace.draft = { pendingActionId: draft.pendingActionId, kind: "update_ticket" };
      workspace.selectedTicketCode = ticket.code;

      const newPriority = fieldChanges?.priority ? PRIORITY_LABELS[fieldChanges.priority] : null;
      return {
        ok: true,
        draftNumber: draft.draftNumber,
        newPriority,
        instruction: newPriority
          ? `O card do rascunho já aparece. Cite ${ticket.code}, explique que a informação nova muda a prioridade para ${newPriority} e peça para confirmar.`
          : `O card do rascunho já aparece. Diga que vai acrescentar a informação ao ${ticket.code} em vez de abrir outro e peça para confirmar.`,
      };
    },
  };
}

/** Nova prioridade, se os sinais novos mudarem a do chamado (§6.5, passo 3). */
function reclassify(ticket: TicketDetail, fields: Input): TicketFieldChanges | null {
  if (fields.impact === null && fields.blocked === null && fields.deadlineToday === null) {
    return null;
  }
  const derived = derivePriority({
    kind: ticket.kind,
    impact: fields.impact ?? ticket.prioritySignals.impact,
    blocked: fields.blocked ?? ticket.prioritySignals.blocked,
    deadlineToday: fields.deadlineToday ?? ticket.prioritySignals.deadlineToday,
  });
  if (derived.priority === ticket.priority) return null;
  return { priority: derived.priority, priorityReason: derived.reason };
}
