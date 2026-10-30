import type { Article } from "./article";
import type { Entities } from "./understanding";

// Antes de aplicar um artigo com condição, o agent confere o que já sabe (§6.4, F1).
// Ex.: "VPN com erro 809" vale só para Windows 10: com Windows 11 o caminho é abrir chamado;
// sem saber o Windows, pergunta antes ("Windows 10", "Windows 11", "Não sei").

export type ArticleApplicability =
  | { status: "applies" }
  | { status: "does_not_apply"; field: string; knownValue: string; appliesTo: string[] }
  | { status: "needs_confirmation"; field: string; appliesTo: string[] };

/** O que o agent já sabe da conversa, nos campos do ENTENDER (ex.: `{ os: "Windows 11" }`). */
export type KnownEntities = Partial<Entities>;

/**
 * Diz se o artigo vale para o caso. Basta uma condição contrária para não valer; se nenhuma
 * contraria mas alguma ainda é desconhecida, falta confirmar essa (a primeira) com a pessoa.
 */
export function checkArticleConditions(
  article: Pick<Article, "conditions">,
  known: KnownEntities,
): ArticleApplicability {
  const conditions = article.conditions ?? [];
  let firstUnknown: ArticleApplicability | null = null;

  for (const { field, appliesTo } of conditions) {
    const knownValue = readKnownValue(known, field);
    if (knownValue === null) {
      firstUnknown ??= { status: "needs_confirmation", field, appliesTo };
      continue;
    }
    const matches =
      field === "device" ? deviceMatches(knownValue, appliesTo) : matchesAny(knownValue, appliesTo);
    if (!matches) {
      return { status: "does_not_apply", field, knownValue, appliesTo };
    }
  }
  return firstUnknown ?? { status: "applies" };
}

/** Respostas que não informam o valor ("Não sei") contam como desconhecidas. */
const UNKNOWN_ANSWERS = new Set(["", "naosei", "naolembro", "desconhecido"]);

function readKnownValue(known: KnownEntities, field: string): string | null {
  if (!isEntityField(field)) return null;
  const value = known[field];
  if (value === null || value === undefined) return null;
  return UNKNOWN_ANSWERS.has(normalizeConditionValue(value)) ? null : value;
}

const ENTITY_FIELDS = [
  "system",
  "errorCode",
  "os",
  "device",
  "ticketRef",
] as const satisfies readonly (keyof Entities)[];

function isEntityField(field: string): field is keyof Entities {
  return (ENTITY_FIELDS as readonly string[]).includes(field);
}

function matchesAny(value: string, appliesTo: string[]): boolean {
  const normalized = normalizeConditionValue(value);
  return appliesTo.some((expected) => normalizeConditionValue(expected) === normalized);
}

/**
 * O dispositivo vem em frase ("o meu celular Android", "No computador"): vale se alguma
 * palavra dele é um dos dispositivos da condição.
 */
function deviceMatches(value: string, appliesTo: string[]): boolean {
  const words = value.split(/[^\p{L}\p{N}]+/u).map(normalizeConditionValue);
  const expected = new Set(appliesTo.map(normalizeConditionValue));
  return words.some((word) => expected.has(word));
}

/**
 * Compara sem acento, sem espaço nem pontuação, e com "win" lido como "windows":
 * "Windows 11", "windows11", "Win 11" e "win11" viram todos "windows11".
 */
export function normalizeConditionValue(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .replace(/^win(?!dows)/, "windows");
}
