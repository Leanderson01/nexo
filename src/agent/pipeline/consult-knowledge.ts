import { searchKnowledgeBaseTool, type ArticleForModel } from "@/agent/tools/search-knowledge-base";
import type { ToolSession } from "@/agent/tools/tool-session";
import { withTrace, type TraceEnvironment } from "@/agent/tools/with-trace";
import type { Intent } from "@/domain/enums";
import type { Understanding } from "@/domain/understanding";

// F1 em código: num problema ou dúvida, o turno consulta a central de ajuda antes do AGIR,
// pela própria tool `searchKnowledgeBase` (aparece no painel). Assim a condição do artigo
// (ex.: o Windows) é conferida sempre, e as opções da pergunta entram na resposta, em vez de
// depender de o modelo lembrar de buscar.

const INTENTS_THAT_SEARCH: readonly Intent[] = ["question", "open_ticket"];

export function shouldConsultKnowledge(understanding: Understanding): boolean {
  return INTENTS_THAT_SEARCH.includes(understanding.intent);
}

/**
 * Termos da busca: o resumo do ENTENDER, o código de erro, o dispositivo e, numa resposta curta
 * a uma pergunta do agent ("Windows 10"), a fala em que o funcionário contou o problema: o
 * resumo desse turno às vezes era só "Resposta ao pedido de sistema operacional" e a busca não
 * achava o artigo (extra-artigo-nao-resolveu).
 */
export function knowledgeQuery(
  understanding: Understanding,
  problem: string | null = null,
): string {
  return [
    understanding.summary,
    understanding.entities.errorCode,
    understanding.entities.device,
    problem,
  ]
    .filter((term) => term !== null && term !== "")
    .join(" ");
}

/** Os artigos com o que fazer em cada um, ou `null` se a central não respondeu. */
export async function consultKnowledge(
  session: ToolSession,
  environment: TraceEnvironment,
  problem: string | null = null,
): Promise<ArticleForModel[] | null> {
  const search = withTrace(searchKnowledgeBaseTool(session), environment);
  const result = await search({ query: knowledgeQuery(session.understanding, problem) });
  return result.ok ? result.articles : null;
}
