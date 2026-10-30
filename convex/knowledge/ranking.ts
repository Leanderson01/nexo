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
  conditions?: { field: string; appliesTo: string[] }[];
}

/** Os termos do assunto do artigo (título e tags), que pesam mais que os do corpo. */
function subjectTerms(article: RankableArticle): Set<string> {
  return new Set(toSearchTerms([article.title, ...article.tags].join(" ")));
}

/**
 * Pontuação do artigo para os termos da consulta: 2 por termo no título ou nas tags (o
 * assunto do artigo) e 1 por termo que só aparece no corpo. Zero = não tem a ver.
 */
export function scoreArticle(article: RankableArticle, queryTerms: string[]): number {
  const subject = subjectTerms(article);
  const bodyTerms = new Set(toSearchTerms(article.body));

  let score = 0;
  for (const term of queryTerms) {
    if (subject.has(term)) score += 2;
    else if (bodyTerms.has(term)) score += 1;
  }
  return score;
}

/**
 * Corte mínimo de relevância: algum termo da consulta precisa estar no assunto do artigo.
 * Só palavras do corpo não bastam, porque elas se repetem entre artigos ("abra um chamado",
 * "portal", "celular") e traziam o artigo do SAP ou do e-mail para a impressora quebrada.
 */
export function matchesArticleSubject(article: RankableArticle, queryTerms: string[]): boolean {
  const subject = subjectTerms(article);
  return queryTerms.some((term) => subject.has(term));
}

/**
 * Artigo de um dispositivo (condição `device`, ex.: só celular) só entra quando a consulta fala
 * de um deles: "o Outlook do computador não abre" trazia "Configurar o e-mail corporativo no
 * celular" pela tag "outlook" (QA R1).
 */
export function matchesArticleDevice(article: RankableArticle, queryTerms: string[]): boolean {
  const devices = (article.conditions ?? []).filter((condition) => condition.field === "device");
  if (devices.length === 0) return true;
  const deviceTerms = new Set(
    toSearchTerms(devices.flatMap((condition) => condition.appliesTo).join(" ")),
  );
  return queryTerms.some((term) => deviceTerms.has(term));
}

/**
 * Os artigos que passam no corte de relevância, do mais pontuado ao menos; empate mantém a
 * ordem de chegada.
 */
export function rankArticles<T extends RankableArticle>(articles: T[], queryTerms: string[]): T[] {
  return articles
    .filter((article) => matchesArticleSubject(article, queryTerms))
    .filter((article) => matchesArticleDevice(article, queryTerms))
    .map((article) => ({ article, score: scoreArticle(article, queryTerms) }))
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
