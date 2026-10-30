import { confidenceLevel } from "@/agent/policies/low-confidence-policy";
import type { PolicyEvaluation } from "@/domain/decision-record";
import type { HandoffOffer } from "@/domain/conversation";
import type { ConversationStatus } from "@/domain/enums";
import type { DerivedPriority, TicketSummary } from "@/domain/ticket";
import type { Understanding } from "@/domain/understanding";
import { normalizeText } from "@/shared/normalize-text";

import {
  runPolicies,
  type DecisiveAction,
  type GuidingAction,
} from "@/agent/policies/run-policies";
import { deriveSignalsPriority } from "./derive-signals-priority";

// DECIDIR (§6.3): as políticas da T9, em código, mais a oferta de analista do turno anterior
// (decisão 22). O resultado diz se o turno curto-circuita (`decisiveAction`) ou o que o AGIR
// precisa respeitar (`guidingActions`), e como fica o contador de esclarecimentos.

/** Opções rápidas da oferta de analista do chamado vencido (§8 F2). */
export const ACCEPT_HANDOFF_OFFER = "Sim, chamar um analista";
export const DECLINE_HANDOFF_OFFER = "Não, obrigado";

export interface DecideInput {
  now: number;
  understanding: Understanding;
  userText: string;
  conversationStatus: ConversationStatus;
  clarificationAttempts: number;
  focusedTicket: TicketSummary | null;
  /** Oferta de analista feita no turno anterior e ainda sem resposta. */
  pendingOffer: HandoffOffer | null;
}

export interface TurnDecision {
  evaluations: PolicyEvaluation[];
  decisiveAction: DecisiveAction | null;
  guidingActions: GuidingAction[];
  derivedPriority: DerivedPriority | null;
  /** A oferta que o funcionário aceitou neste turno; a transferência sai com o motivo dela. */
  acceptedOffer: HandoffOffer | null;
  /** Valor de `clarificationAttempts` depois deste turno. */
  clarificationAttempts: number;
}

export function decide(input: DecideInput): TurnDecision {
  const derivedPriority = deriveSignalsPriority(input.understanding.ticketSignals);
  const policies = runPolicies({
    now: input.now,
    understanding: input.understanding,
    conversationStatus: input.conversationStatus,
    clarificationAttempts: input.clarificationAttempts,
    focusedTicket: input.focusedTicket,
    derivedPriority,
  });

  const acceptedOffer = acceptedHandoffOffer(input, policies.decisiveAction);
  const decision: TurnDecision = acceptedOffer
    ? {
        evaluations: withAcceptedOffer(policies.evaluations, acceptedOffer),
        decisiveAction: { kind: "handoff", reason: acceptedOffer.reason },
        guidingActions: [],
        derivedPriority,
        acceptedOffer,
        clarificationAttempts: 0,
      }
    : { ...policies, derivedPriority, acceptedOffer: null, clarificationAttempts: 0 };

  decision.clarificationAttempts = nextClarificationAttempts(input, decision);
  return decision;
}

/**
 * Decisão 22: aceitar a oferta do turno anterior transfere com o motivo da oferta (`overdue`),
 * e não `requested`. Não passa por cima de fora de escopo nem de recusa.
 */
function acceptedHandoffOffer(
  input: DecideInput,
  decisiveAction: DecisiveAction | null,
): HandoffOffer | null {
  if (!input.pendingOffer) return null;
  if (decisiveAction && decisiveAction.kind !== "handoff") return null;
  return isOfferAccepted(input.userText, input.understanding) ? input.pendingOffer : null;
}

/** "Sim, chamar um analista", "sim", "quero" ou um pedido de analista aceitam a oferta. */
export function isOfferAccepted(userText: string, understanding: Understanding): boolean {
  if (understanding.intent === "talk_to_analyst") return true;
  return /^(sim|quero|pode|claro|por favor)\b/.test(normalizeText(userText).trim());
}

function withAcceptedOffer(
  evaluations: PolicyEvaluation[],
  offer: HandoffOffer,
): PolicyEvaluation[] {
  const ticket = offer.ticketCode ? ` do ${offer.ticketCode}` : "";
  return evaluations.map((evaluation) =>
    evaluation.name === "OverdueTicketPolicy"
      ? {
          name: evaluation.name,
          outcome: "triggered",
          actionKind: "handoff",
          explanation: `O funcionário aceitou a oferta de analista feita no turno anterior por causa do prazo vencido${ticket}: transfere com o motivo "chamado vencido" (decisão 22).`,
        }
      : evaluation,
  );
}

/**
 * Esclarecimentos seguidos (§6.2): soma 1 quando o turno pergunta para esclarecer, zera num
 * turno de confiança alta ou numa transferência, e fica como está nos outros casos.
 */
function nextClarificationAttempts(input: DecideInput, decision: TurnDecision): number {
  if (decision.decisiveAction?.kind === "handoff") return 0;
  if (decision.guidingActions.some((action) => action.kind === "ask_clarification")) {
    return input.clarificationAttempts + 1;
  }
  if (confidenceLevel(input.understanding.confidence) === "high") return 0;
  return input.clarificationAttempts;
}
