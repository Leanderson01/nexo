import { describe, expect, it } from "vitest";

import { overdueTicketPolicy } from "../overdue-ticket-policy";
import { JULIANA_FIGMA, MARIANA_NOTEBOOK, makeContext, RAFAEL_OUTLOOK } from "./fixtures";

describe("overdueTicketPolicy", () => {
  it("INC-20311 vencido oferece analista e explica o prazo", () => {
    const result = overdueTicketPolicy.evaluate(makeContext({ focusedTicket: MARIANA_NOTEBOOK }));
    expect(result).toEqual({
      outcome: "triggered",
      action: { kind: "offer_handoff", reason: "overdue" },
      explanation:
        "INC-20311 sem atualização há 6 dias; prazo da prioridade Média é de 3 dias úteis.",
    });
  });

  it("não se aplica sem chamado em foco", () => {
    expect(overdueTicketPolicy.evaluate(makeContext())).toEqual({
      outcome: "not_applicable",
      note: "Nenhum chamado em foco.",
    });
  });

  it("chamado no prazo não dispara", () => {
    const result = overdueTicketPolicy.evaluate(makeContext({ focusedTicket: RAFAEL_OUTLOOK }));
    expect(result).toEqual({ outcome: "not_applicable", note: "INC-20402: vence em 3h." });
  });

  it("prazo pausado (Aguardando você) não dispara, mesmo com atividade antiga", () => {
    const result = overdueTicketPolicy.evaluate(makeContext({ focusedTicket: JULIANA_FIGMA }));
    expect(result).toEqual({ outcome: "not_applicable", note: "REQ-10510: prazo pausado." });
  });
});
