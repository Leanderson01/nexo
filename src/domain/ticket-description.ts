import { normalizeText, splitWords, STOPWORDS } from "@/shared/normalize-text";

import type { SaidSignals } from "./signal-evidence";
import { impersonal } from "./ticket-classification";

// Descrição passada a limpo (§11.2) montada em código a partir de campos com evidência:
// sintoma, desde quando, o que já foi tentado, impacto e ambiente. "Passar a limpo" é reescrever
// o que foi dito, não completar: cada frase do modelo precisa citar um trecho literal do
// funcionário e não pode trazer palavras de conteúdo que ele nunca usou. O que não passa é
// trocado pelo próprio trecho dele (ou descartado); impacto e ambiente saem dos sinais e das
// entidades já conferidos.

/** Uma frase do modelo com o trecho literal do funcionário que a sustenta. */
export interface Statement {
  text: string;
  evidence: string;
}

/** Palavras de reescrita que não trazem fato novo ("o funcionário relata que..."). */
const REWRITE_WORDS: ReadonlySet<string> = new Set(
  [
    "funcionario",
    "funcionaria",
    "usuario",
    "usuaria",
    "colaborador",
    "colaboradora",
    "solicitante",
    "relata",
    "informa",
    "problema",
    "ocorre",
    "ocorrendo",
    "apresenta",
    "apresentando",
    "novamente",
    "desde",
    "apos",
    "ainda",
    "quando",
    "sempre",
    "toda",
    "todo",
    "vezes",
    "esta",
    "estao",
    "esta",
    "sendo",
    "foram",
    "seria",
    "ser",
    "tem",
    "nao",
    "possivel",
    "conseguir",
    "consegue",
    "falha",
    "erro",
    "situacao",
    "momento",
    "atualmente",
  ].map(normalizeText),
);

/** Quantas palavras de conteúdo novas uma frase aguenta (sinônimo, conjugação). */
function noveltyAllowance(contentWords: number): number {
  return Math.max(1, Math.floor(contentWords * 0.25));
}

/** Radical simples para comparar conjugações: "travando" e "trava" viram "trav". */
function stem(word: string): string {
  return /^\d+$/.test(word) ? word : word.slice(0, 5);
}

function contentWords(text: string): string[] {
  return splitWords(text).filter(
    (word) => /^\d+$/.test(word) || (word.length >= 4 && !STOPWORDS.has(word)),
  );
}

/** Texto comparável: sem acento, minúsculas, só letras e dígitos com um espaço entre eles. */
function comparable(text: string): string {
  return splitWords(text).join(" ");
}

/** O trecho aparece, literalmente, em alguma mensagem do funcionário. */
export function quoteAppears(quote: string, employeeTexts: string[]): boolean {
  const target = comparable(quote);
  if (target === "") return false;
  return employeeTexts.some((text) => comparable(text).includes(target));
}

/** Palavras de conteúdo do texto que o funcionário nunca usou. */
export function novelWords(text: string, employeeTexts: string[]): string[] {
  const known = new Set(employeeTexts.flatMap(contentWords).map(stem));
  return contentWords(text).filter((word) => !known.has(stem(word)) && !REWRITE_WORDS.has(word));
}

/** A frase reescreve o que foi dito: cita um trecho dele e não traz fato novo. */
export function isGrounded(statement: Statement, employeeTexts: string[]): boolean {
  if (!quoteAppears(statement.evidence, employeeTexts)) return false;
  const words = contentWords(statement.text);
  return novelWords(statement.text, employeeTexts).length <= noveltyAllowance(words.length);
}

/** O trecho do funcionário como frase: maiúscula no começo e ponto no fim. */
export function asSentence(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed === "") return "";
  const capitalized = trimmed[0].toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

/**
 * A frase que entra na descrição: a do modelo, se fundamentada; senão o trecho do funcionário,
 * se ele aparece de fato nas mensagens; senão nada. `cue` exige um tipo de fato no trecho
 * (ex.: tempo em "desde quando", tentativa em "o que já foi tentado").
 */
export function groundedSentence(
  statement: Statement | null,
  employeeTexts: string[],
  cue?: RegExp,
): { sentence: string | null; replaced: boolean } {
  if (!statement || statement.text.trim() === "") return { sentence: null, replaced: false };
  if (!quoteAppears(statement.evidence, employeeTexts)) return { sentence: null, replaced: true };
  if (cue && !cue.test(normalizeText(statement.evidence))) {
    return { sentence: null, replaced: true };
  }
  if (isGrounded(statement, employeeTexts)) {
    return { sentence: asSentence(statement.text), replaced: false };
  }
  return { sentence: asSentence(statement.evidence), replaced: true };
}

