import { describe, expect, it } from "vitest";

import {
  checkTicketCodes,
  claimsPreparedDraft,
  DRAFT_CLAIM_FALLBACK_TEXT,
  draftRetryInstruction,
  EMPTY_REPLY_FALLBACK_TEXT,
  EMPTY_REPLY_RETRY_INSTRUCTION,
  extractQuickRepliesFromText,
  isEmptyReply,
  QUICK_REPLIES_ONLY_TEXT,
  quickRepliesRetryInstruction,
  resolveQuickRepliesRetry,
  resolveEmptyReply,
  TALK_TO_ANALYST_OPTION,
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
    expect(result?.correction.explanation).toContain("comando interno");
    expect(result?.correction.explanation).not.toContain("offerQuickReplies");
  });

  it("tira chamada no meio, em crases, e com parênteses dentro das aspas", () => {
    const result = removeToolCallsFromText(
      'Vou ver. `listMyTickets({"onlyOpen":true})` Achei dois. proposeReopen({"note":"(de novo)"}) Confira.',
    );
    expect(result?.text).toBe("Vou ver. Achei dois. Confira.");
    expect(result?.correction.explanation).not.toMatch(/listMyTickets|proposeReopen/);
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

  it("as opções de um offerQuickReplies escrito voltam para virar a parte de opções", () => {
    const result = removeToolCallsFromText(
      'Qual o impacto?\nofferQuickReplies({"options":["Só eu","Minha equipe"]})',
    );
    expect(result?.text).toBe("Qual o impacto?");
    expect(result?.quickReplies).toEqual(["Só eu", "Minha equipe"]);
    expect(result?.correction.explanation).toContain("viraram botões");
  });

  it("não devolve opções quando a tool já anexou as dela ou quando só havia a chamada", () => {
    const call = 'Isso resolveu? offerQuickReplies({"options":["Sim","Não"]})';
    expect(removeToolCallsFromText(call, true)?.quickReplies).toBeNull();
    expect(
      removeToolCallsFromText('offerQuickReplies({"options":["Sim"]})')?.quickReplies,
    ).toBeNull();
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

  it("pergunta sobre o chamado aberto parecido em vez de propor pede nova tentativa", () => {
    const asks = { ...base, text: "É o mesmo problema que já está no INC-20395?" };
    expect(draftRetryReason({ ...asks, openDuplicateCodes: ["INC-20395"] })).toBe("duplicate");
    expect(draftRetryReason({ ...asks, openDuplicateCodes: [] })).toBeNull();
    expect(draftRetryReason({ ...asks, openDuplicateCodes: ["INC-20402"] })).toBeNull();
    const detail = { ...base, text: "A mensagem de erro apareceu na tela?" };
    expect(
      draftRetryReason({ ...detail, openDuplicateCodes: ["INC-20395"], recurringProblem: true }),
    ).toBe("duplicate");
    expect(draftRetryReason({ ...detail, openDuplicateCodes: ["INC-20395"] })).toBeNull();
    const resolved = resolveDraftRetry({
      reason: "duplicate",
      retryText: "Pode ser?",
      draftProposed: false,
      otherCardShown: false,
      firstText: asks.text,
    });
    expect(resolved.text).toBe(asks.text);
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

describe("isEmptyReply", () => {
  it("vale só para resposta sem texto e sem partes", () => {
    expect(isEmptyReply({ text: "", hasParts: false })).toBe(true);
    expect(isEmptyReply({ text: " \n\n ", hasParts: false })).toBe(true);
    expect(isEmptyReply({ text: "", hasParts: true })).toBe(false);
    expect(isEmptyReply({ text: "Qual o impacto?", hasParts: false })).toBe(false);
  });
});

describe("resolveEmptyReply", () => {
  it("a nova tentativa que respondeu fica, com a correção registrada", () => {
    const resolved = resolveEmptyReply({
      retryOk: true,
      retryText: "Qual o impacto desse problema?",
      retryHasParts: true,
    });
    expect(resolved.fallback).toBeNull();
    expect(resolved.correction.rule).toBe("empty_reply");
    expect(resolved.correction.explanation).toContain("o agent tentou de novo e respondeu");
  });

  it("nova tentativa só com partes (um card, um seletor) também resolve", () => {
    const resolved = resolveEmptyReply({ retryOk: true, retryText: "", retryHasParts: true });
    expect(resolved.fallback).toBeNull();
  });

  it("nova tentativa vazia vira a resposta honesta, com as opções fixas", () => {
    const resolved = resolveEmptyReply({ retryOk: true, retryText: "  ", retryHasParts: false });
    expect(resolved.fallback).toEqual({
      text: EMPTY_REPLY_FALLBACK_TEXT,
      quickReplies: [OPEN_TICKET_OPTION, TALK_TO_ANALYST_OPTION],
    });
    expect(resolved.correction.rule).toBe("empty_reply");
    expect(resolved.correction.explanation).toContain("aviso honesto");
  });

  it("nova tentativa que falhou no meio também vira a resposta honesta", () => {
    const resolved = resolveEmptyReply({
      retryOk: false,
      retryText: "Qual o imp",
      retryHasParts: false,
    });
    expect(resolved.fallback?.text).toBe(EMPTY_REPLY_FALLBACK_TEXT);
  });

  it("a resposta honesta pede para reformular e oferece chamado ou analista", () => {
    expect(EMPTY_REPLY_FALLBACK_TEXT).toMatch(/reformular/);
    expect(EMPTY_REPLY_FALLBACK_TEXT).toMatch(/abrir um chamado/);
    expect(EMPTY_REPLY_FALLBACK_TEXT).toMatch(/analista/);
  });

  it("a instrução da nova tentativa pede texto e as opções pela tool", () => {
    expect(EMPTY_REPLY_RETRY_INSTRUCTION).toContain("## Correção (decidida em código)");
    expect(EMPTY_REPLY_RETRY_INSTRUCTION).toContain("offerQuickReplies");
  });
});

describe("extractQuickRepliesFromText", () => {
  const extract = (text: string, toolQuickReplies: string[] | null = null) =>
    extractQuickRepliesFromText({ text, toolQuickReplies });

  it("marcação [options] com ponto e vírgula (visto com o modelo real)", () => {
    const result = extract(
      "Qual o impacto desse problema?\n\n[options] Só eu; Minha equipe; A empresa toda",
    );
    expect(result?.text).toBe("Qual o impacto desse problema?");
    expect(result?.quickReplies).toEqual(["Só eu", "Minha equipe", "A empresa toda"]);
    expect(result?.correction.rule).toBe("quick_replies_as_text");
    expect(result?.correction.explanation).toContain("virou 3 opção(ões)");
  });

  it("variações da marcação: [opções: ...], [Opções rápidas] com barra vertical", () => {
    expect(extract("Funcionou? [opções: Sim, Não]")).toMatchObject({
      text: "Funcionou?",
      quickReplies: ["Sim", "Não"],
    });
    expect(extract("Funcionou?\n[Opções rápidas]: Sim | Não")).toMatchObject({
      text: "Funcionou?",
      quickReplies: ["Sim", "Não"],
    });
  });

  it("JSON solto, inclusive num bloco de código", () => {
    expect(
      extract('Qual o impacto?\n{"options": ["Só eu", "Minha equipe", "A empresa toda"]}'),
    ).toMatchObject({
      text: "Qual o impacto?",
      quickReplies: ["Só eu", "Minha equipe", "A empresa toda"],
    });
    expect(
      extract('Qual o impacto?\n```json\n{"options":["Só eu","Minha equipe"]}\n```'),
    ).toMatchObject({ text: "Qual o impacto?", quickReplies: ["Só eu", "Minha equipe"] });
  });

  it("narração sem rótulos só sai e avisa que faltam as opções", () => {
    expect(extract("Qual o impacto? (oferecendo opções rápidas)")).toMatchObject({
      text: "Qual o impacto?",
      quickReplies: null,
      missingOptions: true,
    });
    expect(extract("Qual é o impacto do problema? (Selecione uma opção)")).toMatchObject({
      text: "Qual é o impacto do problema?",
      missingOptions: true,
    });
    // Visto com o modelo real: só a marcação, sem os rótulos.
    expect(extract("Consegue trabalhar de outro jeito?\n\n[options]")).toMatchObject({
      text: "Consegue trabalhar de outro jeito?",
      missingOptions: true,
    });
  });

  it("opções entre parênteses depois da pergunta viram opções", () => {
    expect(extract("Isso está impedindo você de trabalhar? (Sim/Não)")).toMatchObject({
      text: "Isso está impedindo você de trabalhar?",
      quickReplies: ["Sim", "Não"],
    });
    // Espaço fino e hífen tipográfico, como o gpt-oss escreve.
    expect(
      extract("Qual é o seu Windows? (Windows\u202f10, Windows\u00a011 ou Não sei)", [
        "Windows 10",
        "Windows 11",
        "Não sei",
      ]),
    ).toMatchObject({ text: "Qual é o seu Windows?", quickReplies: null, missingOptions: false });
    expect(extract("Qual o problema? (Wi\u2011Fi ou VPN)")?.quickReplies).toEqual(["Wi-Fi", "VPN"]);
  });

  it("opções da tool repetidas entre parênteses saem do texto", () => {
    const result = extract("Qual é o seu Windows? (Windows 10, Windows 11 ou Não sei)", [
      "Windows 10",
      "Windows 11",
      "Não sei",
    ]);
    expect(result).toMatchObject({
      text: "Qual é o seu Windows?",
      quickReplies: null,
      missingOptions: false,
    });
    expect(
      extract("Abra o app (Teams ou Outlook) e entre.", ["Windows 10", "Windows 11"]),
    ).toBeNull();
  });

  it("com dois-pontos, os rótulos da narração viram opções", () => {
    expect(extract("Qual o impacto?\n[mostrando as opções]")?.text).toBe("Qual o impacto?");
    expect(extract("Funcionou? (opções rápidas: Sim, Não)")).toMatchObject({
      text: "Funcionou?",
      quickReplies: ["Sim", "Não"],
    });
  });

  it('"Opções:" com lista abaixo ou na mesma linha', () => {
    expect(extract("Isso resolveu?\nOpções:\n- Sim\n- Não")).toMatchObject({
      text: "Isso resolveu?",
      quickReplies: ["Sim", "Não"],
    });
    expect(extract("Isso resolveu?\n\nOpções: - Sim - Não")).toMatchObject({
      text: "Isso resolveu?",
      quickReplies: ["Sim", "Não"],
    });
    expect(
      extract("Qual o impacto?\n**Opções:**\n1. Só eu\n2. Minha equipe\n3. A empresa toda"),
    ).toMatchObject({
      text: "Qual o impacto?",
      quickReplies: ["Só eu", "Minha equipe", "A empresa toda"],
    });
  });

  it("pergunta seguida de lista curta com marcadores", () => {
    expect(extract("Qual o impacto?\n- Só eu\n- Minha equipe\n- A empresa toda")).toMatchObject({
      text: "Qual o impacto?",
      quickReplies: ["Só eu", "Minha equipe", "A empresa toda"],
    });
  });

  it("com as opções da tool já anexadas, o trecho só sai", () => {
    const result = extract("Qual o impacto?\n[options] Só eu; Minha equipe", ["Só eu"]);
    expect(result).toMatchObject({
      text: "Qual o impacto?",
      quickReplies: null,
      missingOptions: false,
    });
    expect(result?.correction.explanation).toContain("as opções da tool ficaram");
  });

  it("se só havia as opções, o texto não fica vazio acima delas", () => {
    expect(extract("[options] Sim; Não")).toMatchObject({
      text: QUICK_REPLIES_ONLY_TEXT,
      quickReplies: ["Sim", "Não"],
    });
    expect(extract("(oferecendo opções rápidas)", ["Sim"])?.text).toBe(QUICK_REPLIES_ONLY_TEXT);
    expect(extract("(oferecendo opções rápidas)")?.text).toBe(TOOL_CALL_FALLBACK_TEXT);
  });

  it("no máximo quatro opções, sem repetição", () => {
    expect(extract("Qual? [options] A; B; A; C; D; E")?.quickReplies).toEqual(["A", "B", "C", "D"]);
  });

  describe("falsos positivos: listas que não são opções ficam", () => {
    it("passos numerados de um artigo", () => {
      const steps =
        "Siga estes passos:\n1. Abra o Cisco AnyConnect.\n2. Clique em Desconectar.\n3. Reinicie o computador e conecte de novo.\n\nIsso resolveu?";
      expect(extract(steps)).toBeNull();
    });

    it("passos numerados no fim do texto, mesmo curtos", () => {
      expect(extract("Para reconectar:\n1. Abra a VPN\n2. Clique em Conectar")).toBeNull();
    });

    it("lista com marcadores que não vem depois de uma pergunta", () => {
      expect(extract("O que sei do seu chamado:\n- Status: aberto\n- Prioridade: Alta")).toBeNull();
    });

    it("lista depois de pergunta, mas com itens longos ou frases", () => {
      expect(
        extract(
          "Você já tentou isto?\n- Reiniciar o computador e esperar alguns minutos antes de entrar\n- Limpar o cache do navegador.",
        ),
      ).toBeNull();
    });

    it("lista com mais de quatro itens", () => {
      expect(extract("Qual sistema?\n- SAP\n- Teams\n- Outlook\n- VPN\n- Figma")).toBeNull();
    });

    it('"opções" no meio de uma frase e parênteses comuns', () => {
      expect(extract("Você tem duas opções: reiniciar ou abrir um chamado.")).toBeNull();
      expect(extract("Abra o portal (de softwares) e escolha as opções de instalação.")).toBeNull();
      expect(extract("No Painel (selecione a opção Reparar) e reinicie.")).toBeNull();
      expect(extract("Você usa VPN? (por exemplo, a Cisco)")).toBeNull();
      expect(
        extract(
          "Já tentou reiniciar? (desligue, espere um minuto e ligue de novo ou use o atalho)",
        ),
      ).toBeNull();
    });
  });
});

describe("quickRepliesRetryInstruction / resolveQuickRepliesRetry", () => {
  const first = extractQuickRepliesFromText({
    text: "Qual o impacto? (oferecendo opções)",
    toolQuickReplies: null,
  })!;

  it("a instrução cita a resposta anterior e pede a tool", () => {
    const instruction = quickRepliesRetryInstruction("Qual o impacto? (oferecendo opções)");
    expect(instruction).toContain("## Correção (decidida em código)");
    expect(instruction).toContain('"Qual o impacto? (oferecendo opções)"');
    expect(instruction).toContain("CHAME offerQuickReplies");
  });

  it("a nova tentativa que chamou a tool fica, sem as opções repetidas no texto", () => {
    const resolved = resolveQuickRepliesRetry({
      first,
      retryText: "Qual o impacto do problema? (Só eu, Minha equipe ou A empresa toda)",
      retryQuickReplies: ["Só eu", "Minha equipe", "A empresa toda"],
    });
    expect(resolved.text).toBe("Qual o impacto do problema?");
    expect(resolved.correction.rule).toBe("quick_replies_as_text");
    expect(resolved.correction.explanation).toContain("tentou de novo e mostrou as opções");
  });

  it("nova tentativa que só chamou a tool mantém o texto da primeira sem o anúncio", () => {
    for (const retryText of ["", "[options]"]) {
      const resolved = resolveQuickRepliesRetry({
        first,
        retryText,
        retryQuickReplies: ["Só eu", "Minha equipe"],
      });
      expect(resolved.text).toBe("Qual o impacto?");
      expect(resolved.correction.explanation).toContain("tentou de novo e mostrou as opções");
    }
  });

  it("sem a tool na nova tentativa, fica o texto da primeira sem o anúncio", () => {
    const resolved = resolveQuickRepliesRetry({
      first,
      retryText: "Qual o impacto?",
      retryQuickReplies: null,
    });
    expect(resolved.text).toBe("Qual o impacto?");
    expect(resolved.correction.explanation).toContain("nem a nova tentativa mostrou");
  });
});
