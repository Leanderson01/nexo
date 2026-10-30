import { explainPriority } from "@/domain/priority";

import type { Policy, PolicyResult, TurnContext } from "./policy";

/**
 * §6.3, item 3: caso crítico. O agent não transfere na hora: mostra o rascunho com prioridade
 * Crítica e a transferência acontece ao confirmar (ou se o funcionário recusar o rascunho).
 *
 * Por isso a ação é `offer_handoff` com motivo `critical`, e não `handoff`: o turno não
 * curto-circuita. O pipeline lê `offer_handoff` + `critical` como "propor o rascunho já marcado
 * para transferir na confirmação ou no cancelamento".
 */
export const criticalPolicy: Policy = {
  name: "CriticalPolicy",
  evaluate(ctx: TurnContext): PolicyResult {
    const derived = ctx.derivedPriority;
    if (!derived) {
      return {
        outcome: "not_applicable",
        note: "Sem sinais suficientes para derivar a prioridade.",
      };
    }
    if (derived.priority !== "CRITICAL") {
      return { outcome: "not_applicable", note: `Não é crítico. ${explainPriority(derived)}` };
    }
    return {
      outcome: "triggered",
      action: { kind: "offer_handoff", reason: "critical" },
      explanation: `${explainPriority(derived)} O agent mostra o rascunho e transfere para um analista ao confirmar, ou mesmo se o funcionário recusar.`,
    };
  },
};
