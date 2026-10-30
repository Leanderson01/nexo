import { describe, expect, it } from "vitest";

import { makeUnderstanding, MARIANA_NOTEBOOK } from "@/agent/policies/__tests__/fixtures";
import { buildTurnBriefing, type TurnBriefingInput } from "@/agent/prompts/turn-briefing";
import { PASSWORD_PLACEHOLDER } from "@/domain/sensitive-data";
import { plainHyphens } from "@/shared/normalize-text";

import { cleanModelText } from "../act";
import { buildHandoffSummary, sensitiveDataNotice, shortCircuitReply } from "../code-replies";
import { buildReturnContext, loadContext, RETURN_CONTEXT_AFTER_MS } from "../context-loader";
import { ACCEPT_HANDOFF_OFFER, decide, type DecideInput } from "../decide";
import { toChatHistory } from "../history";
import { buildDecisionRecord, type RecordInput } from "../record";
import { ticketReference } from "../focus";
import { decideOutcome, type OutcomeInput } from "../turn-outcome";
import { addModelUsage, emptyUsage } from "../turn-usage";
import { assistantMessage, InMemoryAgentStore, makeSnapshot, NOW, userMessage } from "./fakes";

describe("respostas em código", () => {
  it("redireciona o holerite ao RH e recusa a mudança de regras com opção de ver os próprios", () => {
    const hr = shortCircuitReply(
      { kind: "redirect_out_of_scope", area: "hr" },
      { ticketCode: null },
    );
    const refusal = shortCircuitReply(
      { kind: "refuse", topic: "rule_change" },
      { ticketCode: null },
    );

    expect(hr.text).toMatch(/\bRH\b/);
    expect(hr.parts).toEqual([]);
    expect(refusal.text).toMatch(/^Não posso/);
    expect(refusal.parts).toEqual([
      {
        type: "quickReplies",
        options: [{ label: "Ver meus chamados", value: "Ver meus chamados" }],
      },
    ]);
  });

  it("transferência por vencido cita o chamado", () => {
    const reply = shortCircuitReply(
      { kind: "handoff", reason: "overdue" },
      { ticketCode: "INC-20311" },
    );
    expect(reply.text).toContain("INC-20311");
  });

  it("avisa sobre a senha removida só quando a máscara agiu", () => {
    expect(sensitiveDataNotice(`minha senha é ${PASSWORD_PLACEHOLDER}`)).toMatch(
      /Removi sua senha/,
    );
    expect(sensitiveDataNotice("minha VPN caiu")).toBeNull();
  });

  it("o resumo da transferência leva motivo, pedido, chamado e últimas mensagens", () => {
    const summary = buildHandoffSummary({
      reason: "low_confidence",
      requestSummary: "Mensagem vaga.",
      rollingSummary: null,
      ticketCode: "INC-20311",
      recentEmployeeTexts: ["Está dando problema.", "Continua estranho."],
    });
    expect(summary).toBe(
      'Motivo: Agent pediu ajuda.\nPedido atual: Mensagem vaga.\nChamado em foco: INC-20311.\nÚltimas mensagens do funcionário: "Está dando problema." / "Continua estranho."',
    );
  });

  it("o resumo da transferência traz o problema real, o que já foi feito e os chamados", () => {
    const summary = buildHandoffSummary({
      reason: "overdue",
      requestSummary: null,
      rollingSummary: null,
      ticketCode: "INC-20311",
      recentEmployeeTexts: ["Sim, chamar um analista"],
      problem: "E o meu chamado do notebook?",
      consulted: ["consultou seus chamados"],
      ticketCodes: ["INC-20311", "REQ-10442"],
    });
    expect(summary).toBe(
      'Motivo: Chamado vencido.\nProblema relatado: "E o meu chamado do notebook?"\nChamado em foco: INC-20311.\nOutros chamados citados: REQ-10442.\nJá feito pelo Nexo Assist: consultou seus chamados.\nÚltimas mensagens do funcionário: "Sim, chamar um analista"',
    );
  });
});

