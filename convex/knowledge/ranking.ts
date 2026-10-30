import { toSearchTerms } from "./searchTerms";

// Ordem e trecho dos artigos encontrados. Funções puras: o índice do Convex só traz os
// candidatos (e o convex-test nem ordena por relevância), então a ordem final sai daqui.

/** Quantos artigos a busca devolve, no máximo. */
export const MAX_ARTICLE_RESULTS = 3;

/** Tamanho máximo do trecho mostrado no card. */
export const MAX_EXCERPT_LENGTH = 220;

interface RankableArticle {
  title: string;
  body: string;
  tags: string[];
}

/**
 * Pontuação do artigo para os termos da consulta: 2 por termo no título ou nas tags (o
 * assunto do artigo) e 1 por termo que só aparece no corpo. Zero = não tem a ver.
 */
export function scoreArticle(article: RankableArticle, queryTerms: string[]): number {
  const subjectTerms = new Set(toSearchTerms([article.title, ...article.tags].join(" ")));
  const bodyTerms = new Set(toSearchTerms(article.body));

  let score = 0;
  for (const term of queryTerms) {
    if (subjectTerms.has(term)) score += 2;
    else if (bodyTerms.has(term)) score += 1;
  }
  return score;
}

/** Os artigos com pontuação > 0, do mais pontuado ao menos; empate mantém a ordem de chegada. */
export function rankArticles<T extends RankableArticle>(articles: T[], queryTerms: string[]): T[] {
  return articles
    .map((article) => ({ article, score: scoreArticle(article, queryTerms) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ARTICLE_RESULTS)
    .map(({ article }) => article);
}

/**
 * Trecho para o card: as frases do corpo que contêm algum termo buscado (ou a primeira frase,
 * se nenhuma contiver), cortado em `MAX_EXCERPT_LENGTH` sem partir palavra.
 */
export function buildExcerpt(body: string, queryTerms: string[]): string {
  const sentences = body.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.length > 0);
  const wanted = new Set(queryTerms);
  const matching = sentences.filter((sentence) =>
    toSearchTerms(sentence).some((term) => wanted.has(term)),
  );
  const excerpt = (matching.length > 0 ? matching : sentences.slice(0, 1)).join(" ");
  return truncateAtWord(excerpt, MAX_EXCERPT_LENGTH);
}

function truncateAtWord(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
