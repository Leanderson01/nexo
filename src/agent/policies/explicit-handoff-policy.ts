import type { Policy, PolicyResult, TurnContext } from "./policy";

/** §6.3, item 2: o funcionário pediu uma pessoa; transfere sem tentar convencer a ficar. */
export const explicitHandoffPolicy: Policy = {
  name: "ExplicitHandoffPolicy",
  evaluate(ctx: TurnContext): PolicyResult {
    if (ctx.understanding.intent !== "talk_to_analyst") {
      return { outcome: "not_applicable", note: "Não pediu para falar com um analista." };
    }
    return {
      outcome: "triggered",
      action: { kind: "handoff", reason: "requested" },
      explanation: "O funcionário pediu para falar com uma pessoa: transfere sem resistência.",
    };
  },
};
