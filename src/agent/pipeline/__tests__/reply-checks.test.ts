import { describe, expect, it } from "vitest";

import {
  checkTicketCodes,
  claimsPreparedDraft,
  DRAFT_CLAIM_FALLBACK_TEXT,
  extractTicketCodes,
  isNoTicketFound,
  needsDraftRetry,
  NOT_FOUND_TEXT,
  offerToOpenTicket,
  OPEN_TICKET_OPTION,
  resolveDraftRetry,
} from "../reply-checks";

describe("extractTicketCodes", () => {
  it("acha os códigos, normaliza e tira repetidos", () => {
    expect(extractTicketCodes("O inc-20395 e o REQ-10510; de novo o INC-20395.")).toEqual([
      "INC-20395",
      "REQ-10510",
    ]);
  });

  it("ignora números que não são código", () => {
    expect(extractTicketCodes("Erro 809 desde as 9h, ramal 20395.")).toEqual([]);
  });
});

describe("checkTicketCodes", () => {
  const ownCodes = new Set(["INC-20395"]);

  it("não mexe quando todos os códigos são do funcionário", () => {
    expect(
      checkTicketCodes({ text: "Você já tem o INC-20395.", quickReplies: ["Sim"], ownCodes }),
    ).toBeNull();
  });

  it("tira as opções rápidas com código inventado e mantém as outras", () => {
    const result = checkTicketCodes({
      text: "Qual é o chamado?",
      quickReplies: ["REQ-10520", "INC-20455", "Não sei"],
      ownCodes,
    });
    expect(result?.text).toBe("Qual é o chamado?");
    expect(result?.quickReplies).toEqual(["Não sei"]);
    expect(result?.correction.rule).toBe("foreign_ticket_code");
  });

  it("sem nenhuma opção que sobre, tira as opções", () => {
    const result = checkTicketCodes({
      text: "Qual?",
      quickReplies: ["REQ-10520"],
      ownCodes: new Set(),
    });
    expect(result?.quickReplies).toBeNull();
  });

  it("texto com código alheio vira a resposta da privacidade, sem o código", () => {
    const result = checkTicketCodes({
      text: "O INC-20388 está em andamento com o Pedro.",
      quickReplies: null,
      ownCodes,
    });
    expect(result?.text).toBe(NOT_FOUND_TEXT);
    expect(result?.text).not.toContain("INC-20388");
    expect(result?.correction.explanation).toContain("no texto");
  });
});

describe("claimsPreparedDraft / needsDraftRetry", () => {
  it.each([
    "Você já tem o INC-20395 aberto. Preparei uma atualização para ele. Confira e confirme no card.",
    "Confira o rascunho que preparei e confirme.",
    "Confira a atualização e confirme.",
    "A reabertura está no card, é só confirmar.",
  ])('"%s" afirma que há rascunho', (text) => {
    expect(claimsPreparedDraft(text)).toBe(true);
  });

  it.each([
    "Quer que eu prepare um rascunho?",
    "Confira o card do chamado abaixo.",
    "Não encontrei esse chamado entre os seus.",
    "Qual é o seu Windows?",
  ])('"%s" não afirma', (text) => {
    expect(claimsPreparedDraft(text)).toBe(false);
  });

  it("só pede nova tentativa quando nenhum rascunho foi proposto nem está pendente", () => {
    const text = "Preparei uma atualização. Confira no card.";
    expect(needsDraftRetry({ text, draftProposed: false, pendingDraftExists: false })).toBe(true);
    expect(needsDraftRetry({ text, draftProposed: true, pendingDraftExists: false })).toBe(false);
    expect(needsDraftRetry({ text, draftProposed: false, pendingDraftExists: true })).toBe(false);
  });
});

describe("resolveDraftRetry", () => {
  it("usa o texto da nova tentativa quando ela propôs o rascunho", () => {
    const result = resolveDraftRetry({
      retryText: "Preparei a atualização. Confira no card.",
      draftProposed: true,
    });
    expect(result.text).toBe("Preparei a atualização. Confira no card.");
    expect(result.correction.explanation).toContain("propôs o rascunho");
  });

  it("aceita a nova tentativa que pergunta em vez de prometer", () => {
    const result = resolveDraftRetry({ retryText: "Quem é afetado?", draftProposed: false });
    expect(result.text).toBe("Quem é afetado?");
  });

  it("promessa repetida sem rascunho, ou falha, vira o aviso honesto", () => {
    expect(
      resolveDraftRetry({ retryText: "Preparei de novo, confira.", draftProposed: false }).text,
    ).toBe(DRAFT_CLAIM_FALLBACK_TEXT);
    expect(resolveDraftRetry({ retryText: null, draftProposed: false }).text).toBe(
      DRAFT_CLAIM_FALLBACK_TEXT,
    );
  });
});

describe("isNoTicketFound", () => {
  const base = {
    intent: "ticket_status" as const,
    ticketReference: "impressora do 2º andar",
    ticketsConsulted: true,
    focusedOrAmbiguous: false,
    showedOwnTicket: false,
    saysNotFound: false,
  };

  it("vale para consulta sem nenhum chamado que combine", () => {
    expect(isNoTicketFound(base)).toBe(true);
  });

  it("vale sem referência quando o texto já diz que não encontrou", () => {
    expect(isNoTicketFound({ ...base, ticketReference: null, saysNotFound: true })).toBe(true);
  });

  it.each([
    ["outra intenção", { intent: "question" as const }],
    ["sem referência a chamado", { ticketReference: null }],
    ["chamados não consultados", { ticketsConsulted: false }],
    ["chamado em foco ou ambíguo", { focusedOrAmbiguous: true }],
    ["a resposta mostrou um chamado dele", { showedOwnTicket: true }],
  ])("não vale com %s", (_label, change) => {
    expect(isNoTicketFound({ ...base, ...change })).toBe(false);
  });
});

describe("offerToOpenTicket", () => {
  it("texto que não diz que não encontrou vira a resposta de F2", () => {
    const result = offerToOpenTicket("Qual o código do chamado da impressora?");
    expect(result.text).toMatch(/^Não encontrei esse chamado entre os seus\. .*abrir/);
    expect(result.quickReplies).toEqual([OPEN_TICKET_OPTION, "Não precisa"]);
    expect(result.correction?.rule).toBe("no_ticket_found_offer");
  });

  it("acrescenta a oferta quando o texto só diz que não encontrou", () => {
    const result = offerToOpenTicket("Não encontrei esse chamado entre os seus.");
    expect(result.text).toBe(
      "Não encontrei esse chamado entre os seus. Se for um problema novo, posso abrir um chamado para você.",
    );
    expect(result.correction).not.toBeNull();
  });

  it("texto que já oferece fica como está, com as opções fixas", () => {
    const text = "Não encontrei um chamado seu sobre isso. Quer que eu abra um?";
    const result = offerToOpenTicket(text);
    expect(result).toEqual({
      text,
      quickReplies: [OPEN_TICKET_OPTION, "Não precisa"],
      correction: null,
    });
  });
});
