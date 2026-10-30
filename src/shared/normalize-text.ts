/** Minúsculas e sem acento: "Férias" vira "ferias". Base das buscas por palavra. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Palavras com letras ou dígitos, já normalizadas: "o do Notebook!" vira ["o", "do", "notebook"]. */
export function splitWords(text: string): string[] {
  return normalizeText(text).match(/[a-z0-9]+/g) ?? [];
}

/**
 * Troca o hífen não separável (U+2011) e o hífen tipográfico (U+2010), que o gpt-oss usa, pelo
 * hífen comum: "INC‑20311" e "Wi‑Fi" voltam a casar com buscas e códigos.
 */
export function plainHyphens(text: string): string {
  return text.replace(/[\u2010\u2011]/g, "-");
}

/**
 * Palavras vazias: não ajudam a achar um artigo (`convex/knowledge/searchTerms.ts`) nem a
 * distinguir um chamado de outro (`convex/ticketing/similarity.ts`). Já sem acento.
 */
export const STOPWORDS: ReadonlySet<string> = new Set([
  "a",
  "ao",
  "aos",
  "as",
  "com",
  "como",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "ela",
  "ele",
  "em",
  "esta",
  "este",
  "estou",
  "eu",
  "foi",
  "ha",
  "isso",
  "ja",
  "mais",
  "mas",
  "me",
  "meu",
  "meus",
  "minha",
  "minhas",
  "na",
  "nao",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "ou",
  "para",
  "pela",
  "pelo",
  "por",
  "pra",
  "que",
  "se",
  "sem",
  "seu",
  "sua",
  "um",
  "uma",
]);
