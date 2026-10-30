import {
  intakeQuestionIn,
  readAskedSignalAnswer,
  readIntakeAnswer,
  updatingTicketIn,
} from "@/domain/intake-questions";
import type { SaidSignals } from "@/domain/signal-evidence";
import { normalizeText } from "@/shared/normalize-text";

import type { HistoryMessage } from "./agent-store";

// O que a conversa mostra de fato, lido em código das mensagens gravadas: o que o funcionário
// escreveu, as respostas dele às perguntas de abertura (feitas em código) e os artigos que ele
// disse que não resolveram. É a base das conferências contra invenção do modelo.

export interface ConversationFacts {
  /** As mensagens do funcionário na janela do turno, em ordem, terminando na atual. */
  employeeTexts: string[];
  /**
   * As mensagens que são opções rápidas escolhidas (o rótulo de uma opção da resposta anterior
   * do assistente): respostas, nunca o problema contado.
   */
  quickReplyAnswers: string[];
  /** Sinais respondidos nas perguntas de abertura; a resposta mais recente vale. */
  answeredSignals: Partial<SaidSignals>;
  /** Títulos dos artigos mostrados com "Isso resolveu?" e respondidos com "Não" (F1 passo 5). */
  articlesTried: string[];
  /** O assistente fez uma pergunta de abertura na resposta anterior. */
  previousAskedIntake: boolean;
  /** A pergunta anterior foi feita para atualizar este chamado ("Para atualizar o INC-..."). */
  updatingTicketCode: string | null;
  /** A mensagem atual responde (com uma opção ou um sim/não legível) essa pergunta. */
  answeredIntakeNow: boolean;
  /** Artigos e chamados que o funcionário viu em card na janela (para o resumo do analista). */
  shownArticles: string[];
  shownTicketCodes: string[];
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
  const quickReplyAnswers: string[] = [];
  let lastAssistant: HistoryMessage | null = null;
  for (const message of messages) {
    if (message.role === "assistant") {
      lastAssistant = message;
      continue;
    }
    if (message.role !== "user" || !lastAssistant) continue;
    const answer = textOf(message);
    if (offersOption(lastAssistant, answer)) quickReplyAnswers.push(answer);
    const asked = textOf(lastAssistant);
    const question = intakeQuestionIn(asked);
    if (question) {
      const value = readIntakeAnswer(question, answer);
      if (value !== null) setAnswer(answeredSignals, question.signal, value);
    } else {
      // Pergunta de sinal feita pelo modelo ("Está bloqueando seu trabalho?"): a resposta vale.
      Object.assign(answeredSignals, readAskedSignalAnswer(asked, answer) ?? {});
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

  const shownParts = messages
    .filter((message) => message.role === "assistant")
    .flatMap((message) => message.parts);
  const shownArticles = unique(
    shownParts.flatMap((part) => (part.type === "article" ? [part.title] : [])),
  );
  const shownTicketCodes = unique(
    shownParts.flatMap((part) =>
      part.type === "ticket" ? [part.code] : part.type === "ticketSelector" ? part.codes : [],
    ),
  );

  // A mensagem atual ainda fora da janela: é opção se a última resposta do assistente a ofereceu.
  const current = userText.trim();
  const lastMessage = messages.at(-1);
  if (current !== "" && lastMessage?.role === "assistant" && offersOption(lastMessage, current)) {
    quickReplyAnswers.push(current);
  }

  const previous = previousAssistantText(messages);
  const previousQuestion = previous === null ? null : intakeQuestionIn(previous);
  return {
    employeeTexts,
    quickReplyAnswers,
    answeredSignals,
    articlesTried,
    previousAskedIntake: previousQuestion !== null,
    updatingTicketCode: previous === null ? null : updatingTicketIn(previous),
    answeredIntakeNow:
      previousQuestion !== null && readIntakeAnswer(previousQuestion, userText) !== null,
    shownArticles,
    shownTicketCodes,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
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

/** A resposta do assistente ofereceu esta opção rápida. */
function offersOption(assistant: HistoryMessage, label: string): boolean {
  return assistant.parts.some(
    (part) =>
      part.type === "quickReplies" && part.options.some((option) => option.label === label.trim()),
  );
}

function textOf(message: HistoryMessage): string {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}
