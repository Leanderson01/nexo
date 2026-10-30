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

/** Termos da busca: o resumo do ENTENDER e o código de erro, se houver. */
export function knowledgeQuery(understanding: Understanding): string {
  return [understanding.summary, understanding.entities.errorCode]
    .filter((term) => term !== null && term !== "")
    .join(" ");
}

/** Os artigos com o que fazer em cada um, ou `null` se a central não respondeu. */
export async function consultKnowledge(
  session: ToolSession,
  environment: TraceEnvironment,
): Promise<ArticleForModel[] | null> {
  const search = withTrace(searchKnowledgeBaseTool(session), environment);
  const result = await search({ query: knowledgeQuery(session.understanding) });
  return result.ok ? result.articles : null;
}
