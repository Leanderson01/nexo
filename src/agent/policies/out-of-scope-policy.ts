import { OUT_OF_SCOPE_AREA_LABELS } from "@/domain/labels";

import { classifyOutOfScope } from "./classify-out-of-scope";
import type { Policy, PolicyResult, TurnContext } from "./policy";

/**
 * §6.3, item 1: assunto que não é de TI é redirecionado à área certa, sem chamado.
 *
 * Só curto-circuita quando a área é conhecida. Pedido para mudar as regras e assunto sem área
 * ficam como "não se aplica" (o contrato não tem ação de recusa): o AGIR responde com uma recusa
 * educada, guiado pelo prompt de sistema e por esta nota, e as tools seguem limitadas ao
 * funcionário. Ver `classify-out-of-scope.ts`.
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
          outcome: "not_applicable",
          note: `Pedido para mudar as regras do atendimento (citou "${classification.matchedTerm}"), não um assunto de outra área: o agent recusa educadamente e só mostra os chamados do próprio funcionário.`,
        };
      case "unknown_area":
        return {
          outcome: "not_applicable",
          note: "Fora de TI, mas sem área identificada (RH, Financeiro ou Facilities): o agent explica que atende só TI, sem abrir chamado.",
        };
    }
  },
};
