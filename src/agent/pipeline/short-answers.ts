import type { Understanding } from "@/domain/understanding";
import { normalizeText } from "@/shared/normalize-text";

import type { HistoryMessage } from "./agent-store";

// Respostas curtas a uma pergunta do assistente ("Windows 11", "Não"), conferidas em código.
// O ENTENDER às vezes lê a resposta solta como `unclear` com confiança média ou baixa, e aí a
// LowConfidencePolicy manda perguntar de novo em vez de seguir (vpn-809-windows-11,
// extra-artigo-nao-resolveu). Duas regras:
// - opção rápida que o próprio assistente ofereceu é uma resposta clara: confiança alta; lida
//   como `unclear`, ela segue o assunto em andamento como `question` (o turno consulta a central
//   e o AGIR, que lê a conversa, decide; sem isso o artigo do Windows 10 não era consultado);
// - "Não" a "Isso resolveu?" quer dizer "o artigo não resolveu, siga para o chamado" (F1 passo 5).

/** Confiança mínima de uma resposta clara por construção (alta a partir de 0,75, §6.2). */
const CLEAR_ANSWER_CONFIDENCE = 0.9;

const ASKED_IF_IT_WORKED = /isso resolveu\?/i;
const SAID_NO = /^nao\b(?! sei)/;

export interface PickedReply {
  label: string;
  /** O texto da pergunta que ofereceu a opção. */
  question: string;
}

/** A opção rápida da resposta anterior do assistente que o funcionário escolheu, se for o caso. */
export function findPickedReply(messages: HistoryMessage[], userText: string): PickedReply | null {
  const previous = previousAssistantMessage(messages);
  if (!previous) return null;
  const label = userText.trim();
  const offered = previous.parts.some(
    (part) => part.type === "quickReplies" && part.options.some((option) => option.label === label),
  );
  return offered ? { label, question: textOf(previous) } : null;
}

/** Linha para o estado da conversa que o ENTENDER lê. */
export function describePickedReply(picked: PickedReply): string {
  return `A última mensagem do funcionário ("${picked.label}") é uma das opções rápidas que o assistente ofereceu ao perguntar "${picked.question}": é uma resposta curta que herda o assunto em andamento, com confiança alta.`;
}

/** Aplica as duas regras ao que o ENTENDER devolveu. */
export function applyShortAnswerRules(
  understanding: Understanding,
  messages: HistoryMessage[],
  userText: string,
): Understanding {
  const previous = previousAssistantMessage(messages);
  if (previous && saidNoToArticle(textOf(previous), userText)) {
    return {
      ...understanding,
      intent: "open_ticket",
      confidence: Math.max(understanding.confidence, CLEAR_ANSWER_CONFIDENCE),
      confidenceReason:
        'Respondeu "Não" a "Isso resolveu?": a orientação não resolveu e o atendimento segue para o chamado (F1).',
    };
  }
  const picked = findPickedReply(messages, userText);
  if (picked && understanding.confidence < CLEAR_ANSWER_CONFIDENCE) {
    return {
      ...understanding,
      intent: understanding.intent === "unclear" ? "question" : understanding.intent,
      confidence: CLEAR_ANSWER_CONFIDENCE,
      confidenceReason: `Escolheu "${picked.label}", uma das opções rápidas que o assistente ofereceu: resposta clara.`,
    };
  }
  return understanding;
}

function saidNoToArticle(previousText: string, userText: string): boolean {
  return ASKED_IF_IT_WORKED.test(previousText) && SAID_NO.test(normalizeText(userText).trim());
}

/** A última resposta do assistente antes da mensagem atual do funcionário. */
function previousAssistantMessage(messages: HistoryMessage[]): HistoryMessage | null {
  const lastUser = messages.findLastIndex((message) => message.role === "user");
  const before = lastUser === -1 ? messages : messages.slice(0, lastUser);
  return before.findLast((message) => message.role === "assistant") ?? null;
}

function textOf(message: HistoryMessage): string {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}
