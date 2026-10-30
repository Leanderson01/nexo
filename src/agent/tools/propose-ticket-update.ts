import { z } from "zod";

import { devicesConflict } from "@/domain/devices";
import { PRIORITY_LABELS } from "@/domain/labels";
import { derivePriority } from "@/domain/priority";
import type { TicketDetail, TicketFieldChanges } from "@/domain/ticket";
import type { SaidSignals, SignalName } from "@/domain/signal-evidence";
import type { TicketSignals } from "@/domain/understanding";
import { isOpen } from "@/domain/ticket-rules";

import type { AgentTool, ToolSession } from "./tool-session";
import { groundedDraftText } from "./grounded-text";
import { gatewayFailure } from "./ticket-view";

const input = z.object({
  code: z.string().describe("Chamado ABERTO do funcionário a complementar."),
  text: z
    .string()
    .describe("A informação nova, passada a limpo em norma culta, só com o que foi dito."),
  evidence: z
    .string()
    .describe("Trecho LITERAL da mensagem do funcionário que traz a informação nova."),
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
    failureLabel: "conferiu o chamado",
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

      // Mesmo sistema em outro aparelho (Outlook do celular × do computador): não é duplicidade.
      if (devicesConflict(`${ticket.title} ${ticket.description}`, session.facts.employeeTexts)) {
        return {
          ok: false,
          error: `O ${ticket.code} é sobre outro aparelho ("${ticket.title}"): não é o mesmo problema. Não atualize esse chamado; siga a abertura de um chamado novo (proposeTicketDraft).`,
        };
      }

      // Um sinal que a fala não confirmou mudaria a prioridade: pergunta antes (não descarta).
      const toConfirm = signalToConfirm(
        ticket,
        session.understanding.ticketSignals,
        session.facts.unconfirmedSignals,
      );
      if (toConfirm) {
        workspace.updateNeedsSignal = { code: ticket.code, signal: toConfirm };
        workspace.selectedTicketCode = ticket.code;
        return {
          ok: false,
          error: `Antes de atualizar o ${ticket.code}, falta confirmar ${CONFIRM_LABELS[toConfirm]}. Não pergunte nada: o sistema faz a pergunta, com as opções, depois da sua resposta. Escreva no máximo uma frase curta de acolhimento.`,
        };
      }

      const fieldChanges = reclassify(ticket, session.understanding.ticketSignals);
      const handoffOnConfirm = workspace.criticalCase || fieldChanges?.priority === "CRITICAL";
      const draft = await session.store.createDraft(
        {
          kind: "update_ticket",
          code: ticket.code,
          text: groundedDraftText(fields.text, fields.evidence, session),
          ...(fieldChanges && { fieldChanges }),
        },
        handoffOnConfirm,
      );
      workspace.draft = { pendingActionId: draft.pendingActionId, kind: "update_ticket" };
      workspace.selectedTicketCode = ticket.code;

      const newPriority = fieldChanges?.priority ? PRIORITY_LABELS[fieldChanges.priority] : null;
      return {
        ok: true,
        draftNumber: draft.draftNumber,
        newPriority,
        instruction: newPriority
          ? `O card do rascunho já aparece. Cite ${ticket.code}, explique que a informação nova muda a prioridade para ${newPriority} e peça para confirmar.${handoffOnConfirm ? " Avise que, ao confirmar, um analista é chamado na hora." : ""}`
          : `O card do rascunho já aparece. Diga "Preparei a atualização do ${ticket.code}" (ainda não foi gravada), explique que é melhor complementar esse chamado do que abrir outro e peça para confirmar no card.`,
      };
    },
  };
}

/**
 * Nova prioridade, se os sinais da mensagem mudam a gravidade (§6.5, passo 3). Usa só os
 * sinais que o ENTENDER extraiu do que o funcionário disse: na validação, o modelo do AGIR
 * inventava "bloqueado" e subia a prioridade sem motivo.
 */
const CONFIRM_LABELS: Record<SignalName, string> = {
  impact: "quem é afetado",
  blocked: "se dá para trabalhar de outro jeito",
  deadlineToday: "se há compromisso hoje",
};

const SIGNAL_ORDER: readonly SignalName[] = ["impact", "blocked", "deadlineToday"];

/**
 * O sinal que o ENTENDER trouxe sem confirmação na fala e que mudaria a nova prioridade do
 * chamado; `null` quando nenhum muda nada (aí a atualização segue sem ele).
 */
export function signalToConfirm(
  ticket: Pick<TicketDetail, "kind" | "priority" | "prioritySignals">,
  said: TicketSignals,
  unconfirmed: Partial<SaidSignals>,
): SignalName | null {
  const current = reclassify(ticket, said)?.priority ?? ticket.priority;
  for (const signal of SIGNAL_ORDER) {
    const value = unconfirmed[signal];
    if (value === undefined || value === null) continue;
    const withClaim = reclassify(ticket, { ...said, [signal]: value })?.priority ?? ticket.priority;
    if (withClaim !== current) return signal;
  }
  return null;
}

function reclassify(
  ticket: Pick<TicketDetail, "kind" | "priority" | "prioritySignals">,
  said: TicketSignals,
): TicketFieldChanges | null {
  if (said.impact === null && said.blocked === null && said.deadlineToday === null) return null;
  const derived = derivePriority({
    kind: ticket.kind,
    impact: said.impact ?? ticket.prioritySignals.impact,
    blocked: said.blocked ?? ticket.prioritySignals.blocked,
    deadlineToday: said.deadlineToday ?? ticket.prioritySignals.deadlineToday,
  });
  if (derived.priority === ticket.priority) return null;
  return { priority: derived.priority, priorityReason: derived.reason };
}
