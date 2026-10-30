import { z } from "zod";

import { TICKET_CATEGORIES, TICKET_KINDS, type Impact } from "@/domain/enums";
import { nextMissingSignal } from "@/domain/intake-questions";
import { PRIORITY_LABELS, TICKET_CATEGORY_LABELS, TICKET_KIND_LABELS } from "@/domain/labels";
import { derivePriority, PRIORITY_DEADLINES } from "@/domain/priority";
import { computeDueAt } from "@/domain/sla";
import type { NewTicket, PrioritySignals } from "@/domain/ticket";
import {
  categoryFromSpeech,
  kindFromSpeech,
  titleConsistentWithSignals,
} from "@/domain/ticket-classification";
import {
  buildTicketDescription,
  problemStatement,
  titleCitingProblem,
} from "@/domain/ticket-description";

import type { AgentTool, ToolFailure, ToolSession } from "./tool-session";

const EVIDENCE =
  "Trecho LITERAL de uma mensagem do funcionário que sustenta o campo, palavra por palavra.";

const input = z.object({
  kind: z.enum(TICKET_KINDS).describe("INC: algo parou ou não funciona. REQ: pedido."),
  category: z.enum(TICKET_CATEGORIES),
  title: z.string().describe("Título objetivo, passado a limpo (até ~60 caracteres)."),
  symptom: z
    .string()
    .describe("O sintoma em norma culta, só com o que o funcionário disse (sem completar nada)."),
  symptomEvidence: z.string().describe(EVIDENCE),
  since: z
    .string()
    .nullable()
    .describe('Desde quando, se o funcionário disse (ex.: "Desde ontem."); senão null.'),
  sinceEvidence: z.string().nullable().describe(EVIDENCE),
  tried: z
    .string()
    .nullable()
    .describe("O que o funcionário disse que já tentou; null se ele não contou nenhuma tentativa."),
  triedEvidence: z.string().nullable().describe(EVIDENCE),
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
  /** Tipo e categoria finais, depois das correções em código, com o rótulo legível. */
  kind: string;
  category: string;
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
    // Recusado (falta de sinais, ordem das tools): o chip não promete um card que não veio.
    failureLabel: "conferiu o que falta para o chamado",
    description:
      "Propõe um chamado NOVO como rascunho para o funcionário conferir e confirmar. Chame findSimilarTickets antes. A prioridade é calculada pelo sistema.",
    inputSchema: input,
    // O tipo e a categoria do modelo podem ser corrigidos em código: o painel mostra os finais,
    // no resultado (R3: a entrada dizia "INC other" e o card, Software).
    describeInput: ({ title, referenceCode }) =>
      `"${title}"${referenceCode ? ` (referência ${referenceCode})` : ""}`,
    describeOutput: ({ draftNumber, kind, category, priority }) =>
      `Rascunho D-${draftNumber}: ${kind} · ${category} · prioridade ${priority}`,
    async run(fields) {
      const { workspace } = session;
      const blocked = checkPreconditions(fields, session);
      if (blocked) return blocked;

      const signals = resolveSignals(session);
      if (!signals.ok) {
        workspace.draftNeedsSignals = true;
        return signals;
      }

      // Tipo e categoria em código quando a fala deixa claro (QA R1: INC/REQ oscilava).
      const { employeeTexts } = session.facts;
      const kind = kindFromSpeech(employeeTexts) ?? fields.kind;
      const derived = derivePriority({ kind, ...signals.value });
      const problem = reportedProblem(session);
      const built = describeTicket(fields, signals.value, session, problem);
      const category = categoryFromSpeech(fields.category, employeeTexts);
      const ticket: NewTicket = {
        kind,
        category,
        // O título sempre cita o problema contado (R3: podia sair de uma opção escolhida).
        title: titleConsistentWithSignals(titleCitingProblem(fields.title, problem), signals.value),
        description: built.description,
        affected: defaultAffected(signals.value.impact, session),
        prioritySignals: signals.value,
        priority: derived.priority,
        priorityReason: derived.reason,
        ...(fields.referenceCode && { reopenedFrom: fields.referenceCode }),
      };
      // Crítico transfere ao confirmar ou cancelar (CriticalPolicy, §6.3); vale também quando o
      // crítico só aparece nos sinais do rascunho (sempre conferidos contra a conversa).
      const transfersOnConfirm = workspace.criticalCase || derived.priority === "CRITICAL";
      const draft = await session.store.createDraft(
        { kind: "create_ticket", ticket },
        transfersOnConfirm,
      );

      workspace.draft = { pendingActionId: draft.pendingActionId, kind: "create_ticket" };
      workspace.draftClassification = { kind, category };
      workspace.correctedDescriptionFields = built.corrected;
      workspace.derivedPriority = {
        value: derived.priority,
        reason: derived.reason,
        dueAt: computeDueAt(derived.priority, session.now),
      };
      return {
        ok: true,
        draftNumber: draft.draftNumber,
        kind: TICKET_KIND_LABELS[kind],
        category: TICKET_CATEGORY_LABELS[category],
        priority: PRIORITY_LABELS[derived.priority],
        deadline: PRIORITY_DEADLINES[derived.priority].label,
        transfersOnConfirm,
        instruction: draftInstruction(transfersOnConfirm, fields.referenceCode),
      };
    },
  };
}

