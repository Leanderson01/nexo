import type { TicketSummary } from "@/domain/ticket";

import type { AgentStore, HistoryMessage, TurnSnapshot, TurnStatePatch } from "./agent-store";
import { endingWithUserText, toChatHistory, type ChatMessage } from "./history";
import type { ModelUsage } from "./turn-usage";

// Carrega o contexto do turno (§5.2, §6.7): estado e últimas 12 mensagens do Convex, o resumo
// acumulado (refeito pelo modelo rápido a cada 10 mensagens) e o momento da mensagem anterior,
// que decide o contexto de retorno depois de 12 horas (§8 F6).

export const RETURN_CONTEXT_AFTER_MS = 12 * 60 * 60 * 1000;

export type Summarize = (
  previousSummary: string | null,
  messages: HistoryMessage[],
) => Promise<{ summary: string; usage: ModelUsage } | null>;

export interface LoadedContext {
  snapshot: TurnSnapshot;
  /** Últimas mensagens, terminando na mensagem atual do funcionário. */
  history: ChatMessage[];
  rollingSummary: string | null;
  /** Resumo novo para gravar no fim do turno, quando foi refeito. */
  summaryPatch: Pick<TurnStatePatch, "rollingSummary" | "summarizedMessageCount"> | null;
  /** Uso do modelo rápido no resumo, para entrar no custo do turno. */
  summaryUsage: ModelUsage | null;
  /** Quando foi a mensagem anterior à atual; `null` numa conversa nova. */
  previousMessageAt: number | null;
}

export async function loadContext(options: {
  store: Pick<AgentStore, "loadTurnContext">;
  userText: string;
  summarize: Summarize;
}): Promise<LoadedContext | null> {
  const snapshot = await options.store.loadTurnContext();
  if (!snapshot) return null;

  let rollingSummary = snapshot.conversation.rollingSummary;
  let summaryPatch: LoadedContext["summaryPatch"] = null;
  let summaryUsage: ModelUsage | null = null;
  if (snapshot.messagesToSummarize.length > 0) {
    const refreshed = await options.summarize(rollingSummary, snapshot.messagesToSummarize);
    if (refreshed) {
      rollingSummary = refreshed.summary;
      summaryPatch = {
        rollingSummary: refreshed.summary,
        summarizedMessageCount: snapshot.messageCount,
      };
      summaryUsage = refreshed.usage;
    }
  }

  return {
    snapshot,
    history: endingWithUserText(toChatHistory(snapshot.recentMessages), options.userText),
    rollingSummary,
    summaryPatch,
    summaryUsage,
    previousMessageAt: snapshot.recentMessages.at(-2)?.createdAt ?? null,
  };
}

/**
 * Contexto de retorno (§8 F6): se a última mensagem foi há mais de 12 horas, o agent começa
 * retomando o assunto. Com chamado em foco, diz se ele teve atualização desde então.
 */
export function buildReturnContext(options: {
  previousMessageAt: number | null;
  now: number;
  selectedTicket: TicketSummary | null;
}): string | null {
  const { previousMessageAt, now, selectedTicket } = options;
  if (previousMessageAt === null || now - previousMessageAt <= RETURN_CONTEXT_AFTER_MS) {
    return null;
  }
  if (!selectedTicket) {
    return "O funcionário voltou depois de mais de 12 horas. Comece retomando, em uma frase, o assunto da última conversa.";
  }
  const news =
    selectedTicket.lastActivityAt > previousMessageAt
      ? "ele teve uma atualização desde então"
      : "ele não teve atualização desde então";
  return `O funcionário voltou depois de mais de 12 horas. Comece com uma frase de retomada, como: "Da última vez falamos do ${selectedTicket.code}; ${news}."`;
}
