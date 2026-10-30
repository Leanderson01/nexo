import { describe, expect, it } from "vitest";

import { explicitHandoffPolicy } from "../explicit-handoff-policy";
import { makeContext } from "./fixtures";

describe("explicitHandoffPolicy", () => {
  it('"Quero falar com uma pessoa" transfere com motivo requested', () => {
    const ctx = makeContext({
      understanding: { intent: "talk_to_analyst", summary: "Quer falar com uma pessoa" },
    });
    expect(explicitHandoffPolicy.evaluate(ctx)).toMatchObject({
      outcome: "triggered",
      action: { kind: "handoff", reason: "requested" },
    });
  });

  it("não se aplica a outras intenções", () => {
    const result = explicitHandoffPolicy.evaluate(makeContext());
    expect(result.outcome).toBe("not_applicable");
  });
});
