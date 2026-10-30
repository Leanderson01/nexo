import { findSimilarTicketsTool, type SimilarTicket } from "@/agent/tools/find-similar-tickets";
import type { ToolSession } from "@/agent/tools/tool-session";
import { withTrace, type TraceEnvironment } from "@/agent/tools/with-trace";
import type { Intent } from "@/domain/enums";
import type { Understanding } from "@/domain/understanding";
import { devicesConflict } from "@/domain/devices";
import { normalizeText, splitWords, STOPWORDS } from "@/shared/normalize-text";

// F4 passo 2 em código: num problema que voltou ("caiu de novo", "continua sem imprimir") ou num
// complemento de chamado, o turno procura os chamados parecidos antes do AGIR, pela própria
// tool `findSimilarTickets` (aparece no painel). Assim o chamado anterior entra no contexto do
// turno, em vez de depender de o modelo lembrar de procurar antes de seguir o artigo.

const INTENTS_THAT_REPORT_A_PROBLEM: readonly Intent[] = [
  "question",
  "open_ticket",
  "update_ticket",
];

/** "de novo", "novamente", "outra vez", "voltou a", "continua", "ainda não". */
const RECURRENCE = /\b(de novo|novamente|outra vez|volto?u a|volta a|continua|ainda nao)\b/;

export function isRecurringProblem(userText: string): boolean {
  return RECURRENCE.test(normalizeText(userText));
}

export function shouldConsultSimilar(understanding: Understanding, userText: string): boolean {
  if (!INTENTS_THAT_REPORT_A_PROBLEM.includes(understanding.intent)) return false;
  return understanding.intent === "update_ticket" || isRecurringProblem(userText);
}

/** Intenções em que um problema novo pode já ter chamado aberto (duplicidade, §3.2). */
const INTENTS_OF_A_NEW_PROBLEM: readonly Intent[] = ["question", "open_ticket"];

/**
 * Problema que cita um sistema ou aparelho ("o Outlook não sincroniza"): o turno procura os
 * parecidos para achar um chamado ABERTO dele (QA R1: o Rafael tem o INC-20402 do Outlook e
 * recebia o artigo do celular em vez da proposta de atualizar o chamado).
 */
export function shouldLookForOpenDuplicate(
  understanding: Understanding,
  userText: string,
): boolean {
  if (!INTENTS_OF_A_NEW_PROBLEM.includes(understanding.intent)) return false;
  if (shouldConsultSimilar(understanding, userText)) return false;
  return subjectWords(understanding).length > 0;
}

/**
 * Os parecidos abertos (sugestão `update`) do mesmo sistema ou aparelho, sem conflito de
 * aparelho com a fala do funcionário (o Outlook do celular não é o do computador).
 */
export function openDuplicates(
  similar: SimilarTicket[],
  understanding: Understanding,
  employeeTexts: string[],
): SimilarTicket[] {
  const subject = subjectWords(understanding);
  return similar.filter((ticket) => {
    if (ticket.suggestedAction !== "update") return false;
    const title = new Set(splitWords(ticket.title));
    return subject.some((word) => title.has(word)) && !devicesConflict(ticket.title, employeeTexts);
  });
}

/** Palavras do sistema e do aparelho citados ("Outlook", "impressora do 2º andar"). */
function subjectWords(understanding: Understanding): string[] {
  const { system, device } = understanding.entities;
  return splitWords([system, device].filter((value) => value !== null).join(" ")).filter(
    (word) => word.length >= 3 && !STOPWORDS.has(word),
  );
}

/** Os parecidos com a sugestão de cada um, ou `null` se o serviço de chamados não respondeu. */
export async function consultSimilar(
  session: ToolSession,
  environment: TraceEnvironment,
): Promise<SimilarTicket[] | null> {
  const find = withTrace(findSimilarTicketsTool(session), environment);
  const result = await find({
    description: session.understanding.summary,
    category: session.understanding.ticketSignals.category,
  });
  return result.ok ? result.similar : null;
}
