import { z } from "zod";

import type { AgentTool, ToolSession } from "./tool-session";

const input = z.object({
  options: z
    .array(z.string())
    .min(1)
    .max(4)
    .describe('Respostas curtas que o funcionário pode tocar, ex.: ["Só eu", "Minha equipe"].'),
});
type Input = z.infer<typeof input>;
type Output = { ok: true };

/** `offerQuickReplies` (§6.4): opções rápidas abaixo do texto; o clique vira mensagem. */
export function offerQuickRepliesTool(session: ToolSession): AgentTool<Input, Output> {
  return {
    name: "offerQuickReplies",
    label: "ofereceu opções rápidas",
    failureLabel: "manteve as opções do turno",
    description:
      "Anexa opções rápidas à resposta quando a pergunta for fechada. Só uma chamada por turno, para a única pergunta do turno.",
    inputSchema: input,
    describeInput: ({ options }) => options.join(" | "),
    describeOutput: () => "opções anexadas",
    async run({ options }) {
      // Uma pergunta por turno, uma chamada de opções (QA: três chamadas no mesmo turno deixavam
      // botões de uma pergunta embaixo de outra). Opções já postas em código também ficam.
      if (session.workspace.quickReplyLabels() !== null) {
        return {
          ok: false,
          error:
            "As opções deste turno já estão na resposta. Não chame de novo e não faça outra pergunta.",
        };
      }
      const labels = options.map((option) => option.trim()).filter((option) => option !== "");
      session.workspace.offerQuickReplies(labels);
      return { ok: true };
    },
  };
}
