import { z } from "zod";

import { IMPACTS, TICKET_CATEGORIES, TICKET_KINDS, type Impact } from "@/domain/enums";
import { PRIORITY_LABELS } from "@/domain/labels";
import { derivePriority, PRIORITY_DEADLINES } from "@/domain/priority";
import { computeDueAt } from "@/domain/sla";
import type { NewTicket, PrioritySignals } from "@/domain/ticket";
import { normalizeText } from "@/shared/normalize-text";

import type { AgentTool, ToolFailure, ToolSession } from "./tool-session";

const input = z.object({
  kind: z.enum(TICKET_KINDS).describe("INC: algo parou ou não funciona. REQ: pedido."),
  category: z.enum(TICKET_CATEGORIES),
  title: z.string().describe("Título objetivo, passado a limpo (até ~60 caracteres)."),
  description: z
    .string()
    .describe(
      "Descrição em norma culta: sintoma, desde quando, o que já foi tentado (inclusive os passos de artigo da central que não resolveram), impacto e ambiente (sistema operacional).",
    ),
  affected: z.string().nullable().describe('Quem é afetado, ex.: "Equipe Comercial".'),
  impact: z.enum(IMPACTS).nullable(),
  blocked: z.boolean().nullable().describe("Impedido de trabalhar, sem alternativa?"),
  deadlineToday: z.boolean().nullable().describe("Há compromisso hoje que depende disso?"),
  referenceCode: z
    .string()
    .nullable()
    .describe(
      "Chamado antigo a referenciar (só quando findSimilarTickets sugeriu new_with_reference).",
    ),
});
type Input = z.infer<typeof input>;
type Output = {
  ok: true;
  draftNumber: number;
  priority: string;
  deadline: string;
  transfersOnConfirm: boolean;
  instruction: string;
};

/**
 * `proposeTicketDraft` (§6.4). Não cria chamado: grava o rascunho (`pendingActions`), que só
 * vira chamado quando o funcionário confirma no card (§6.5). A prioridade é derivada em código
 * dos sinais (§3.5); o modelo nunca a escolhe.
 */
export function proposeTicketDraftTool(session: ToolSession): AgentTool<Input, Output> {
  return {
    name: "proposeTicketDraft",
    label: "preparou o rascunho do chamado",
    description:
      "Propõe um chamado NOVO como rascunho para o funcionário conferir e confirmar. Chame findSimilarTickets antes. A prioridade é calculada pelo sistema.",
    inputSchema: input,
    describeInput: ({ kind, category, title, referenceCode }) =>
      `${kind} ${category}: "${title}"${referenceCode ? ` (referência ${referenceCode})` : ""}`,
    describeOutput: ({ draftNumber, priority }) =>
      `Rascunho D-${draftNumber} com prioridade ${priority}`,
    async run(fields) {
      const { workspace } = session;
      const blocked = checkPreconditions(fields, session);
      if (blocked) return blocked;

      const signals = resolveSignals(fields, session);
      if (!signals.ok) return signals;

      const derived = derivePriority({ kind: fields.kind, ...signals.value });
      const ticket: NewTicket = {
        kind: fields.kind,
        category: fields.category,
        title: fields.title.trim(),
        description: withOperatingSystem(fields.description, session.understanding.entities.os),
        affected: fields.affected?.trim() || defaultAffected(signals.value.impact, session),
        prioritySignals: signals.value,
        priority: derived.priority,
        priorityReason: derived.reason,
        ...(fields.referenceCode && { reopenedFrom: fields.referenceCode }),
      };
      // Crítico transfere ao confirmar ou cancelar (CriticalPolicy, §6.3); vale também quando o
      // crítico só aparece nos sinais do rascunho.
      const transfersOnConfirm = workspace.criticalCase || derived.priority === "CRITICAL";
      const draft = await session.store.createDraft(
        { kind: "create_ticket", ticket },
        transfersOnConfirm,
      );

      workspace.draft = { pendingActionId: draft.pendingActionId, kind: "create_ticket" };
      workspace.derivedPriority = {
        value: derived.priority,
        reason: derived.reason,
        dueAt: computeDueAt(derived.priority, session.now),
      };
      return {
        ok: true,
        draftNumber: draft.draftNumber,
        priority: PRIORITY_LABELS[derived.priority],
        deadline: PRIORITY_DEADLINES[derived.priority].label,
        transfersOnConfirm,
        instruction: draftInstruction(transfersOnConfirm, fields.referenceCode),
      };
    },
  };
}

