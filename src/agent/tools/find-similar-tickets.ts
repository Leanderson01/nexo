import { z } from "zod";

import { TICKET_CATEGORIES, type TicketCategory } from "@/domain/enums";
import { TICKET_CATEGORY_LABELS } from "@/domain/labels";
import { categoryFromSpeech } from "@/domain/ticket-classification";
import {
  findDuplicateCandidates,
  suggestDuplicateAction,
  type DuplicateAction,
} from "@/domain/ticket-rules";

import type { AgentTool, ToolSession } from "./tool-session";
import {
  describeTicketForModel,
  formatAgo,
  gatewayFailure,
  type TicketForModel,
} from "./ticket-view";

const input = z.object({
  description: z.string().describe("O problema descrito pelo funcionário, em poucas palavras."),
  category: z.enum(TICKET_CATEGORIES).nullable(),
});
type Input = z.infer<typeof input>;

export interface SimilarTicket extends TicketForModel {
  suggestedAction: DuplicateAction;
  whatToDo: string;
  resolved: string | null;
}
type Output = { ok: true; similar: SimilarTicket[]; instruction: string };

/** O que fazer com cada sugestão do domínio (§3.2, decisão 15). */
const WHAT_TO_DO: Record<DuplicateAction, string> = {
  update:
    "Aberto: se for o mesmo problema, proponha atualizar com proposeTicketUpdate em vez de criar outro.",
  reopen: "Resolvido há até 7 dias: se for o mesmo problema, proponha reabrir com proposeReopen.",
  new_with_reference:
    "Encerrado há mais de 7 dias: se for o mesmo problema, proponha um chamado novo com proposeTicketDraft e referenceCode igual a este código.",
};

/**
 * `findSimilarTickets` (§6.4): candidatos a duplicidade do próprio funcionário, já com a
 * sugestão do domínio (atualizar, reabrir ou criar novo com referência). Obrigatória antes
 * de propor um chamado novo.
 */
export function findSimilarTicketsTool(session: ToolSession): AgentTool<Input, Output> {
  // A categoria corrigida em código (sistema de vendas em "Outros" vira Software) vale na busca
  // e no painel, com o rótulo legível (R3: o painel mostrava "em other").
  const finalCategory = (category: TicketCategory | null) =>
    category && categoryFromSpeech(category, session.facts.employeeTexts);
  return {
    name: "findSimilarTickets",
    label: "procurou chamados parecidos",
    description:
      "Procura chamados parecidos do funcionário (abertos e encerrados há até 30 dias), com a sugestão de atualizar, reabrir ou criar novo com referência. Chame sempre antes de propor um chamado.",
    inputSchema: input,
    describeInput: ({ description, category }) => {
      const final = finalCategory(category);
      return final ? `"${description}" em ${TICKET_CATEGORY_LABELS[final]}` : `"${description}"`;
    },
    describeOutput: ({ similar }) =>
      similar.length === 0
        ? "nenhum parecido"
        : similar.map((ticket) => `${ticket.code} → ${ticket.suggestedAction}`).join(", "),
    async run({ description, category }, { tickets: gateway }) {
      const result = await gateway.findSimilar({ description, category: finalCategory(category) });
      if (!result.ok) return gatewayFailure(result.error, session.workspace);

      const candidates = findDuplicateCandidates(result.value, session.now);
      const suggestions = new Map(
        candidates.map((ticket) => [ticket.code, suggestDuplicateAction(ticket, session.now)]),
      );
      session.workspace.similarTickets = suggestions;

      return {
        ok: true,
        similar: candidates.map((ticket) => {
          const suggestedAction = suggestions.get(ticket.code) ?? "update";
          return {
            ...describeTicketForModel(ticket, session.now),
            suggestedAction,
            whatToDo: WHAT_TO_DO[suggestedAction],
            resolved: ticket.resolvedAt ? formatAgo(session.now - ticket.resolvedAt) : null,
          };
        }),
        instruction:
          candidates.length === 0
            ? "Nenhum parecido: pode propor um chamado novo."
            : "Compare o título de cada parecido com o problema atual. Só é o mesmo problema se for a mesma falha no mesmo sistema (mesma categoria não basta). Se for, chame AGORA a tool do whatToDo dele (o card de rascunho é a pergunta de confirmação: não pergunte em texto se pode) e cite o código no texto; se não for, ignore-o e não use referenceCode.",
      };
    },
  };
}
