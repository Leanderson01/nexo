import type { ReplyCorrection } from "@/domain/decision-record";
import type { AnyIntakeQuestion } from "@/domain/intake-questions";
import { normalizeText } from "@/shared/normalize-text";

// Condução da resposta, conferida em código depois do AGIR (QA de ponta a ponta, F4): uma
// pergunta por turno; as perguntas conhecidas (impacto, bloqueio, urgência, condição do artigo,
// "Isso resolveu?") com texto e opções definidos aqui; pergunta fechada sem opções ganha Sim/Não;
// sem markdown cru. Funções puras: recebem o texto do modelo e devolvem o texto corrigido.

export const ARTICLE_QUESTION = "Isso resolveu?";
export const YES_NO = ["Sim", "Não"];

/** Uma frase do texto e a quebra que vinha antes dela (espaço, linha ou parágrafo). */
interface Sentence {
  text: string;
  isQuestion: boolean;
  breakBefore: string;
}

/** Frase de um item de lista numerada ("1. Reinstale o cliente."): o número fica junto. */
const SENTENCE = /(?:\d+[.)]\s+)?[^.!?]+(?:[.!?]+|$)/g;

/** Quebra em frases, linha a linha, guardando as quebras para remontar o texto. */
export function splitSentences(text: string): Sentence[] {
  const sentences: Sentence[] = [];
  let pendingBreak = "";
  for (const line of text.split("\n")) {
    if (line.trim() === "") {
      if (sentences.length > 0) pendingBreak = "\n\n";
      continue;
    }
    const pieces = (line.match(SENTENCE) ?? []).map((piece) => piece.trim()).filter(Boolean);
    pieces.forEach((piece, index) => {
      const breakBefore = index > 0 ? " " : sentences.length === 0 ? "" : pendingBreak || "\n";
      sentences.push({ text: piece, isQuestion: piece.endsWith("?"), breakBefore });
    });
    pendingBreak = "";
  }
  return sentences;
}

export function questionsIn(text: string): string[] {
  return splitSentences(text)
    .filter((sentence) => sentence.isQuestion)
    .map((sentence) => sentence.text);
}

/** Remonta as frases com as quebras originais; a primeira não tem quebra antes. */
function joinSentences(sentences: Sentence[]): string {
  return sentences
    .map((sentence, index) => {
      if (index === 0) return sentence.text;
      return breakBefore(sentence, sentences[index - 1]) + sentence.text;
    })
    .join("")
    .trim();
}

/** A pergunta acrescentada vai na linha da última frase, ou na seguinte depois de uma lista. */
function breakBefore(sentence: Sentence, previous: Sentence): string {
  if (sentence.breakBefore !== APPENDED) return sentence.breakBefore;
  return /^\d+[.)]\s/.test(previous.text) ? "\n" : " ";
}

const APPENDED = "appended";

function appended(question: string): Sentence {
  return { text: question, isQuestion: true, breakBefore: APPENDED };
}

export type KnownQuestion = "impact" | "blocked" | "deadlineToday" | "os" | "article_worked";

/** De que trata uma pergunta do modelo, se for uma das conhecidas. */
export function classifyQuestion(question: string): KnownQuestion | null {
  const text = normalizeText(question);
  if (
    /sistema operacional|\bwindows\b|\bmac ?os\b|\blinux\b|versao do (seu )?(windows|sistema)/.test(
      text,
    )
  ) {
    return "os";
  }
  if (/\b(compromisso|prazo|urgen|reuniao|entrega)\b|\bhoje\b/.test(text)) return "deadlineToday";
  if (
    /outro jeito|(consegue|consegues|da para|da pra) (trabalhar|seguir|continuar|contornar)|impedid|alternativa|parad/.test(
      text,
    )
  ) {
    return "blocked";
  }
  if (
    /afetad|impacto|quem (mais )?(esta|e)|so (voce|com voce)|sua equipe|outras pessoas|mais alguem|outros colegas/.test(
      text,
    )
  ) {
    return "impact";
  }
  if (/\b(resolveu|respondeu|ajudou|funcionou|deu certo|conseguiu resolver)\b/.test(text)) {
    return "article_worked";
  }
  return null;
}

/** Frases que não podem ficar ao lado de uma pergunta em código (prometem coisa decidida aqui). */
const DECIDED_IN_CODE =
  /cr[ií]tic|prioridade|urgente|prazo|rascunho|\bcard\b|criei|abri o chamado/i;

/**
 * Troca as perguntas do modelo pela pergunta definida em código. Ficam as frases que não são
 * perguntas (até duas, sem prometer prioridade nem rascunho) e, no fim, a pergunta.
 */
export function withCodeQuestion(text: string, question: string): string {
  const statements = splitSentences(text)
    .filter((sentence) => !sentence.isQuestion && !DECIDED_IN_CODE.test(sentence.text))
    .filter((sentence) => classifyQuestion(sentence.text) !== "os");
  const kept = statements.length > 2 ? statements.slice(0, 2) : statements;
  return joinSentences([...kept, appended(question)]);
}

