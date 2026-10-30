import { describe, expect, it } from "vitest";

import {
  MARIANA_MONITOR,
  MARIANA_NOTEBOOK,
  MARIANA_SAP,
  MARIANA_TICKETS,
} from "@/agent/policies/__tests__/fixtures";
import type { TicketSummary } from "@/domain/ticket";

import { extractTicketCode, resolveFocusedTicket } from "../resolve-focused-ticket";

function resolve(
  ticketRef: string | null,
  selectedTicketCode: string | null = null,
  employeeTickets: TicketSummary[] = MARIANA_TICKETS,
) {
  return resolveFocusedTicket({ ticketRef, selectedTicketCode, employeeTickets });
}

describe("resolveFocusedTicket", () => {
  it('"o do notebook" casa pelo título: INC-20311', () => {
    expect(resolve("o do notebook")).toEqual({
      focusedTicket: MARIANA_NOTEBOOK,
      ambiguousCandidates: [],
    });
  });

  it("código explícito casa exato, com ou sem hífen", () => {
    expect(resolve("INC-20311").focusedTicket).toBe(MARIANA_NOTEBOOK);
    expect(resolve("inc 20311").focusedTicket).toBe(MARIANA_NOTEBOOK);
    expect(resolve("o req10442").focusedTicket).toBe(MARIANA_MONITOR);
  });

  it("Mariana pedindo o INC-20388 (do Pedro) fica sem foco, como se não existisse", () => {
    expect(resolve("INC-20388", "INC-20311")).toEqual({
      focusedTicket: null,
      ambiguousCandidates: [],
    });
  });

  it("descrição ignora acento e caixa", () => {
    expect(resolve("a SENHA do sap").focusedTicket).toBe(MARIANA_SAP);
    expect(resolve("aquele da atualizacao").focusedTicket).toBe(MARIANA_NOTEBOOK);
  });

  it("vários chamados com a mesma pontuação: ambiguidade e seletor", () => {
    const secondNotebook: TicketSummary = {
      ...MARIANA_NOTEBOOK,
      code: "INC-20500",
      title: "Notebook sem som",
    };
    const result = resolve("o do notebook", null, [...MARIANA_TICKETS, secondNotebook]);
    expect(result.focusedTicket).toBeNull();
    expect(result.ambiguousCandidates.map((ticket) => ticket.code)).toEqual([
      "INC-20311",
      "INC-20500",
    ]);
  });

  it("vence o chamado com mais palavras em comum", () => {
    const secondNotebook: TicketSummary = {
      ...MARIANA_NOTEBOOK,
      code: "INC-20500",
      title: "Notebook sem som",
    };
    const result = resolve("notebook lento", null, [...MARIANA_TICKETS, secondNotebook]);
    expect(result.focusedTicket).toBe(MARIANA_NOTEBOOK);
  });

  it("descrição que não casa com nada fica sem foco", () => {
    expect(resolve("o da impressora", "INC-20311").focusedTicket).toBeNull();
  });

  it("sem ticketRef, usa o chamado selecionado na conversa", () => {
    expect(resolve(null, "REQ-10442").focusedTicket).toBe(MARIANA_MONITOR);
  });

  it("referência sem palavras úteis também usa o selecionado", () => {
    expect(resolve("esse chamado", "INC-20150").focusedTicket).toBe(MARIANA_SAP);
  });

  it("selecionado que não é do funcionário é ignorado", () => {
    expect(resolve(null, "INC-20388").focusedTicket).toBeNull();
  });

  it("sem referência e sem seleção, nada em foco", () => {
    expect(resolve(null)).toEqual({ focusedTicket: null, ambiguousCandidates: [] });
  });
});

describe("extractTicketCode", () => {
  it.each([
    ["INC-20311", "INC-20311"],
    ["meu inc 20311", "INC-20311"],
    ["Req-10442?", "REQ-10442"],
    ["o do notebook", null],
    ["INC-203", null],
  ])("%s → %s", (text, code) => {
    expect(extractTicketCode(text)).toBe(code);
  });
});