describe("contexto do turno", () => {
  it("histórico anota os blocos (menos as opções) e junta mensagens seguidas do mesmo papel", () => {
    const history = toChatHistory([
      userMessage("Minha VPN dá erro 809"),
      assistantMessage([
        { type: "text", text: "Qual é o seu Windows?" },
        {
          type: "quickReplies",
          options: [
            { label: "Windows 10", value: "Windows 10" },
            { label: "Windows 11", value: "Windows 11" },
          ],
        },
      ]),
      {
        role: "system",
        parts: [{ type: "event", kind: "returned_to_agent" }],
        createdAt: NOW,
        authorName: null,
      },
      userMessage("Windows 11"),
    ]);

    expect(history).toEqual([
      { role: "user", content: "Minha VPN dá erro 809" },
      {
        role: "assistant",
        content:
          "Qual é o seu Windows?\n\n(mostrado pelo sistema: a conversa voltou para o Nexo Assist)",
      },
      { role: "user", content: "Windows 11" },
    ]);
  });

  it("refaz o resumo quando o Convex manda mensagens para resumir", async () => {
    const store = new InMemoryAgentStore(
      makeSnapshot({
        recentMessages: [userMessage("antes", NOW - 1000), userMessage("agora")],
        messagesToSummarize: [userMessage("antes", NOW - 1000)],
        messageCount: 11,
      }),
    );

    const context = await loadContext({
      store,
      userText: "agora",
      summarize: async () => ({ summary: "Resumo novo.", usage: { inputTokens: 10 } }),
    });

    expect(context?.rollingSummary).toBe("Resumo novo.");
    expect(context?.summaryPatch).toEqual({
      rollingSummary: "Resumo novo.",
      summarizedMessageCount: 11,
    });
    expect(context?.previousMessageAt).toBe(NOW - 1000);
    expect(context?.history.at(-1)).toEqual({ role: "user", content: "antes\n\nagora" });
  });

  it("retoma o assunto depois de 12 horas, dizendo se o chamado mudou", () => {
    const longAgo = NOW - RETURN_CONTEXT_AFTER_MS - 1;
    expect(
      buildReturnContext({ previousMessageAt: NOW - 1000, now: NOW, selectedTicket: null }),
    ).toBeNull();
    expect(
      buildReturnContext({
        previousMessageAt: longAgo,
        now: NOW,
        selectedTicket: { ...MARIANA_NOTEBOOK, lastActivityAt: NOW - 1000 },
      }),
    ).toContain("Da última vez falamos do INC-20311; ele teve uma atualização desde então");
  });
});

describe("contexto do turno do AGIR (decisão 25)", () => {
  const SIGNALS = {
    kind: "INC",
    category: "network_vpn",
    impact: "individual",
    blocked: true,
    deadlineToday: false,
  } as const;
  const VPN_ARTICLE = {
    slug: "vpn-erro-809",
    title: "VPN com erro 809",
    applicability: "applies",
    whatToDo: "Oriente os passos.",
    body: "Reinstale o cliente.",
  } as const;

  function briefing(overrides: Partial<TurnBriefingInput>): string {
    return buildTurnBriefing({
      now: NOW,
      employee: { name: "Juliana", department: "Marketing" },
      understanding: makeUnderstanding({ intent: "question", ticketSignals: SIGNALS }),
      rollingSummary: null,
      returnNote: null,
      returnContext: null,
      pendingDraft: null,
      focusedTicket: null,
      ambiguousCandidates: [],
      employeeTickets: null,
      guidingActions: [],
      overdueExplanation: null,
      articles: null,
      sensitiveNoticeWritten: false,
      ...overrides,
    });
  }

  it("com sinais completos e artigo que vale, manda orientar o artigo antes do chamado", () => {
    expect(briefing({ articles: [VPN_ARTICLE] })).toContain("oriente o artigo primeiro");
    expect(briefing({ articles: [] })).not.toContain("oriente o artigo primeiro");
  });

  it("com um chamado parecido, o parecido vem no lugar do artigo", () => {
    const text = briefing({
      articles: [VPN_ARTICLE],
      similarTickets: [
        {
          code: "INC-20077",
          title: "Wi-Fi da sala 3 caindo",
          status: "Resolvido",
          priority: "Média",
          category: "Rede",
          deadline: "",
          overdue: false,
          lastActivity: "há 10 dias",
          suggestedAction: "new_with_reference",
          whatToDo: "Proponha um chamado novo com referenceCode.",
          resolved: "há 10 dias",
        },
      ],
    });
    expect(text).toContain("Chamados parecidos");
    expect(text).toContain("INC-20077");
    expect(text).not.toContain("oriente o artigo primeiro");
  });

  it("consulta de chamado em foco manda mostrar com getMyTicket", () => {
    const text = briefing({
      understanding: makeUnderstanding({ intent: "ticket_status" }),
      employeeTickets: [MARIANA_NOTEBOOK],
      focusedTicket: MARIANA_NOTEBOOK,
    });
    expect(text).toContain(`getMyTicket("${MARIANA_NOTEBOOK.code}")`);
  });
});

describe("decide", () => {
  const base: DecideInput = {
    now: NOW,
    understanding: makeUnderstanding(),
    userText: "oi",
    conversationStatus: "agent",
    clarificationAttempts: 0,
    focusedTicket: null,
    pendingOffer: null,
  };

  it("soma esclarecimentos e zera num turno de confiança alta", () => {
    const vague = decide({
      ...base,
      understanding: makeUnderstanding({ intent: "unclear", confidence: 0.3 }),
    });
    const clear = decide({ ...base, clarificationAttempts: 1 });

    expect(vague.guidingActions).toEqual([{ kind: "ask_clarification" }]);
    expect(vague.clarificationAttempts).toBe(1);
    expect(clear.clarificationAttempts).toBe(0);
  });

  it("depois de 2 esclarecimentos sem segurança, transfere por baixa confiança", () => {
    const decision = decide({
      ...base,
      clarificationAttempts: 2,
      understanding: makeUnderstanding({ intent: "unclear", confidence: 0.3 }),
    });
    expect(decision.decisiveAction).toEqual({ kind: "handoff", reason: "low_confidence" });
  });

  it("aceitar a oferta do vencido transfere com motivo overdue, não requested (decisão 22)", () => {
    const decision = decide({
      ...base,
      userText: ACCEPT_HANDOFF_OFFER,
      understanding: makeUnderstanding({ intent: "talk_to_analyst" }),
      pendingOffer: { reason: "overdue", ticketCode: "INC-20311" },
    });

    expect(decision.decisiveAction).toEqual({ kind: "handoff", reason: "overdue" });
    expect(decision.evaluations.find((item) => item.name === "OverdueTicketPolicy")).toMatchObject({
      outcome: "triggered",
      actionKind: "handoff",
    });
  });

  it("recusar a oferta segue o turno normalmente", () => {
    const decision = decide({
      ...base,
      userText: "Não, obrigado",
      understanding: makeUnderstanding({ intent: "greeting_or_smalltalk" }),
      pendingOffer: { reason: "overdue", ticketCode: "INC-20311" },
    });
    expect(decision.decisiveAction).toBeNull();
    expect(decision.acceptedOffer).toBeNull();
  });
});

