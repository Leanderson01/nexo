import { STOPWORDS } from "../../src/shared/normalize-text";

// Termos de busca da central de ajuda. Função pura, usada dos dois lados: ao gravar o
// `searchText` do artigo (seed) e ao montar a consulta. O índice do Convex casa por termo
// exato (sem acento, sem plural, sem conjugação), então os dois lados passam pela mesma
// normalização e "como instalo" encontra "Instalar software". Busca semântica é faixa 3.

/** Terminações cortadas para juntar "instalo", "instalar" e "instalação" no mesmo termo. */
const SUFFIXES = [
  "acoes",
  "acao",
  "ados",
  "adas",
  "ado",
  "ada",
  "ar",
  "er",
  "ir",
  "es",
  "os",
  "as",
  "o",
  "a",
  "e",
  "s",
];

/** Abaixo disso o corte vira ruído ("rede" → "red"); a palavra fica inteira. */
const MIN_STEM_LENGTH = 4;

/** O Convex aceita até 16 termos por consulta de busca. */
export const MAX_QUERY_TERMS = 16;

/** Minúsculas, sem acento e sem hífen dentro da palavra ("Wi-Fi" → "wifi", "e-mail" → "email"). */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/(\w)-(\w)/g, "$1$2");
}

/** Corta uma terminação comum, desde que sobre um radical de pelo menos 4 letras. */
export function stem(word: string): string {
  for (const suffix of SUFFIXES) {
    if (word.endsWith(suffix) && word.length - suffix.length >= MIN_STEM_LENGTH) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

/** Termos distintos do texto, na ordem em que aparecem: normalizados, sem palavras vazias. */
export function toSearchTerms(text: string): string[] {
  const words = normalizeText(text).split(/[^a-z0-9]+/);
  const terms = words.filter((word) => word.length > 0 && !STOPWORDS.has(word)).map(stem);
  return [...new Set(terms)];
}

/** Conteúdo do campo `searchText` de um artigo: os termos do título, do corpo e das tags. */
export function buildArticleSearchText(article: {
  title: string;
  body: string;
  tags: string[];
}): string {
  return toSearchTerms([article.title, article.body, ...article.tags].join(" ")).join(" ");
}
