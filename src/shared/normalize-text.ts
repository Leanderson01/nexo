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