/**
 * O texto inteiro da pergunta de abertura, em código: as frases do modelo nesse turno narravam
 * o sistema ("aguarde a próxima tela") ou prometiam prioridade. Abre com um acolhimento curto
 * e termina na pergunta.
 */
export function intakeText(question: AnyIntakeQuestion, continuing: boolean): string {
  const opening = continuing
    ? "Anotado."
    : "Vou registrar um chamado para isso. Antes, preciso de alguns detalhes.";
  return `${opening} ${question.question}`;
}

/** Uma pergunta por turno: fica a última, as anteriores saem. */
export function keepOneQuestion(text: string): { text: string; removed: string[] } | null {
  const sentences = splitSentences(text);
  const questions = sentences.filter((sentence) => sentence.isQuestion);
  if (questions.length <= 1) return null;
  const last = questions.at(-1);
  const removed = questions.slice(0, -1).map((sentence) => sentence.text);
  const kept = sentences.filter((sentence) => !sentence.isQuestion || sentence === last);
  return { text: joinSentences(kept), removed };
}

const SAYS_NOT_FOUND = /n[aã]o (encontrei|achei|localizei)/i;

/**
 * Sem as frases de "não encontrei": com o seletor na resposta, os chamados foram encontrados
 * (QA R1: "Não encontrei esse chamado entre os seus." vinha antes de "Qual desses chamados?").
 */
export function withoutNotFound(text: string): string {
  return joinSentences(
    splitSentences(text).filter((sentence) => !SAYS_NOT_FOUND.test(sentence.text)),
  );
}

/** Sem as perguntas (o seletor de chamados já traz a dele). */
export function withoutQuestions(text: string): string {
  return joinSentences(splitSentences(text).filter((sentence) => !sentence.isQuestion));
}

/** "Você consegue...?", "Quer que eu...?", "Posso...?": pergunta de sim ou não. */
const YES_NO_START =
  /^(voce |vc )?(ja |ainda |nao )?(consegue|conseguiu|quer|gostaria|deseja|prefere|pode|podemos|tem|tentou|esta|e |foi|sabe|precisa|houve|ha |aparece|isso|posso|devo|seria)\b|^(voce|vc|ja)\b/;
/** Pergunta aberta: pede um dado, não um sim ou não. */
const OPEN_QUESTION = /\b(qual|quais|quando|onde|como|quanto|quantos|quantas|quem|por que|o que)\b/;

/** As opções Sim/Não, quando a última frase é uma pergunta fechada sem alternativas no texto. */
export function closedQuestionOptions(text: string): string[] | null {
  const question = questionsIn(text).at(-1);
  if (!question || !text.trim().endsWith("?")) return null;
  const normalized = normalizeText(question).trim();
  if (/\bou\b/.test(normalized) || OPEN_QUESTION.test(normalized)) return null; // "A ou B?"
  return YES_NO_START.test(normalized) ? YES_NO : null;
}

/** Markdown cru que o chat não renderiza: citação, negrito, itálico com sublinhado e títulos. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/^[ \t]*>+[ \t]?/gm, "")
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
    .replace(/\*\*|__/g, "")
    .replace(/`([^`\n]+)`/g, "$1");
}

export function correction(rule: ReplyCorrection["rule"], explanation: string): ReplyCorrection {
  return { rule, explanation };
}

/** Todas as frases que não são perguntas e, no fim, a pergunta (os passos do artigo ficam). */
export function withFinalQuestion(text: string, question: string): string {
  const statements = splitSentences(text).filter((sentence) => !sentence.isQuestion);
  return joinSentences([...statements, appended(question)]);
}

/** A resposta segue o artigo: passos numerados ou a pergunta se resolveu, ajudou, funcionou. */
export function looksLikeArticleAnswer(text: string): boolean {
  if (/^\s*\d+[.)]\s/m.test(text)) return true;
  return questionsIn(text).some((question) => classifyQuestion(question) === "article_worked");
}

const EXPLAINS_NOT_APPLYING =
  /n[aã]o (se )?aplica|n[aã]o vale|s[oó] (vale|serve|funciona)|apenas para|somente para|n[aã]o serve/i;

/**
 * F1: com o Windows 11, o artigo do erro 809 (só Windows 10) não vale e o agent precisa dizer
 * por quê antes de seguir para o chamado. Devolve a frase, ou `null` se o texto já explica.
 */
export function inapplicableArticleSentence(
  text: string,
  article: { title: string; appliesTo: string[]; knownValue: string | null },
): string | null {
  if (EXPLAINS_NOT_APPLYING.test(text) || article.knownValue === null) return null;
  return `O artigo "${article.title}" vale só para ${article.appliesTo.join(" ou ")}, então não se aplica ao seu ${article.knownValue}.`;
}
