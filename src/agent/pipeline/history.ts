import { HANDOFF_REASON_LABELS } from "@/domain/labels";
import type { MessagePart } from "@/domain/message-parts";

import type { HistoryMessage } from "./agent-store";

// Histórico do Convex no formato que o Mastra recebe (§5.2: o contexto entra pelas mensagens,
// sem memória do Mastra). As partes estruturadas viram uma anotação curta entre colchetes,
// para o modelo saber o que o funcionário viu (ex.: as opções da pergunta que ele respondeu).

/** União discriminada por `role`: `{ role: "user" | "assistant" }` não compila no Mastra. */
export type ChatMessage =
  { role: "user"; content: string } | { role: "assistant"; content: string };

const EVENT_NOTES = {
  transferred: "conversa transferida para um analista",
  assigned: "um analista assumiu a conversa",
  returned_to_agent: "a conversa voltou para o Nexo Assist",
  closed: "conversa encerrada",
  draft_cancelled: "rascunho cancelado",
} as const;

/** Uma parte como o modelo a lê. */
export function describePart(part: MessagePart): string {
  switch (part.type) {
    case "text":
      return part.text;
    case "article":
      return `[card do artigo "${part.title}"]`;
    case "ticket":
      return `[card do chamado ${part.code}]`;
    case "ticketSelector":
      return `[seletor de chamados: ${part.prompt} ${part.codes.join(", ")}]`;
    case "draft":
      return "[card de rascunho para o funcionário confirmar]";
    case "quickReplies":
      return `[opções rápidas: ${part.options.map((option) => option.label).join(" | ")}]`;
    case "handoff":
      return `[transferido para analista: ${HANDOFF_REASON_LABELS[part.reason]}]`;
    case "event":
      return `[${EVENT_NOTES[part.kind]}]`;
    case "error":
      return `[erro mostrado: ${part.message}]`;
  }
}

function messageContent(message: HistoryMessage): string {
  const text = message.parts.map(describePart).join("\n").trim();
  if (message.role === "analyst") return `[Analista ${message.authorName ?? ""}]: ${text}`;
  return text;
}

/**
 * Converte as mensagens em turnos de usuário e assistente. Mensagens do analista e do sistema
 * entram como assistente; mensagens seguidas do mesmo papel são juntadas.
 */
export function toChatHistory(messages: HistoryMessage[]): ChatMessage[] {
  const history: ChatMessage[] = [];
  for (const message of messages) {
    const content = messageContent(message);
    if (content === "") continue;
    const role = message.role === "user" ? "user" : "assistant";
    const previous = history.at(-1);
    if (previous?.role === role) {
      previous.content = `${previous.content}\n\n${content}`;
    } else {
      history.push({ role, content });
    }
  }
  return history;
}

/**
 * Garante que o histórico termina com a mensagem atual do funcionário (numa nova tentativa
 * do turno, ela pode não ser a última gravada).
 */
export function endingWithUserText(history: ChatMessage[], userText: string): ChatMessage[] {
  const last = history.at(-1);
  if (last?.role === "user" && last.content.endsWith(userText)) return history;
  return [...history, { role: "user", content: userText }];
}
