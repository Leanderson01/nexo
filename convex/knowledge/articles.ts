import { v } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import { query } from "../_generated/server";
import { requirePerson } from "../lib/guards";
import type { Article } from "../../src/domain/article";
import { buildExcerpt, rankArticles } from "./ranking";
import { MAX_QUERY_TERMS, toSearchTerms } from "./searchTerms";

// Central de ajuda (§4.3): busca textual nos artigos, para a tool `searchKnowledgeBase`
// (§6.4) e para a tela. Qualquer pessoa logada pode ler; os artigos não são de ninguém.

/** Candidatos pedidos ao índice antes de ordenar em código (a base tem poucos artigos). */
const SEARCH_CANDIDATES = 10;

/** Artigo encontrado, com o trecho para o card. Mesmo formato do `ArticleMatch` do gateway. */
export type ArticleSearchResult = Article & { excerpt: string };

/** Até 3 artigos para a frase do funcionário, do mais ao menos relevante. */
export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args): Promise<ArticleSearchResult[]> => {
    await requirePerson(ctx);

    const queryTerms = toSearchTerms(args.query).slice(0, MAX_QUERY_TERMS);
    if (queryTerms.length === 0) return [];

    const candidates = await ctx.db
      .query("articles")
      .withSearchIndex("search_text", (q) => q.search("searchText", queryTerms.join(" ")))
      .take(SEARCH_CANDIDATES);

    return rankArticles(candidates, queryTerms).map((doc) => ({
      ...toArticle(doc),
      excerpt: buildExcerpt(doc.body, queryTerms),
    }));
  },
});

/** Um artigo pelo slug (ex.: "Ver artigo" no card), ou null se não existir. */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args): Promise<Article | null> => {
    await requirePerson(ctx);

    const doc = await ctx.db
      .query("articles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    return doc ? toArticle(doc) : null;
  },
});

/** Tira os campos internos (`_id`, `searchText`) do documento. */
function toArticle(doc: Doc<"articles">): Article {
  return {
    slug: doc.slug,
    title: doc.title,
    body: doc.body,
    tags: doc.tags,
    ...(doc.conditions && { conditions: doc.conditions }),
  };
}
