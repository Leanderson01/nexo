import { z } from "zod";

import { handOffToAnalyst } from "@/agent/pipeline/hand-off";
import { HANDOFF_REASONS } from "@/domain/enums";

import { problemStatement } from "@/domain/ticket-description";

import type { AgentTool, ToolSession } from "./tool-session";

const input = z.object({
  reason: z
    .enum(HANDOFF_REASONS)
    .describe(
      "requested: o funcionário pediu; overdue: aceitou ajuda com chamado vencido; low_confidence: você não sabe resolver.",
    ),
  summary: z
    .string()
    .describe(
      "Resumo do caso para o analista: o problema, o que já foi tentado e o chamado envolvido.",
    ),
});
type Input = z.infer<typeof input>;
type Output = { ok: true; instruction: string };

/**
 * `requestHandoff` (§6.4, F5): transfere a conversa com o resumo do caso. Depois disso o
 * agent fica em silêncio até o analista devolver (§5.5).
 */
export function requestHandoffTool(session: ToolSession): AgentTool<Input, Output> {
  return {
    name: "requestHandoff",
    label: "transferiu para um analista",
    description:
      "Transfere a conversa para um analista humano, com um resumo do caso. Use quando o funcionário aceitar ou pedir um analista e o contexto do turno ainda não tiver transferido.",
    inputSchema: input,
    describeInput: ({ reason }) => reason,
    describeOutput: () => "conversa transferida",
    async run({ reason, summary }, { tickets }) {
      const { workspace } = session;
      if (workspace.handoff) return { ok: true, instruction: "A conversa já foi transferida." };

      const ticketCode = workspace.selectedTicketCode ?? workspace.focusedTicket?.code;
      const result = await handOffToAnalyst({
        store: session.store,
        tickets,
        conversationId: session.conversationId,
        handoff: {
          reason,
          summary: withReportedProblem(summary, session),
          ...(ticketCode && { ticketCode }),
        },
      });
      if (!result.ok) {
        return {
          ok: false,
          error: "Não foi possível transferir agora; a conversa já não está com o agent.",
        };
      }
      workspace.handoff = reason;
      return {
        ok: true,
        instruction:
          "Transferido. Diga em uma frase que um analista vai continuar o atendimento e que ele já recebe o resumo. Não faça perguntas.",
      };
    },
  };
}

/** O resumo do modelo mais a fala do funcionário sobre o problema, que não depende dele. */
function withReportedProblem(summary: string, session: ToolSession): string {
  const problem = problemStatement(
    session.facts.employeeTexts,
    "",
    session.facts.quickReplyAnswers,
  ).trim();
  const tried = session.facts.articlesTried.map(
    (title) => `Artigo "${title}" tentado, sem resolver.`,
  );
  return [summary.trim(), problem ? `Problema relatado: "${problem}"` : null, ...tried]
    .filter((line) => line !== null && line !== "")
    .join("\n");
}
