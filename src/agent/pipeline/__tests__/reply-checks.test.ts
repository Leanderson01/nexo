import { describe, expect, it } from "vitest";

import {
  checkTicketCodes,
  claimsPreparedDraft,
  DRAFT_CLAIM_FALLBACK_TEXT,
  draftRetryInstruction,
  extractTicketCodes,
  isNoTicketFound,
  draftRetryReason,
  promisesDraftCard,
  NOT_FOUND_TEXT,
  offerToOpenTicket,
  OPEN_TICKET_OPTION,
  removeToolCallsFromText,
  resolveDraftRetry,
  retrySucceeded,
  TOOL_CALL_FALLBACK_TEXT,
} from "../reply-checks";

describe("removeToolCallsFromText", () => {
  it("tira a chamada escrita no fim do texto (achado da T10b)", () => {
    const result = removeToolCallsFromText(
      'Isso resolveu?\n\nofferQuickReplies({"options":["Sim","Não"]})',
    );
    expect(result?.text).toBe("Isso resolveu?");
    expect(result?.correction.rule).toBe("tool_call_as_text");
    expect(result?.correction.explanation).toContain("offerQuickReplies");
  });

  it("tira chamada no meio, em crases, e com parênteses dentro das aspas", () => {
    const result = removeToolCallsFromText(
      'Vou ver. `listMyTickets({"onlyOpen":true})` Achei dois. proposeReopen({"note":"(de novo)"}) Confira.',
    );
    expect(result?.text).toBe("Vou ver. Achei dois. Confira.");
    expect(result?.correction.explanation).toContain("listMyTickets, proposeReopen");
  });

  it("tira o bloco de código que só tinha a chamada", () => {
    const result = removeToolCallsFromText(
      'Escolha uma opção.\n```json\nofferQuickReplies({"options":["A"]})\n```',
    );
    expect(result?.text).toBe("Escolha uma opção.");
  });

  it("sem fechamento, a chamada vai até o fim", () => {
    expect(removeToolCallsFromText('Pronto. offerQuickReplies({"options":["Sim"')?.text).toBe(
      "Pronto.",
    );
  });

  it("se só havia a chamada, vira um aviso honesto", () => {
    const result = removeToolCallsFromText('offerQuickReplies({"options":["Sim","Não"]})');
    expect(result?.text).toBe(TOOL_CALL_FALLBACK_TEXT);
  });

  it("não mexe em texto normal, nem no nome da tool sem parênteses", () => {
    expect(removeToolCallsFromText("Abra o portal (de softwares) e instale.")).toBeNull();
    expect(removeToolCallsFromText("Uso o offerQuickReplies às vezes.")).toBeNull();
  });
});

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

describe("claimsPreparedDraft", () => {
  it.each([
    "Você já tem o INC-20395 aberto. Preparei uma atualização para ele. Confira e confirme no card.",
    "Confira o rascunho que preparei e confirme.",
    "Confira a atualização e confirme.",
    "A reabertura está no card, é só confirmar.",
    "Vou preparar um rascunho de incidente.",
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
});

describe("promisesDraftCard", () => {
  it('"confira o card" sem nenhum card na resposta promete o rascunho', () => {
    expect(promisesDraftCard("Por favor, confira o card que será exibido.", false)).toBe(true);
  });

  it('"confira o card" com o card do chamado na resposta é sobre ele', () => {
    expect(promisesDraftCard("Confira o card do chamado abaixo.", true)).toBe(false);
  });
});

describe("draftRetryReason", () => {
  const base = {
    text: "Preparei uma atualização. Confira no card.",
    draftProposed: false,
    pendingDraftExists: false,
    otherCardShown: false,
    criticalCase: false,
  };

  it("promessa sem rascunho pede nova tentativa", () => {
    expect(draftRetryReason(base)).toBe("claim");
  });

  it("caso crítico sem rascunho pede nova tentativa, mesmo sem promessa", () => {
    expect(draftRetryReason({ ...base, text: "Desde quando?", criticalCase: true })).toBe(
      "critical",
    );
  });

  it("não pede com o rascunho proposto ou pendente, nem sem promessa", () => {
    expect(draftRetryReason({ ...base, draftProposed: true })).toBeNull();
    expect(draftRetryReason({ ...base, pendingDraftExists: true, criticalCase: true })).toBeNull();
    expect(draftRetryReason({ ...base, text: "Qual é o seu Windows?" })).toBeNull();
  });
});

describe("draftRetryInstruction", () => {
  it("cita o texto anterior e, com os parecidos já procurados, manda direto à proposta", () => {
    const instruction = draftRetryInstruction({
      reason: "claim",
      previousText: "Preparei o rascunho.",
      similarConsulted: true,
    });
    expect(instruction).toContain('"Preparei o rascunho."');
    expect(instruction).toContain("findSimilarTickets já foi chamada");
    expect(
      draftRetryInstruction({
        reason: "critical",
        previousText: "Desde quando?",
        similarConsulted: false,
      }),
    ).toMatch(/CASO CRÍTICO[^]*chame findSimilarTickets e depois/);
  });
});

describe("retrySucceeded / resolveDraftRetry", () => {
  const claim = { reason: "claim" as const, otherCardShown: false };

  it("usa o texto da nova tentativa quando ela propôs o rascunho", () => {
    const result = resolveDraftRetry({
      ...claim,
      retryText: "Preparei a atualização. Confira no card.",
      draftProposed: true,
    });
    expect(result.text).toBe("Preparei a atualização. Confira no card.");
    expect(result.correction).toMatchObject({ rule: "draft_claim_without_draft" });
    expect(result.correction.explanation).toContain("propôs o rascunho");
  });

  it("fora do crítico, aceita a nova tentativa que pergunta em vez de prometer", () => {
    expect(retrySucceeded({ ...claim, retryText: "Quem é afetado?", draftProposed: false })).toBe(
      true,
    );
    expect(
      resolveDraftRetry({ ...claim, retryText: "Quem é afetado?", draftProposed: false }).text,
    ).toBe("Quem é afetado?");
  });

  it("no crítico, só o rascunho resolve", () => {
    const critical = { reason: "critical" as const, otherCardShown: false };
    expect(retrySucceeded({ ...critical, retryText: "Desde quando?", draftProposed: false })).toBe(
      false,
    );
    const result = resolveDraftRetry({
      ...critical,
      retryText: "Desde quando?",
      draftProposed: false,
    });
    expect(result.text).toBe(DRAFT_CLAIM_FALLBACK_TEXT);
    expect(result.correction.rule).toBe("critical_without_draft");
  });

  it("promessa repetida sem rascunho, ou falha, vira o aviso honesto", () => {
    expect(
      resolveDraftRetry({ ...claim, retryText: "Preparei de novo, confira.", draftProposed: false })
        .text,
    ).toBe(DRAFT_CLAIM_FALLBACK_TEXT);
    expect(resolveDraftRetry({ ...claim, retryText: null, draftProposed: false }).text).toBe(
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