/**
 * Descrição passada a limpo (§11.2) montada em código: cada campo do modelo precisa citar a
 * fala do funcionário; impacto e sistema operacional saem do que já foi conferido.
 */
function describeTicket(
  fields: Input,
  signals: PrioritySignals,
  session: ToolSession,
  problemText: string,
) {
  const { employeeTexts, quickReplyAnswers, articlesTried } = session.facts;
  const statement = (text: string | null, evidence: string | null) =>
    text && evidence ? { text, evidence } : null;
  return buildTicketDescription({
    symptom: { text: fields.symptom, evidence: fields.symptomEvidence },
    since: statement(fields.since, fields.sinceEvidence),
    tried: statement(fields.tried, fields.triedEvidence),
    articlesTried,
    signals,
    operatingSystem: session.understanding.entities.os,
    employeeTexts,
    quickAnswers: quickReplyAnswers,
    problemText,
  });
}

/** A mensagem em que o funcionário contou o problema (opções escolhidas nunca contam). */
function reportedProblem(session: ToolSession): string {
  const { employeeTexts, quickReplyAnswers } = session.facts;
  return problemStatement(employeeTexts, session.understanding.summary, quickReplyAnswers);
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

/**
 * F1: o artigo que vale para o caso vem antes do chamado (na validação, o modelo às vezes
 * propunha o rascunho logo depois do "Windows 10"). Não vale quando o funcionário pediu o
 * chamado com todas as letras (`open_ticket`) nem quando o artigo já foi tentado.
 */
export function untriedArticle(session: ToolSession): string | null {
  const top = session.workspace.topArticle;
  if (top?.status !== "applies" || session.understanding.intent === "open_ticket") return null;
  return session.facts.articlesTried.includes(top.part.title) ? null : top.part.title;
}

function checkPreconditions(fields: Input, session: ToolSession): ToolFailure | null {
  const { workspace } = session;
  if (workspace.draft) {
    return { ok: false, error: "Já há um rascunho proposto neste turno." };
  }
  if (workspace.similarTickets === null) {
    return { ok: false, error: "Chame findSimilarTickets antes de propor um chamado novo." };
  }
  const article = untriedArticle(session);
  if (article) {
    return {
      ok: false,
      error: `O artigo "${article}" vale para o caso e ainda não foi tentado: oriente os passos dele e termine com "Isso resolveu?". Não proponha o chamado neste turno.`,
    };
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

/**
 * Sinais do rascunho: só os do ENTENDER, já conferidos contra a fala do funcionário (o modelo
 * do AGIR não informa sinais; na validação, ele inventava bloqueio e compromisso hoje). Sem
 * sinais suficientes, nada de rascunho: o turno faz a próxima pergunta, definida em código.
 */
function resolveSignals(session: ToolSession): { ok: true; value: PrioritySignals } | ToolFailure {
  const { impact, blocked, deadlineToday } = session.understanding.ticketSignals;
  const missing = nextMissingSignal({ impact, blocked, deadlineToday });
  if (missing || impact === null || blocked === null) {
    return {
      ok: false,
      error: `Ainda não dá para propor: falta saber ${MISSING_LABELS[missing?.signal ?? "impact"]}. Não pergunte nada sobre isso: o sistema faz a pergunta, com as opções, depois da sua resposta. Escreva no máximo uma frase curta de acolhimento.`,
    };
  }
  return { ok: true, value: { impact, blocked, deadlineToday: deadlineToday ?? false } };
}

const MISSING_LABELS = {
  impact: "quem é afetado",
  blocked: "se dá para trabalhar de outro jeito",
  deadlineToday: "se há compromisso hoje",
} as const;

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
