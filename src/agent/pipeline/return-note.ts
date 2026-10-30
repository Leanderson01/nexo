import { confidenceLevel } from "@/agent/policies/low-confidence-policy";
import type { Understanding } from "@/domain/understanding";
import { normalizeText, splitWords, STOPWORDS } from "@/shared/normalize-text";

// Nota do analista ao devolver a conversa (§5.11, §7.5). No QA, "E aí, conseguiu?" depois da
// devolução virava `talk_to_analyst` e transferia de novo, ou caía em baixa confiança, e a nota
// era apagada sem uso. Regras em código para o primeiro turno com a nota:
// - a mensagem sobre o que o analista fez não é pedido de analista nem mensagem vaga: a nota é
//   o contexto (vira `question` com confiança alta);
// - pedir uma pessoa com todas as letras continua transferindo;
// - a nota só é apagada depois de um turno que a usou de fato na resposta.

/** Confiança de uma pergunta sobre a nota: alta (≥ 0,75, §6.2). */
const NOTE_CONTEXT_CONFIDENCE = 0.8;

/** "quero falar com o analista", "me passa para uma pessoa", "atendente". */
const ASKS_FOR_A_PERSON =
  /\b(falar|conversar|fale|passa|passe|transfer\w*|chama|chame|quero|preciso)\b.*\b(analista|atendente|humano|pessoa|alguem do suporte|tecnico)\b|\b(analista|atendente|humano|pessoa) de novo\b/;

export function asksForAPerson(userText: string): boolean {
  return ASKS_FOR_A_PERSON.test(normalizeText(userText));
}

export function applyReturnNoteRules(
  understanding: Understanding,
  userText: string,
  returnNote: string | null,
): { understanding: Understanding; adjusted: boolean } {
  if (!returnNote) return { understanding, adjusted: false };
  const handoffByMistake = understanding.intent === "talk_to_analyst" && !asksForAPerson(userText);
  const vague =
    understanding.intent === "unclear" || confidenceLevel(understanding.confidence) !== "high";
  if (!handoffByMistake && !vague) return { understanding, adjusted: false };
  if (understanding.intent === "out_of_scope") return { understanding, adjusted: false };
  return {
    understanding: {
      ...understanding,
      intent:
        handoffByMistake || understanding.intent === "unclear" ? "question" : understanding.intent,
      confidence: Math.max(understanding.confidence, NOTE_CONTEXT_CONFIDENCE),
      confidenceReason:
        "Primeira mensagem depois da devolução: o funcionário fala do que o analista fez, e a nota do analista dá o contexto.",
    },
    adjusted: true,
  };
}

/**
 * A resposta usou a nota: cita um código dela ou repete ao menos duas palavras de conteúdo
 * (ex.: "convite", "Figma"). Sem isso, a nota não é apagada.
 */
export function replyUsesNote(replyText: string, returnNote: string): boolean {
  const codes = returnNote.match(/\b(INC|REQ)-\d{5}\b/gi) ?? [];
  if (codes.some((code) => replyText.toUpperCase().includes(code.toUpperCase()))) return true;
  const noteWords = new Set(contentStems(returnNote));
  const shared = new Set(contentStems(replyText).filter((stem) => noteWords.has(stem)));
  return shared.size >= 2;
}

function contentStems(text: string): string[] {
  return splitWords(text)
    .filter((word) => word.length >= 4 && !STOPWORDS.has(word) && !GENERIC.has(word))
    .map((word) => word.slice(0, 5));
}

/** Palavras que qualquer resposta tem e não mostram que a nota foi usada. */
const GENERIC = new Set(["analista", "voce", "isso", "chamado", "explique", "esta", "ela", "dele"]);

export const RETURN_NOTE_RETRY_INSTRUCTION = `## Correção (decidida em código)
A sua resposta anterior não usou a nota do analista ao devolver a conversa. Responda de novo ao funcionário com base nessa nota: explique em linguagem simples o que o analista viu ou fez e o que falta (se faltar). Não transfira para um analista.`;
