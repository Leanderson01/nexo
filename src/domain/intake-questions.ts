import { normalizeText } from "@/shared/normalize-text";

import type { SaidSignals, SignalName, SignalValue } from "./signal-evidence";
import { sentenceSupports } from "./signal-evidence";

// Perguntas da abertura de chamado (§8 F4 passo 1), definidas em código: texto e opções sempre
// coerentes, uma por turno, e a resposta lida em código (a opção escolhida vale como sinal).
// O modelo não escolhe o texto nem os botões destas perguntas.

export interface IntakeOption<Name extends SignalName> {
  label: string;
  value: SignalValue<Name>;
}

export interface IntakeQuestion<Name extends SignalName> {
  signal: Name;
  question: string;
  options: IntakeOption<Name>[];
}

export const IMPACT_QUESTION: IntakeQuestion<"impact"> = {
  signal: "impact",
  question: "Quem está sendo afetado por isso?",
  options: [
    { label: "Só eu", value: "individual" },
    { label: "Minha equipe", value: "team" },
    { label: "A empresa toda", value: "company" },
  ],
};

export const BLOCKED_QUESTION: IntakeQuestion<"blocked"> = {
  signal: "blocked",
  question: "Consegue trabalhar de outro jeito por enquanto?",
  options: [
    { label: "Sim, dá para seguir", value: false },
    { label: "Não, sem alternativa", value: true },
  ],
};

export const DEADLINE_QUESTION: IntakeQuestion<"deadlineToday"> = {
  signal: "deadlineToday",
  question: "Há algum compromisso hoje que depende disso?",
  options: [
    { label: "Sim, tenho compromisso hoje", value: true },
    { label: "Não, pode esperar", value: false },
  ],
};

export type AnyIntakeQuestion =
  typeof IMPACT_QUESTION | typeof BLOCKED_QUESTION | typeof DEADLINE_QUESTION;

export const INTAKE_QUESTIONS: readonly AnyIntakeQuestion[] = [
  IMPACT_QUESTION,
  BLOCKED_QUESTION,
  DEADLINE_QUESTION,
];

/**
 * O que ainda falta perguntar, um de cada vez: impacto, bloqueio e, só quando muda a
 * prioridade, a urgência. Com bloqueio, a prioridade já é Alta ou Crítica com ou sem
 * compromisso hoje (§3.5), então a urgência não é perguntada.
 */
export function nextMissingSignal(signals: SaidSignals): AnyIntakeQuestion | null {
  if (signals.impact === null) return IMPACT_QUESTION;
  if (signals.blocked === null) return BLOCKED_QUESTION;
  if (signals.blocked === false && signals.deadlineToday === null) return DEADLINE_QUESTION;
  return null;
}

/** Os sinais bastam para derivar a prioridade (a mesma regra de `nextMissingSignal`). */
export function hasEnoughSignals(signals: SaidSignals): boolean {
  return nextMissingSignal(signals) === null;
}

/** A pergunta de abertura feita neste texto do assistente, se houver. */
export function intakeQuestionIn(assistantText: string): AnyIntakeQuestion | null {
  return INTAKE_QUESTIONS.find((item) => assistantText.includes(item.question)) ?? null;
}

const SAID_YES = /^(sim|s|isso|claro|tenho|ha|consigo|da)\b/;
const SAID_NO = /^(nao|n|nenhum|nada)\b(?! sei)/;

/**
 * A resposta do funcionário a uma pergunta de abertura: a opção (pelo rótulo) ou, digitada,
 * um "sim"/"não" ou uma frase que diz o valor. `null` quando não dá para ler.
 */
export function readIntakeAnswer<Name extends SignalName>(
  question: IntakeQuestion<Name>,
  userText: string,
): SignalValue<Name> | null {
  const typed = normalizeText(userText).trim();
  const option = question.options.find((item) => normalizeText(item.label) === typed);
  if (option) return option.value;

  if (question.signal === "impact") {
    const said = question.options.find((item) =>
      sentenceSupports(question.signal, item.value, userText),
    );
    return said ? said.value : null;
  }
  // Sim/não respondem à pergunta: no bloqueio, "sim" (consigo) quer dizer não bloqueado.
  const yes = SAID_YES.test(typed);
  const no = SAID_NO.test(typed);
  if (yes === no) return null;
  const answer = question.signal === "blocked" ? !yes : yes;
  return answer as SignalValue<Name>;
}

