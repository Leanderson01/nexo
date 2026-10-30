import { findSimilarTicketsTool, type SimilarTicket } from "@/agent/tools/find-similar-tickets";
import type { ToolSession } from "@/agent/tools/tool-session";
import { withTrace, type TraceEnvironment } from "@/agent/tools/with-trace";
import type { Intent } from "@/domain/enums";
import type { Understanding } from "@/domain/understanding";
import { normalizeText } from "@/shared/normalize-text";

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
