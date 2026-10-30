import { OUT_OF_SCOPE_AREA_LABELS } from "@/domain/labels";

import { classifyOutOfScope } from "./classify-out-of-scope";
import type { Policy, PolicyResult, TurnContext } from "./policy";

/**
 * §6.3, item 1: assunto que não é de TI é redirecionado à área certa, sem chamado.
 *
 * Sempre curto-circuita: área conhecida vira redirecionamento; pedido para mudar as regras
 * (tentativa de injeção) ou assunto fora de TI sem área vira recusa educada, escrita em código,
 * sem chamar o modelo principal. Ver `classify-out-of-scope.ts`.
 */
export const outOfScopePolicy: Policy = {
  name: "OutOfScopePolicy",
  evaluate(ctx: TurnContext): PolicyResult {
    if (ctx.understanding.intent !== "out_of_scope") {
      return { outcome: "not_applicable", note: "Assunto de TI." };
    }

    const classification = classifyOutOfScope(ctx.understanding.summary);
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
