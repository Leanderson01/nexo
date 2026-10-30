import type { PolicyEvaluation } from "@/domain/decision-record";

import { criticalPolicy } from "./critical-policy";
import { explicitHandoffPolicy } from "./explicit-handoff-policy";
import { lowConfidencePolicy } from "./low-confidence-policy";
import { outOfScopePolicy } from "./out-of-scope-policy";
import { overdueTicketPolicy } from "./overdue-ticket-policy";
import type { Policy, PolicyAction, TurnContext } from "./policy";

/** Ordem da §6.3. Também é a ordem de precedência quando mais de uma dispara. */
export const DECISION_POLICIES: readonly Policy[] = [
  outOfScopePolicy,
  explicitHandoffPolicy,
  criticalPolicy,
  overdueTicketPolicy,
  lowConfidencePolicy,
];

/** Ações que encerram o turno sem chamar o modelo principal. */
export type DecisiveAction = Extract<
  PolicyAction,
  { kind: "handoff" | "redirect_out_of_scope" | "refuse" }
>;
/** Ações que o AGIR precisa respeitar, mas que não encerram o turno. */
export type GuidingAction = Extract<PolicyAction, { kind: "offer_handoff" | "ask_clarification" }>;

export interface PolicyDecision {
  /** Todas as políticas, na ordem, inclusive as que não se aplicam (painel de decisão). */
  evaluations: PolicyEvaluation[];
  /** A primeira ação decisiva na ordem; `null` quando o turno segue para o AGIR. */
  decisiveAction: DecisiveAction | null;
  /** Ações não decisivas, na ordem das políticas. Vazia quando há ação decisiva (o AGIR não roda). */
  guidingActions: GuidingAction[];
}

/**
 * DECIDIR (§6.3). Avalia todas as políticas, sem parar na primeira, para o painel mostrar
 * cada uma. Precedência: vence a primeira ação decisiva na ordem de `DECISION_POLICIES`
 * (fora de escopo ou recusa > pedido explícito > baixa confiança esgotada). Sem ação decisiva, o AGIR
 * recebe todas as não decisivas, na mesma ordem (crítico > vencido > esclarecimento).
 */
export function runPolicies(
  ctx: TurnContext,
  policies: readonly Policy[] = DECISION_POLICIES,
): PolicyDecision {
  const evaluations: PolicyEvaluation[] = [];
  const actions: PolicyAction[] = [];

  for (const policy of policies) {
    const result = policy.evaluate(ctx);
    if (result.outcome === "triggered") {
      evaluations.push({
        name: policy.name,
        outcome: "triggered",
        explanation: result.explanation,
      });
      actions.push(result.action);
    } else {
      evaluations.push({ name: policy.name, outcome: "not_applicable", explanation: result.note });
    }
  }

  const decisiveAction = actions.find(isDecisive) ?? null;
  const guidingActions = decisiveAction ? [] : actions.filter(isGuiding);
  return { evaluations, decisiveAction, guidingActions };
}

function isDecisive(action: PolicyAction): action is DecisiveAction {
  return (
    action.kind === "handoff" || action.kind === "redirect_out_of_scope" || action.kind === "refuse"
  );
}

function isGuiding(action: PolicyAction): action is GuidingAction {
  return !isDecisive(action);
}
