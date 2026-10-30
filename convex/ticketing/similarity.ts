import type { TicketCategory } from "../../src/domain/enums";
import type { SimilarityQuery } from "../../src/domain/ticket";
import { STOPWORDS } from "../../src/shared/normalize-text";

// Ranking de chamados parecidos com a descrição do funcionário (§5.6). Função pura:
// a janela de tempo (abertos e encerrados há até 30 dias) é regra de domínio e fica em
// `findDuplicateCandidates`; aqui só se mede o quanto cada chamado lembra a descrição.

/** Quantos candidatos o `findSimilar` devolve, no máximo. */
export const MAX_SIMILAR_TICKETS = 5;

/** O que o ranking lê de cada chamado. `Doc<"tickets">` e `Ticket` servem. */
export interface SimilarityCandidate {
  title: string;
  description: string;
  category: TicketCategory;
  lastActivityAt: number;
}

/** Minúsculas, sem acento, sem pontuação e sem palavras vazias. */
export function normalizeWords(text: string): Set<string> {
  const withoutAccents = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  const words = withoutAccents.split(/[^a-z0-9]+/).filter((word) => word.length > 0);
  return new Set(words.filter((word) => !STOPWORDS.has(word)));
}

/** Palavras em comum com a descrição, mais 1 se a categoria bate. */
export function similarityScore(query: SimilarityQuery, ticket: SimilarityCandidate): number {
  const queryWords = normalizeWords(query.description);
  const ticketWords = normalizeWords(`${ticket.title} ${ticket.description}`);

  let score = 0;
  for (const word of queryWords) {
    if (ticketWords.has(word)) score += 1;
  }
  if (query.category !== null && query.category === ticket.category) score += 1;
  return score;
}

/**
 * Os chamados com alguma semelhança, do mais parecido para o menos, no máximo 5.
 * Empate: a atividade mais recente vem primeiro.
 */
export function rankBySimilarity<T extends SimilarityCandidate>(
  query: SimilarityQuery,
  tickets: readonly T[],
): T[] {
  return tickets
    .map((ticket) => ({ ticket, score: similarityScore(query, ticket) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.ticket.lastActivityAt - a.ticket.lastActivityAt)
    .slice(0, MAX_SIMILAR_TICKETS)
    .map(({ ticket }) => ticket);
}
