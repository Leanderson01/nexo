import { intakeQuestionIn, readIntakeAnswer } from "@/domain/intake-questions";
import type { SaidSignals } from "@/domain/signal-evidence";
import { normalizeText } from "@/shared/normalize-text";

import type { HistoryMessage } from "./agent-store";

// O que a conversa mostra de fato, lido em código das mensagens gravadas: o que o funcionário
// escreveu, as respostas dele às perguntas de abertura (feitas em código) e os artigos que ele
// disse que não resolveram. É a base das conferências contra invenção do modelo.

export interface ConversationFacts {
  /** As mensagens do funcionário na janela do turno, em ordem, terminando na atual. */
  employeeTexts: string[];
  /** Sinais respondidos nas perguntas de abertura; a resposta mais recente vale. */
  answeredSignals: Partial<SaidSignals>;
  /** Títulos dos artigos mostrados com "Isso resolveu?" e respondidos com "Não" (F1 passo 5). */
  articlesTried: string[];
  /** O assistente fez uma pergunta de abertura na resposta anterior. */
  previousAskedIntake: boolean;
  /** A mensagem atual responde (com uma opção ou um sim/não legível) essa pergunta. */
  answeredIntakeNow: boolean;
}

const SAID_NO = /^nao\b(?! sei)/;

export function readConversationFacts(
  messages: HistoryMessage[],
  userText: string,
): ConversationFacts {
  const employeeTexts = messages
    .filter((message) => message.role === "user")
    .map(textOf)
    .filter((text) => text !== "");
  if (employeeTexts.at(-1) !== userText.trim() && userText.trim() !== "") {
    employeeTexts.push(userText.trim());
  }

  const answeredSignals: Partial<SaidSignals> = {};
  const articlesTried: string[] = [];
  let lastAssistant: HistoryMessage | null = null;
  for (const message of messages) {
    if (message.role === "assistant") {
      lastAssistant = message;
      continue;
    }
    if (message.role !== "user" || !lastAssistant) continue;
    const answer = textOf(message);
    const asked = textOf(lastAssistant);
    const question = intakeQuestionIn(asked);
    if (question) {
      const value = readIntakeAnswer(question, answer);
      if (value !== null) setAnswer(answeredSignals, question.signal, value);
    }
    if (/isso resolveu\?/i.test(asked) && SAID_NO.test(normalizeText(answer).trim())) {
      for (const part of lastAssistant.parts) {
        if (part.type === "article" && !articlesTried.includes(part.title)) {
          articlesTried.push(part.title);
        }
      }
    }
    lastAssistant = null;
  }

  const previous = previousAssistantText(messages);
  const previousQuestion = previous === null ? null : intakeQuestionIn(previous);
  return {
    employeeTexts,
    answeredSignals,
    articlesTried,
    previousAskedIntake: previousQuestion !== null,
    answeredIntakeNow:
      previousQuestion !== null && readIntakeAnswer(previousQuestion, userText) !== null,
  };
}

function setAnswer<Name extends keyof SaidSignals>(
  answers: Partial<SaidSignals>,
  signal: Name,
  value: SaidSignals[Name],
): void {
  answers[signal] = value;
}

/** O texto da última resposta do assistente antes da mensagem atual. */
function previousAssistantText(messages: HistoryMessage[]): string | null {
  const lastUser = messages.findLastIndex((message) => message.role === "user");
  const before = lastUser === -1 ? messages : messages.slice(0, lastUser);
  const previous = before.findLast((message) => message.role === "assistant");
  return previous ? textOf(previous) : null;
}

function textOf(message: HistoryMessage): string {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}
