import type { DecisiveAction } from "@/agent/policies/run-policies";
import type { DecisionOutcome, Intent } from "@/domain/enums";

// Como o turno terminou (§6.6 `outcome`), decidido em código a partir do que aconteceu.

export interface OutcomeInput {
  failed: boolean;
  handedOff: boolean;
  decisiveAction: DecisiveAction | null;
  draftProposed: boolean;
  /** A LowConfidencePolicy mandou esclarecer, ou o turno perguntou a condição de um artigo. */
  clarificationRequested: boolean;
  intent: Intent | null;
  /** A resposta mostrou artigo, chamado ou seletor: é resposta, mesmo terminando em pergunta. */
  showedContent: boolean;
  replyText: string;
}

/**
 * Ordem: erro > transferência > redirecionamento ou recusa > rascunho > esclarecimento >
 * resposta. Sem política mandando, uma resposta só de texto que termina em pergunta (ex.:
 * "Qual é o seu Windows?") também conta como esclarecimento; cumprimento não.
 */
export function decideOutcome(input: OutcomeInput): DecisionOutcome {
  if (input.failed) return "error";
  if (input.handedOff) return "handoff";
  if (input.decisiveAction && input.decisiveAction.kind !== "handoff") return "redirected";
  if (input.draftProposed) return "draft_proposed";
  if (input.clarificationRequested) return "asked_clarification";
  if (input.showedContent || input.intent === "greeting_or_smalltalk") return "answered";
  return endsWithQuestion(input.replyText) ? "asked_clarification" : "answered";
}

function endsWithQuestion(text: string): boolean {
  // Tolera o que vem depois do "?" sem ser palavra (espaços, emoji, aspas).
  return /\?[^\p{L}\p{N}]*$/u.test(text);
}