/**
 * O sistema operacional que o funcionário informou entra na descrição (§11.2, ambiente) mesmo
 * quando o modelo esquece; "Não sei" não entra.
 */
export function withOperatingSystem(description: string, os: string | null): string {
  const text = description.trim();
  const informed = os?.trim() ?? "";
  if (informed === "" || normalizeText(informed).startsWith("nao sei")) return text;
  if (normalizeText(text).includes(normalizeText(informed))) return text;
  const separator = text === "" || /[.!?]$/.test(text) ? " " : ". ";
  return `${text}${separator}Sistema operacional: ${informed}.`.trim();
}

function draftInstruction(transfersOnConfirm: boolean, referenceCode: string | null): string {
  const reference = referenceCode
    ? ` Cite o ${referenceCode} no texto: ele foi encerrado há mais de 7 dias, então este é um chamado novo que faz referência a ele.`
    : "";
  const ask = transfersOnConfirm
    ? "Diga em uma frase que é um caso crítico, peça para conferir e confirmar e avise que, ao confirmar, um analista é chamado na hora."
    : "Peça para conferir e confirmar no card (Confirmar, Editar, Cancelar); não repita os campos.";
  return `O card do rascunho já aparece.${reference} ${ask}`;
}

function checkPreconditions(fields: Input, session: ToolSession): ToolFailure | null {
  const { workspace } = session;
  if (workspace.draft) {
    return { ok: false, error: "Já há um rascunho proposto neste turno." };
  }
  if (workspace.similarTickets === null) {
    return { ok: false, error: "Chame findSimilarTickets antes de propor um chamado novo." };
  }
  if (!fields.referenceCode) return null;

  const suggestion = workspace.similarTickets.get(fields.referenceCode);
  if (suggestion === "new_with_reference") return null;
  if (suggestion === "update") {
    return { ok: false, error: `${fields.referenceCode} está aberto: use proposeTicketUpdate.` };
  }
  if (suggestion === "reopen") {
    return { ok: false, error: `${fields.referenceCode} pode ser reaberto: use proposeReopen.` };
  }
  return {
    ok: false,
    error: "referenceCode precisa ser um dos chamados devolvidos por findSimilarTickets.",
  };
}

const SIGNAL_QUESTIONS = {
  impact: 'impacto ("Só eu", "Minha equipe", "A empresa toda")',
  blocked: 'bloqueio ("Consegue trabalhar de outro jeito por enquanto?")',
} as const;

/**
 * Sinais do rascunho: o que o modelo mandou ou, na falta, o que o ENTENDER extraiu. Sem
 * impacto ou bloqueio não há como derivar a prioridade: o agent pergunta antes (§8 F4).
 * Urgência não informada conta como "sem compromisso hoje", como em `deriveSignalsPriority`.
 */
function resolveSignals(
  fields: Input,
  session: ToolSession,
): { ok: true; value: PrioritySignals } | ToolFailure {
  const understood = session.understanding.ticketSignals;
  const impact = fields.impact ?? understood.impact;
  const blocked = fields.blocked ?? understood.blocked;
  const deadlineToday = fields.deadlineToday ?? understood.deadlineToday ?? false;

  const missing = [
    impact === null ? SIGNAL_QUESTIONS.impact : null,
    blocked === null ? SIGNAL_QUESTIONS.blocked : null,
  ].filter((question) => question !== null);
  if (impact === null || blocked === null) {
    return {
      ok: false,
      error: `Falta saber: ${missing.join(" e ")}. Pergunte ao funcionário, uma coisa por vez, com offerQuickReplies.`,
    };
  }
  return { ok: true, value: { impact, blocked, deadlineToday } };
}

function defaultAffected(impact: Impact, session: ToolSession): string {
  switch (impact) {
    case "individual":
      return session.employee.name;
    case "team":
      return `Equipe de ${session.employee.department}`;
    case "company":
      return "A empresa toda";
  }
}