// Atualização de um chamado aberto em que um sinal do ENTENDER não se confirmou na fala (QA
// R1, F3): em vez de seguir sem ele, o agent pergunta, com a mesma pergunta da abertura. O
// texto cita o chamado, e a resposta (no turno seguinte) continua a atualização dele.

const UPDATING_TICKET = /^Para atualizar o ((?:INC|REQ)-\d{5}), preciso confirmar uma coisa\./;

export function updateQuestionText(code: string, question: AnyIntakeQuestion): string {
  return `Para atualizar o ${code}, preciso confirmar uma coisa. ${question.question}`;
}

/** O chamado que a pergunta deste texto do assistente está atualizando, se for o caso. */
export function updatingTicketIn(assistantText: string): string | null {
  return UPDATING_TICKET.exec(assistantText.trim())?.[1] ?? null;
}

// Perguntas de sinal feitas pelo modelo (fora das de abertura), como "A impressora está
// bloqueando seu trabalho ou só incomoda?" com "Sim, está bloqueando": a resposta dele a uma
// pergunta do agent é a evidência do sinal, lida em código como a opção da abertura.

/** "Está bloqueando/impedindo seu trabalho?": o "sim" quer dizer bloqueado. */
const ASKS_IF_BLOCKED =
  /\b(bloqueando|bloqueia|impedindo|impede|impedid\w*|parad\w*|travando (o |seu )?trabalho)\b/;
/** "Consegue trabalhar de outro jeito?": o "sim" quer dizer que há alternativa. */
const ASKS_FOR_WORKAROUND =
  /\b(outro jeito|alternativa|contornar|(consegue|da para|da pra|tem como) (trabalhar|seguir|continuar))\b/;
const ASKS_FOR_DEADLINE = /\b(compromisso|prazo|urgen\w*|reuniao|entrega)\b/;
const ASKS_FOR_IMPACT =
  /\b(afetad\w*|impacto|quem (mais )?(esta|e)|so (voce|com voce)|sua equipe|outras pessoas|mais alguem|outros colegas)\b/;

const SAID_BLOCKING = /\b(bloqueando|bloqueia|impedindo|impede|sem alternativa|parad[oa]s?)\b/;
const SAID_ONLY_BOTHERS = /\b(incomoda|atrapalha|da para seguir|da pra seguir)\b/;

/** A última pergunta do texto (a frase que termina em "?"). */
function lastQuestion(text: string): string | null {
  const questions = text.match(/[^.!?\n]+\?/g);
  return questions ? questions[questions.length - 1].trim() : null;
}

/**
 * O sinal que o funcionário respondeu a uma pergunta do agent que não é de abertura, ou
 * `null` se a pergunta não é de sinal ou a resposta não dá para ler.
 */
export function readAskedSignalAnswer(
  assistantText: string,
  userText: string,
): Partial<SaidSignals> | null {
  const question = lastQuestion(assistantText);
  if (!question || intakeQuestionIn(assistantText)) return null;
  const asked = normalizeText(question);
  const typed = normalizeText(userText).trim();
  const yes = SAID_YES.test(typed);
  const no = SAID_NO.test(typed);

  const asksIfBlocked = ASKS_IF_BLOCKED.test(asked);
  const asksForWorkaround = ASKS_FOR_WORKAROUND.test(asked);
  if (asksIfBlocked || asksForWorkaround) {
    if (SAID_BLOCKING.test(typed)) return { blocked: true };
    if (SAID_ONLY_BOTHERS.test(typed)) return { blocked: false };
    if (yes === no) return null;
    // "Está bloqueando?": sim = bloqueado. "Consegue de outro jeito?": sim = não bloqueado.
    return { blocked: asksIfBlocked && !asksForWorkaround ? yes : !yes };
  }
  if (ASKS_FOR_DEADLINE.test(asked)) {
    if (sentenceSupports("deadlineToday", false, userText)) return { deadlineToday: false };
    if (yes === no) return null;
    return { deadlineToday: yes };
  }
  if (ASKS_FOR_IMPACT.test(asked)) {
    const said = IMPACT_QUESTION.options.find(
      (item) =>
        normalizeText(item.label) === typed || sentenceSupports("impact", item.value, userText),
    );
    return said ? { impact: said.value } : null;
  }
  return null;
}
