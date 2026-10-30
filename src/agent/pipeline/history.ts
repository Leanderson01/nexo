import { HANDOFF_REASON_LABELS } from "@/domain/labels";
import type { MessagePart } from "@/domain/message-parts";

import type { HistoryMessage } from "./agent-store";

// Histórico do Convex no formato que o Mastra recebe (§5.2: o contexto entra pelas mensagens,
// sem memória do Mastra). As partes estruturadas viram uma anotação curta entre parênteses,
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
  ticket_updated: "o suporte atualizou um chamado",
} as const;

/** Uma parte como o modelo a lê. */
export function describePart(part: MessagePart): string {
  switch (part.type) {
    case "text":
      return part.text;
    case "article":
      return note(`card do artigo "${part.title}"`);
    case "ticket":
      return note(`card do chamado ${part.code}`);
    case "ticketSelector":
      return note(`seletor de chamados (${part.codes.join(", ")}): ${part.prompt}`);
    case "draft":
      return note("card de rascunho para o funcionário confirmar");
    case "quickReplies":
      // Fica de fora: medido na T10, o modelo copiava a anotação das opções no texto em vez de
      // chamar offerQuickReplies. A resposta do funcionário já é o rótulo escolhido.
      return "";
    case "handoff":
      return note(`transferido para analista: ${HANDOFF_REASON_LABELS[part.reason]}`);
    case "event":
      return note(
        part.ticketCode ? `${EVENT_NOTES[part.kind]} (${part.ticketCode})` : EVENT_NOTES[part.kind],
      );
    case "error":
      return note(`erro mostrado: ${part.message}`);
  }
}

/**
 * Anotação de um bloco que o funcionário viu. Fica entre parênteses e com "mostrado pelo
 * sistema" para o modelo não copiar o formato no texto (ele cria os blocos pelas tools).
 */
function note(description: string): string {
  return `(mostrado pelo sistema: ${description})`;
}

function messageContent(message: HistoryMessage): string {
  const text = message.parts
    .map(describePart)
    .filter((piece) => piece !== "")
    .join("\n")
    .trim();
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
