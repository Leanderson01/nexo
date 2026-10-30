import { OUT_OF_SCOPE_AREA_LABELS } from "@/domain/labels";
import type { TicketSignals } from "@/domain/understanding";

import { classifyOutOfScope } from "./classify-out-of-scope";
import type { Policy, PolicyResult, TurnContext } from "./policy";

/**
 * §6.3, item 1: assunto que não é de TI é redirecionado à área certa, sem chamado.
 *
 * Sempre curto-circuita: área conhecida vira redirecionamento; pedido para mudar as regras
 * (tentativa de injeção) ou assunto fora de TI sem área vira recusa educada, escrita em código,
 * sem chamar o modelo principal. Ver `classify-out-of-scope.ts`.
 *
 * Salvaguarda (decisão 25): sistema fora do ar é TI mesmo quando o assunto do sistema é de
 * outra área ("o sistema de folha de ponto caiu para a equipe"). Se o ENTENDER marcou fora de
 * escopo, mas os sinais dizem que uma equipe (ou a empresa) está parada, a política não recusa
 * e o turno segue como incidente. Pedido para mudar as regras continua sendo recusado sempre.
 */
export const outOfScopePolicy: Policy = {
  name: "OutOfScopePolicy",
  evaluate(ctx: TurnContext): PolicyResult {
    if (ctx.understanding.intent !== "out_of_scope") {
      return { outcome: "not_applicable", note: "Assunto de TI." };
    }

    const classification = classifyOutOfScope(ctx.understanding.summary);
    if (classification.kind !== "rule_change" && isGroupOutage(ctx.understanding.ticketSignals)) {
      return {
        outcome: "not_applicable",
        note: "Marcado como fora de TI, mas há uma equipe (ou a empresa) parada, sem alternativa: sistema fora do ar é TI, então segue como incidente.",
      };
    }
    switch (classification.kind) {
      case "area": {
        const label = OUT_OF_SCOPE_AREA_LABELS[classification.area];
        return {
          outcome: "triggered",
          action: { kind: "redirect_out_of_scope", area: classification.area },
          explanation: `Assunto de ${label} (citou "${classification.matchedTerm}"), não de TI: redireciona para ${label}, sem abrir chamado.`,
        };
      }
      case "rule_change":
        return {
          outcome: "triggered",
          action: { kind: "refuse", topic: "rule_change" },
          explanation: `Pedido para mudar as regras do atendimento (citou "${classification.matchedTerm}"): recusa educada, sem chamar o modelo; só os chamados do próprio funcionário podem ser mostrados.`,
        };
      case "unknown_area":
        return {
          outcome: "triggered",
          action: { kind: "refuse", topic: "not_it" },
          explanation:
            "Fora de TI, sem área identificada (RH, Financeiro ou Facilities): explica que o Nexo Assist atende só TI, sem abrir chamado.",
        };
    }
  },
};

/** Impacto de equipe ou empresa e bloqueio: sinal claro de sistema parado (§3.5, Crítica). */
export function isGroupOutage(signals: TicketSignals): boolean {
  const affectsGroup = signals.impact === "team" || signals.impact === "company";
  return affectsGroup && signals.blocked === true;
}
