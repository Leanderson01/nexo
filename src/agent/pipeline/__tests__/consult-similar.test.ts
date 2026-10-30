import { describe, expect, it } from "vitest";

import { makeUnderstanding } from "@/agent/policies/__tests__/fixtures";

import type { SimilarTicket } from "@/agent/tools/find-similar-tickets";

import {
  isRecurringProblem,
  openDuplicates,
  shouldConsultSimilar,
  shouldLookForOpenDuplicate,
} from "../consult-similar";

describe("duplicidade aberta de um problema novo (QA R1, Outlook do Rafael)", () => {
  const outlook = (summary: string, device: string | null = null) =>
    makeUnderstanding({
      intent: "open_ticket",
      summary,
      entities: { system: "Outlook", errorCode: null, os: null, device, ticketRef: null },
    });
  const similar = (
    code: string,
    title: string,
    suggestedAction: SimilarTicket["suggestedAction"],
  ) => ({ code, title, suggestedAction }) as SimilarTicket;
  const INC_20402 = similar("INC-20402", "Outlook não sincroniza no celular", "update");

  it("procura quando o problema cita um sistema; não num problema que voltou nem sem sistema", () => {
    expect(
      shouldLookForOpenDuplicate(outlook("Outlook não sincroniza"), "O Outlook não sincroniza"),
    ).toBe(true);
    expect(shouldLookForOpenDuplicate(outlook("Outlook"), "O Outlook caiu de novo")).toBe(false);
    expect(shouldLookForOpenDuplicate(makeUnderstanding({ intent: "open_ticket" }), "Travou")).toBe(
      false,
    );
  });

  it("sem sistema no ENTENDER, compara com as palavras da mensagem", () => {
    const printer = similar("INC-20395", "Impressora do 2º andar não imprime", "update");
    const other = similar("INC-20420", "Sistema de estoque fora do ar para a equipe", "update");
    expect(
      openDuplicates([printer, other], makeUnderstanding({ intent: "update_ticket" }), [
        "A impressora do 2º andar continua sem imprimir.",
      ]),
    ).toEqual([printer]);
  });

  it("fica o aberto do mesmo sistema, sem conflito de aparelho", () => {
    const tickets = [INC_20402, similar("INC-20077", "Wi-Fi da sala 3 caiu", "new_with_reference")];
    expect(
      openDuplicates(tickets, outlook("Outlook não sincroniza"), [
        "O Outlook não sincroniza os e-mails",
      ]),
    ).toEqual([INC_20402]);
    expect(
      openDuplicates(tickets, outlook("Outlook não abre"), [
        "O Outlook do meu computador não abre",
      ]),
    ).toEqual([]);
  });
});

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
