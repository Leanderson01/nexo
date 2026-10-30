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
    description:
      "Anexa opções rápidas à resposta quando a pergunta for fechada. Uma nova chamada substitui a anterior.",
    inputSchema: input,
    describeInput: ({ options }) => options.join(" | "),
    describeOutput: () => "opções anexadas",
    async run({ options }) {
      const labels = options.map((option) => option.trim()).filter((option) => option !== "");
      session.workspace.offerQuickReplies(labels);
      return { ok: true };
    },
  };
}