describe("decideOutcome", () => {
  const base: OutcomeInput = {
    failed: false,
    handedOff: false,
    decisiveAction: null,
    draftProposed: false,
    clarificationRequested: false,
    intent: "question",
    showedContent: false,
    replyText: "Qual é o seu Windows?",
  };

  it("pergunta só de texto é esclarecimento; com card ou artigo é resposta", () => {
    expect(decideOutcome(base)).toBe("asked_clarification");
    expect(decideOutcome({ ...base, showedContent: true, replyText: "Isso resolveu?" })).toBe(
      "answered",
    );
    expect(decideOutcome({ ...base, draftProposed: true })).toBe("draft_proposed");
    expect(decideOutcome({ ...base, failed: true, draftProposed: true })).toBe("error");
    expect(
      decideOutcome({ ...base, decisiveAction: { kind: "refuse", topic: "rule_change" } }),
    ).toBe("redirected");
  });
});

describe("buildDecisionRecord", () => {
  it("monta o registro com confiança, custo e os campos da decisão 23", () => {
    const usage = addModelUsage(emptyUsage(), "openai/gpt-oss-20b", {
      inputTokens: 1000,
      outputTokens: 100,
      cachedInputTokens: 400,
    });
    const input: RecordInput = {
      now: NOW,
      latencyMs: 820,
      understanding: makeUnderstanding({
        intent: "talk_to_analyst",
        summary: "Quer um analista",
        confidence: 0.92,
      }),
      evaluations: [
        {
          name: "ExplicitHandoffPolicy",
          outcome: "triggered",
          actionKind: "handoff",
          explanation: "Pediu.",
        },
      ],
      decisiveAction: { kind: "handoff", reason: "requested" },
      guidingActions: [],
      traces: [],
      derivedPriority: null,
      outcome: "handoff",
      shortCircuit: true,
      draftKind: null,
      errorStage: null,
      usage,
    };

    const record = buildDecisionRecord(input);

    expect(record.confidence).toEqual({ value: 0.92, level: "high", reason: "Pedido claro." });
    expect(record.shortCircuit).toBe(true);
    expect(record.errorStage).toBeUndefined();
    expect(record.usage).toEqual({
      models: ["openai/gpt-oss-20b"],
      inputTokens: 1000,
      cachedInputTokens: 400,
      outputTokens: 100,
      estimatedCostUsd: (600 * 0.075 + 400 * 0.0375 + 100 * 0.3) / 1_000_000,
      latencyMs: 820,
    });
    expect(record.rationale).toBe(
      'Entendeu, com confiança alta: quer um analista. A regra "Pedido de analista" decidiu transferir (pedido do funcionário), sem chamar o modelo principal. Transferiu a conversa para um analista com o resumo do caso.',
    );
  });
});

describe("detalhes do texto do modelo", () => {
  it("consulta de chamado sem ticketRef usa o dispositivo citado", () => {
    const entities = {
      system: null,
      errorCode: null,
      os: null,
      device: "notebook",
      ticketRef: null,
    };
    const status = makeUnderstanding({ intent: "ticket_status", entities });
    const statusWithout = makeUnderstanding({
      intent: "ticket_status",
      entities: { ...entities, device: null },
    });
    expect(ticketReference(status, "e o notebook?", null)).toBe("notebook");
    expect(ticketReference(statusWithout, "e o notebook?", null)).toBe("e o notebook?");
    expect(ticketReference(statusWithout, "alguma novidade?", "INC-20311")).toBeNull();
    expect(
      ticketReference(makeUnderstanding({ intent: "question", entities }), "x", null),
    ).toBeNull();
  });

  it("hífen tipográfico vira hífen comum (códigos e buscas)", () => {
    expect(plainHyphens("INC\u201120077 e Wi\u2010Fi")).toBe("INC-20077 e Wi-Fi");
    expect(cleanModelText("O **INC\u201120311** est\u00e1 vencido.\u200b")).toBe(
      "O INC-20311 est\u00e1 vencido.",
    );
  });
});
