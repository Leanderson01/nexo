import { describe, expect, it } from "vitest";

import { makeUnderstanding } from "@/agent/policies/__tests__/fixtures";

import { isRecurringProblem, shouldConsultSimilar } from "../consult-similar";

describe("isRecurringProblem", () => {
  it.each([
    "O Wi-Fi da sala 3 caiu de novo.",
    "A impressora do 2º andar continua sem imprimir.",
    "Minha senha do SAP bloqueou novamente",
    "A VPN voltou a cair",
    "Ainda não consigo imprimir",
  ])('"%s" é um problema que voltou', (text) => {
    expect(isRecurringProblem(text)).toBe(true);
  });

  it.each(["Minha VPN está dando erro 809.", "O sistema de vendas caiu para o time todo."])(
    '"%s" não é',
    (text) => {
      expect(isRecurringProblem(text)).toBe(false);
    },
  );
});

describe("shouldConsultSimilar", () => {
  it("procura num problema que voltou ou num complemento de chamado", () => {
    expect(shouldConsultSimilar(makeUnderstanding({ intent: "open_ticket" }), "Caiu de novo")).toBe(
      true,
    );
    expect(
      shouldConsultSimilar(makeUnderstanding({ intent: "update_ticket" }), "Mais um detalhe"),
    ).toBe(true);
  });

  it("não procura num problema novo nem fora de um relato de problema", () => {
    expect(shouldConsultSimilar(makeUnderstanding({ intent: "question" }), "Erro 809")).toBe(false);
    expect(shouldConsultSimilar(makeUnderstanding({ intent: "ticket_status" }), "E de novo?")).toBe(
      false,
    );
  });
});
