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
  /**
   * As mensagens que são opções rápidas escolhidas ("Sim, tenho compromisso hoje"): respostas,
   * nunca sintoma, desde quando ou tentativa (R3: a descrição começava pela última opção).
   */
  quickAnswers: string[];
  /** A mensagem em que o funcionário contou o problema (`problemStatement`). */
  problemText: string;
}

export interface BuiltDescription {
  description: string;
  /** Campos trocados pelo trecho do funcionário ou descartados. */
  corrected: string[];
}

export function buildTicketDescription(input: DescriptionInput): BuiltDescription {
  const corrected: string[] = [];
  const typed = typedTexts(input.employeeTexts, input.quickAnswers);
  const pick = (name: string, statement: Statement | null, cue?: RegExp): string | null => {
    const result = groundedSentence(statement, typed, cue);
    if (result.replaced) corrected.push(name);
    return result.sentence;
  };

  const symptom = symptomSentence(input.symptom, typed, input.problemText);
  if (symptom.replaced) corrected.push("sintoma");
  const since = pick("desde quando", input.since, SINCE_CUE);
  const tried = pick("o que já foi tentado", input.tried, TRIED_CUE);
  const lines = [
    symptom.sentence,
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
 * A frase do sintoma: a do modelo (ou o trecho citado) só se o trecho estiver na mensagem em que
 * o problema foi contado e a frase citar o problema; senão, essa própria mensagem.
 */
function symptomSentence(
  statement: Statement,
  typed: string[],
  problemText: string,
): { sentence: string; replaced: boolean } {
  const problem = asSentence(problemText);
  if (problem === "") {
    const result = groundedSentence(statement, typed);
    return { sentence: result.sentence ?? "", replaced: result.replaced };
  }
  if (!quoteAppears(statement.evidence, [problemText]))
    return { sentence: problem, replaced: true };
  const result = groundedSentence(statement, typed);
  if (result.sentence === null || !mentionsProblem(result.sentence, problemText)) {
    return { sentence: problem, replaced: true };
  }
  return { sentence: result.sentence, replaced: result.replaced };
}

/** As mensagens digitadas pelo funcionário, sem as opções rápidas que ele escolheu. */
export function typedTexts(employeeTexts: string[], quickAnswers: string[]): string[] {
  const answers = new Set(quickAnswers.map(comparable));
  return employeeTexts.filter((text) => !answers.has(comparable(text)));
}

/** Palavras que identificam o problema: siglas curtas ("VPN") e números ("809") contam. */
function problemWords(text: string): string[] {
  return splitWords(text).filter(
    (word) => /^\d+$/.test(word) || (word.length >= 3 && !STOPWORDS.has(word)),
  );
}

/** O texto cita o problema: usa ao menos uma palavra dele ("VPN", "809", "Excel"). */
export function mentionsProblem(text: string, problemText: string): boolean {
  const problem = new Set(problemWords(problemText).map(stem));
  return problemWords(text).some((word) => problem.has(stem(word)));
}

/**
 * O título do chamado sempre cita o problema: o do modelo, se usa uma palavra da mensagem em que
 * o problema foi contado; senão, essa mensagem encurtada.
 */
export function titleCitingProblem(title: string, problemText: string): string {
  if (problemText.trim() === "" || mentionsProblem(title, problemText)) return title;
  return shortTitle(problemText);
}

const MAX_TITLE_LENGTH = 60;

function shortTitle(text: string): string {
  const sentence = asSentence(text).replace(/[.!?]$/, "");
  if (sentence.length <= MAX_TITLE_LENGTH) return sentence;
  const cut = sentence.slice(0, MAX_TITLE_LENGTH + 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : MAX_TITLE_LENGTH).replace(/[,;:]$/, "")}…`;
}

/** Mensagem que conta um problema: ao menos três palavras que o identificam. */
const MIN_PROBLEM_WORDS = 3;

/**
 * Palavras de conteúdo mais as siglas ("VPN", "SAP"): "Minha VPN dá erro 809" tem três;
 * "Bom dia, preciso de ajuda" tem duas.
 */
function problemWordCount(text: string): number {
  const acronyms = text.match(/\b[A-Z]{2,4}\b/g) ?? [];
  const short = acronyms.filter((acronym) => contentWords(acronym).length === 0);
  return contentWords(text).length + short.length;
}

/**
 * A mensagem do funcionário que conta o problema: a primeira digitada com conteúdo (as opções
 * rápidas escolhidas nunca contam); sem nenhuma assim, a digitada mais longa; sem nenhuma
 * digitada, o resumo do ENTENDER. "Minha VPN dá erro 809" conta (VPN, erro, 809).
 */
export function problemStatement(
  employeeTexts: string[],
  summary: string,
  quickAnswers: string[] = [],
): string {
  const typed = typedTexts(employeeTexts, quickAnswers);
  const told = typed.find((text) => problemWordCount(text) >= MIN_PROBLEM_WORDS);
  if (told) return told;
  const longest = typed.reduce<string | null>(
    (best, text) => (best === null || text.trim().length > best.trim().length ? text : best),
    null,
  );
  return longest !== null && longest.trim() !== "" ? longest : summary;
}
