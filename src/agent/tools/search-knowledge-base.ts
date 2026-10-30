import { z } from "zod";

import type { ArticleMatch } from "@/agent/gateways/knowledge-gateway";
import { checkArticleConditions, type ArticleApplicability } from "@/domain/article-conditions";

import type { AgentTool, ToolSession } from "./tool-session";

const input = z.object({
  query: z.string().describe('Palavras-chave do problema, ex.: "VPN erro 809".'),
});
type Input = z.infer<typeof input>;

export interface ArticleForModel {
  slug: string;
  title: string;
  body: string;
  applicability: ArticleApplicability["status"];
  whatToDo: string;
}
type Output = { ok: true; articles: ArticleForModel[] };

/** Pergunta e opções rápidas para confirmar uma condição (§8 F1: "Qual é o seu Windows?"). */
export interface ConditionQuestion {
  question: string;
  options: string[];
}

const UNKNOWN_OPTION = "Não sei";

/** As opções são montadas em código (T4): para `os`, "Windows 10", "Windows 11" e "Não sei". */
export function conditionQuestion(field: string, appliesTo: string[]): ConditionQuestion {
  if (field === "os") {
    return {
      question: "Qual é o seu Windows?",
      options: ["Windows 10", "Windows 11", UNKNOWN_OPTION],
    };
  }
  return {
    question: `Antes de seguir, preciso confirmar: ${field}.`,
    options: [...appliesTo, "Outro", UNKNOWN_OPTION],
  };
}

/**
 * `searchKnowledgeBase` (§6.4, F1). Cada artigo vem com o que fazer, decidido em código por
 * `checkArticleConditions` (T4) com o que o ENTENDER já sabe: aplicar, confirmar a condição
 * antes (as opções rápidas já entram na resposta) ou não seguir o artigo.
 */
export function searchKnowledgeBaseTool(session: ToolSession): AgentTool<Input, Output> {
  return {
    name: "searchKnowledgeBase",
    label: "buscou na central de ajuda",
    description:
      "Busca artigos na central de ajuda. Cada artigo vem com applicability e whatToDo: siga o whatToDo.",
    inputSchema: input,
    describeInput: ({ query }) => `"${query}"`,
    describeOutput: ({ articles }) =>
      articles.length === 0
        ? "nenhum artigo"
        : articles.map((article) => `${article.slug} (${article.applicability})`).join(", "),
    async run({ query }, { knowledge }) {
      const result = await knowledge.search(query);
      if (!result.ok) {
        return {
          ok: false,
          error: "A central de ajuda está indisponível agora. Siga sem os artigos.",
        };
      }
      return {
        ok: true,
        articles: result.value.map((article, rank) => guideArticle(article, rank, session)),
      };
    },
  };
}

/** `rank` 0 é o mais relevante: só ele pode anexar as opções da condição. */
function guideArticle(article: ArticleMatch, rank: number, session: ToolSession): ArticleForModel {
  const applicability = checkArticleConditions(article, session.understanding.entities);
  const base = { slug: article.slug, title: article.title, body: article.body };

  switch (applicability.status) {
    case "applies":
      // O primeiro que vale vira o card, se a resposta se basear nele ("Isso resolveu?").
      session.workspace.applicableArticle ??= {
        type: "article",
        slug: article.slug,
        title: article.title,
        excerpt: article.excerpt,
      };
      return {
        ...base,
        applicability: "applies",
        whatToDo:
          'Se for o problema do funcionário e ele ainda não tentou estes passos, resuma os passos e termine com "Isso resolveu?" (o card do artigo e as opções Sim/Não entram sozinhos). Se ele já tentou, não repita: siga para o chamado.',
      };
    case "needs_confirmation": {
      const ask = conditionQuestion(applicability.field, applicability.appliesTo);
      if (rank === 0) {
        session.workspace.offerQuickReplies(ask.options);
        session.workspace.askedArticleCondition = true;
      }
      return {
        ...base,
        applicability: "needs_confirmation",
        whatToDo: `Vale só para ${applicability.appliesTo.join(" ou ")}. Antes de aplicar, pergunte apenas "${ask.question}"${rank === 0 ? ` (as opções ${ask.options.join(", ")} já entram na resposta)` : ""}. Não passe os passos ainda.`,
      };
    }
    case "does_not_apply":
      return {
        ...base,
        applicability: "does_not_apply",
        whatToDo: `Não vale para este caso: é só para ${applicability.appliesTo.join(" ou ")} e o funcionário informou ${applicability.knownValue}. Não oriente estes passos; siga para abrir um chamado.`,
      };
  }
}
