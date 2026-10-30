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
