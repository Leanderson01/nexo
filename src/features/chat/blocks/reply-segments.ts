import type { MessagePart } from "@/domain/message-parts";

type QuickRepliesPart = Extract<MessagePart, { type: "quickReplies" }>;

/**
 * Como uma resposta aparece na tela: texto vai num balão e as opções rápidas que vêm logo
 * depois dele entram no mesmo balão (protótipos 02 e 03); os outros blocos ficam soltos.
 */
export type ReplySegment =
  | { kind: "bubble"; text: string; quickReplies: QuickRepliesPart | null }
  | { kind: "block"; part: Exclude<MessagePart, { type: "text" }> };

export function toReplySegments(parts: MessagePart[]): ReplySegment[] {
  const segments: ReplySegment[] = [];
  for (const part of parts) {
    const previous = segments.at(-1);
    if (part.type === "text") {
      segments.push({ kind: "bubble", text: part.text, quickReplies: null });
    } else if (
      part.type === "quickReplies" &&
      previous?.kind === "bubble" &&
      previous.quickReplies === null
    ) {
      previous.quickReplies = part;
    } else {
      segments.push({ kind: "block", part });
    }
  }
  return segments;
}

interface MessageLike {
  role: string;
  parts: MessagePart[];
}

/**
 * O que o funcionário mandou depois da mensagem `index`: se for o texto de uma opção rápida
 * ou de uma linha do seletor, ela aparece marcada como escolhida.
 */
export function findChosenText(messages: MessageLike[], index: number): string | null {
  const nextUserMessage = messages.slice(index + 1).find((message) => message.role === "user");
  if (!nextUserMessage) return null;
  return nextUserMessage.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
}

/**
 * Separa a pergunta final do texto de um balão com opções rápidas, para ela aparecer em
 * destaque como no protótipo 02 ("Quem está sendo afetado?"). Só vale quando a pergunta é o
 * último parágrafo e tem uma linha; sem isso, o texto fica inteiro e `question` vem null.
 */
export function splitFinalQuestion(text: string): { body: string; question: string | null } {
  const breakAt = text.trimEnd().lastIndexOf("\n\n");
  if (breakAt === -1) return { body: text, question: null };
  const question = text.slice(breakAt).trim();
  if (!question.endsWith("?") || question.includes("\n")) return { body: text, question: null };
  return { body: text.slice(0, breakAt).trimEnd(), question };
}
