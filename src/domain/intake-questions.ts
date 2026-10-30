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
