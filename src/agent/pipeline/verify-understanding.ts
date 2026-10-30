import type { ReplyCorrection } from "@/domain/decision-record";
import { verifySignals, type SignalName } from "@/domain/signal-evidence";
import { saidOperatingSystem } from "@/domain/ticket-description";
import type { Understanding } from "@/domain/understanding";
import { normalizeText } from "@/shared/normalize-text";

import type { ConversationFacts } from "./conversation-facts";
import type { SignalQuotes } from "./understanding-schema";

// Depois do ENTENDER, em código: impacto, bloqueio, urgência e sistema operacional só ficam se
// o funcionário disse ou escolheu numa opção (QA de ponta a ponta: "o Wi-Fi da sala 3 caiu"
// virava Crítico com "equipe parada"; "sem compromisso hoje" virava compromisso). O que não se
// sustenta vira nulo: a prioridade não é derivada e o agent pergunta o que falta.

const SIGNAL_LABELS: Record<SignalName, string> = {
  impact: "impacto",
  blocked: "bloqueio",
  deadlineToday: "compromisso hoje",
};

export function verifyUnderstanding(
  understanding: Understanding,
  quotes: SignalQuotes,
  facts: ConversationFacts,
): { understanding: Understanding; corrections: ReplyCorrection[] } {
  const { kind, category, ...claimed } = understanding.ticketSignals;
  const verified = verifySignals({
    claimed,
    quotes,
    answered: facts.answeredSignals,
    employeeTexts: facts.employeeTexts,
  });
  const os = verifiedOs(understanding.entities.os, facts.employeeTexts);

  const corrections: ReplyCorrection[] = [];
  if (verified.dropped.length > 0) {
    const dropped = verified.dropped
      .map(({ signal, value }) => `${SIGNAL_LABELS[signal]} = ${value}`)
      .join(", ");
    corrections.push({
      rule: "unsupported_signal",
      explanation: `O ENTENDER trouxe ${dropped} sem nada na fala do funcionário que sustente; o sinal foi descartado e o agent pergunta (§3.5: só vale o que ele disse).`,
    });
  }
  if (understanding.entities.os !== null && os === null) {
    corrections.push({
      rule: "unsupported_signal",
      explanation: `O ENTENDER trouxe o sistema operacional "${understanding.entities.os}", que o funcionário não informou; foi descartado.`,
    });
  }

  return {
    understanding: {
      ...understanding,
      entities: { ...understanding.entities, os },
      ticketSignals: { kind, category, ...verified.signals },
    },
    corrections,
  };
}

/** "Não sei" fica se ele disse (a condição do artigo segue desconhecida); o resto, se dito. */
function verifiedOs(os: string | null, employeeTexts: string[]): string | null {
  if (os === null) return null;
  if (normalizeText(os).trim().startsWith("nao sei")) {
    return employeeTexts.some((text) => normalizeText(text).includes("nao sei")) ? os : null;
  }
  return saidOperatingSystem(os, employeeTexts);
}

/** Confiança de uma resposta lida em código (alta, como a opção rápida em short-answers.ts). */
const ANSWERED_CONFIDENCE = 0.9;

/**
 * Resposta a uma pergunta de abertura (feita em código): o assunto continua sendo abrir o
 * chamado. No QA, "Só eu" virava `confirm_or_edit_draft` e a abertura se perdia.
 */
export function continueIntake(
  understanding: Understanding,
  facts: ConversationFacts,
): Understanding {
  if (!facts.answeredIntakeNow) return understanding;
  return {
    ...understanding,
    intent: "open_ticket",
    confidence: Math.max(understanding.confidence, ANSWERED_CONFIDENCE),
    confidenceReason: "Respondeu a uma pergunta da abertura do chamado: o assunto continua.",
  };
}