/** "desde ontem", "hoje cedo", "há dois dias", "depois da atualização". */
export const SINCE_CUE =
  /\b(desde|ontem|hoje|cedo|manha|tarde|noite|semana|dias?|horas?|mes|depois d|apos|agora ha|faz \d|ha \d|ha (um|uma|dois|duas|tres))\b/;
/** "tentei", "reiniciei", "já fiz", "troquei o cabo". */
export const TRIED_CUE =
  /\b(tentei|tentamos|reiniciei|reinstalei|desinstalei|instalei|troquei|testei|desliguei|liguei de novo|limpei|atualizei|fiz|fizemos|segui|ja (tentei|fiz|reiniciei|troquei|testei))\b/;

export interface DescriptionInput {
  symptom: Statement;
  since: Statement | null;
  tried: Statement | null;
  /** Títulos dos artigos que o funcionário disse que não resolveram (F1 passo 5). */
  articlesTried: string[];
  signals: SaidSignals;
  /** Sistema operacional já conferido nas mensagens do funcionário. */
  operatingSystem: string | null;
  /** O que o funcionário escreveu (as mensagens dele na conversa). */
  employeeTexts: string[];
  /** Usado quando nem o sintoma nem o trecho dele se sustentam. */
  fallbackSymptom: string;
}

export interface BuiltDescription {
  description: string;
  /** Campos trocados pelo trecho do funcionário ou descartados. */
  corrected: string[];
}

export function buildTicketDescription(input: DescriptionInput): BuiltDescription {
  const corrected: string[] = [];
  const pick = (name: string, statement: Statement | null, cue?: RegExp): string | null => {
    const result = groundedSentence(statement, input.employeeTexts, cue);
    if (result.replaced) corrected.push(name);
    return result.sentence;
  };

  const symptom = pick("sintoma", input.symptom) ?? asSentence(input.fallbackSymptom);
  const since = pick("desde quando", input.since, SINCE_CUE);
  const tried = pick("o que já foi tentado", input.tried, TRIED_CUE);
  const lines = [
    symptom,
    since,
    tried,
    ...input.articlesTried.map(
      (title) => `O artigo "${title}" da central de ajuda já foi tentado, sem resolver.`,
    ),
    impactSentence(input.signals),
    input.operatingSystem ? `Sistema operacional: ${input.operatingSystem}.` : null,
  ];
  const unique = lines.filter(
    (line, index): line is string => line !== null && line !== "" && lines.indexOf(line) === index,
  );
  return { description: unique.map(impersonal).join(" "), corrected };
}

/** Impacto, bloqueio e urgência como o funcionário disse (já conferidos). */
export function impactSentence(signals: SaidSignals): string | null {
  const who =
    signals.impact === "individual"
      ? "Afeta apenas o solicitante"
      : signals.impact === "team"
        ? "Afeta a equipe"
        : signals.impact === "company"
          ? "Afeta a empresa toda"
          : null;
  const blocked =
    signals.blocked === true
      ? "impede o trabalho, sem alternativa no momento"
      : signals.blocked === false
        ? "há alternativa para seguir trabalhando por enquanto"
        : null;
  const parts = [who, blocked].filter((part) => part !== null);
  const deadline = signals.deadlineToday ? " Há compromisso hoje que depende disso." : "";
  if (parts.length === 0) return deadline.trim() || null;
  const sentence = parts.join("; ");
  return `${sentence[0].toUpperCase()}${sentence.slice(1)}.${deadline}`;
}

/**
 * O sistema operacional do ENTENDER só vale se o funcionário o disse ou escolheu ("Windows 10",
 * "win 11"); "Não sei" não entra. Na validação, o modelo inventava "Windows 10".
 */
export function saidOperatingSystem(os: string | null, employeeTexts: string[]): string | null {
  const value = os?.trim() ?? "";
  if (value === "" || normalizeText(value).startsWith("nao sei")) return null;
  const said = new Set(employeeTexts.flatMap(osWords));
  const words = osWords(value);
  return words.length > 0 && words.every((word) => said.has(word)) ? value : null;
}

/** "Win11" e "Windows 11" viram ["windows", "11"]. */
function osWords(text: string): string[] {
  return splitWords(text.replace(/([a-z])(\d)/gi, "$1 $2")).map((word) =>
    word === "win" ? "windows" : word,
  );
}

/**
 * A mensagem do funcionário que conta o problema: a primeira com conteúdo na janela (as
 * respostas às perguntas vêm depois e são curtas). Sem nenhuma, o resumo do ENTENDER.
 */
export function problemStatement(employeeTexts: string[], summary: string): string {
  return employeeTexts.find((text) => contentWords(text).length >= 3) ?? summary;
}
