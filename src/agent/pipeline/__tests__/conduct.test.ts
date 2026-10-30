import { describe, expect, it } from "vitest";

import { makeUnderstanding } from "@/agent/policies/__tests__/fixtures";
import { BLOCKED_QUESTION, IMPACT_QUESTION, updateQuestionText } from "@/domain/intake-questions";

import { readConversationFacts } from "../conversation-facts";
import {
  ARTICLE_BRIDGE_FALLBACK,
  articleBridge,
  articleOrientation,
  classifyQuestion,
  closedQuestionOptions,
  inapplicableArticleSentence,
  intakeText,
  keepOneQuestion,
  looksLikeArticleAnswer,
  stripMarkdown,
  withCodeQuestion,
  withFinalQuestion,
  withoutNotFound,
  withoutQuestions,
} from "../reply-conduct";
import { applyReturnNoteRules, asksForAPerson, replyUsesNote } from "../return-note";
import { continueIntake, verifyUnderstanding } from "../verify-understanding";
import { assistantMessage, userMessage } from "./fakes";

const text = (value: string) => ({ type: "text" as const, text: value });
const options = (...labels: string[]) => ({
  type: "quickReplies" as const,
  options: labels.map((label) => ({ label, value: label })),
});

describe("readConversationFacts", () => {
  it("lê as respostas às perguntas de abertura e o artigo que não resolveu", () => {
    const facts = readConversationFacts(
      [
        userMessage("Minha VPN dá erro 809."),
        assistantMessage([
          text("1. Reinstale o cliente. Isso resolveu?"),
          { type: "article", slug: "vpn-erro-809", title: "VPN com erro 809", excerpt: "" },
          options("Sim", "Não"),
        ]),
        userMessage("Não"),
        assistantMessage([text(intakeText(IMPACT_QUESTION, false)), options("Só eu")]),
        userMessage("Só eu"),
        assistantMessage([text(intakeText(BLOCKED_QUESTION, true))]),
        userMessage("Não, sem alternativa"),
      ],
      "Não, sem alternativa",
    );
    expect(facts.answeredSignals).toEqual({ impact: "individual", blocked: true });
    expect(facts.articlesTried).toEqual(["VPN com erro 809"]);
    expect(facts.previousAskedIntake).toBe(true);
    expect(facts.answeredIntakeNow).toBe(true);
    expect(facts.employeeTexts).toEqual([
      "Minha VPN dá erro 809.",
      "Não",
      "Só eu",
      "Não, sem alternativa",
    ]);
  });
});

describe("verifyUnderstanding e continueIntake", () => {
  const facts = readConversationFacts([userMessage("O Wi-Fi da sala 3 caiu de novo")], "");

  it("descarta impacto, bloqueio e sistema operacional que ninguém disse", () => {
    const understanding = makeUnderstanding({
      entities: { ...makeUnderstanding().entities, os: "Windows 10" },
      ticketSignals: {
        kind: "INC",
        category: "network_vpn",
        impact: "team",
        blocked: true,
        deadlineToday: null,
      },
    });
    const verified = verifyUnderstanding(
      understanding,
      { impact: "sala 3", blocked: "caiu", deadlineToday: null },
      facts,
    );
    expect(verified.understanding.ticketSignals).toMatchObject({ impact: null, blocked: null });
    expect(verified.understanding.entities.os).toBeNull();
    expect(verified.corrections.map((item) => item.rule)).toEqual([
      "unsupported_signal",
      "unsupported_signal",
    ]);
  });

  it("a resposta a uma pergunta da abertura continua a abertura", () => {
    const answering = readConversationFacts(
      [assistantMessage([text(intakeText(IMPACT_QUESTION, false))]), userMessage("Só eu")],
      "Só eu",
    );
    const understanding = makeUnderstanding({ intent: "confirm_or_edit_draft", confidence: 0.6 });
    expect(continueIntake(understanding, answering)).toMatchObject({
      intent: "open_ticket",
      confidence: 0.9,
    });
    expect(continueIntake(understanding, facts)).toBe(understanding);
  });

  it("a resposta à pergunta feita para atualizar um chamado continua a atualização dele", () => {
    const answering = readConversationFacts(
      [
        userMessage("A impressora do 2º andar continua sem imprimir"),
        assistantMessage([text(updateQuestionText("INC-20395", BLOCKED_QUESTION))]),
        userMessage("Não, sem alternativa"),
      ],
      "Não, sem alternativa",
    );
    expect(answering.updatingTicketCode).toBe("INC-20395");
    expect(answering.answeredSignals).toEqual({ blocked: true });
    const continued = continueIntake(makeUnderstanding({ intent: "open_ticket" }), answering);
    expect(continued.intent).toBe("update_ticket");
    expect(continued.entities.ticketRef).toBe("INC-20395");
  });

  it('"Sim, está bloqueando" a uma pergunta de bloqueio do modelo conta como evidência', () => {
    const answering = readConversationFacts(
      [
        userMessage("A impressora do 2º andar continua sem imprimir"),
        assistantMessage([
          text("A impressora do 2º andar está bloqueando seu trabalho ou só incomoda?"),
          options("Sim, está bloqueando", "Não, só incomoda"),
        ]),
        userMessage("Sim, está bloqueando"),
      ],
      "Sim, está bloqueando",
    );
    expect(answering.answeredSignals).toEqual({ blocked: true });
    const verified = verifyUnderstanding(
      makeUnderstanding({
        intent: "update_ticket",
        ticketSignals: {
          kind: "INC",
          category: "hardware",
          impact: null,
          blocked: true,
          deadlineToday: null,
        },
      }),
      { impact: null, blocked: null, deadlineToday: null },
      answering,
    );
    expect(verified.understanding.ticketSignals.blocked).toBe(true);
    expect(verified.unconfirmed).toEqual({});
  });

  it("o que o ENTENDER trouxe e o código não confirmou fica registrado para perguntar", () => {
    const verified = verifyUnderstanding(
      makeUnderstanding({
        ticketSignals: {
          kind: "INC",
          category: "network_vpn",
          impact: "team",
          blocked: true,
          deadlineToday: null,
        },
      }),
      { impact: null, blocked: null, deadlineToday: null },
      facts,
    );
    expect(verified.unconfirmed).toEqual({ impact: "team", blocked: true });
  });
});

describe("reply-conduct", () => {
  it("classifica as perguntas conhecidas", () => {
    expect(classifyQuestion("Qual o sistema operacional que você usa?")).toBe("os");
    expect(classifyQuestion("Há algum compromisso hoje que depende disso?")).toBe("deadlineToday");
    expect(classifyQuestion("Você consegue trabalhar de outro jeito?")).toBe("blocked");
    expect(classifyQuestion("Qual o impacto desse problema?")).toBe("impact");
    expect(classifyQuestion("Isso respondeu sua dúvida?")).toBe("article_worked");
    expect(classifyQuestion("Qual é o modelo do mouse?")).toBeNull();
  });

  it("troca as perguntas do modelo pela pergunta em código", () => {
    expect(
      withCodeQuestion(
        "Entendi. Qual o sistema operacional? É um caso crítico.",
        "Qual é o seu Windows?",
      ),
    ).toBe("Entendi. Qual é o seu Windows?");
    expect(intakeText(IMPACT_QUESTION, true)).toBe("Anotado. Quem está sendo afetado por isso?");
  });

  it("uma pergunta por turno e nenhuma repetida no seletor", () => {
    expect(keepOneQuestion("Consegue trabalhar de outro jeito?Há algum compromisso hoje?")).toEqual(
      {
        text: "Há algum compromisso hoje?",
        removed: ["Consegue trabalhar de outro jeito?"],
      },
    );
    expect(keepOneQuestion("Entendi. Qual é o modelo?")).toBeNull();
    expect(withoutQuestions("Encontrei dois chamados. Qual deles?")).toBe(
      "Encontrei dois chamados.",
    );
  });

  it("orientação do artigo montada do corpo: os passos inventados ficam de fora (QA R1)", () => {
    const invented =
      "Para solicitar um novo monitor, siga estes passos:\n1. Acesse o portal de requisições da Nexo.\n2. Selecione a categoria Hardware e escolha Monitor.\nIsso resolveu?";
    const body =
      "Monitores, teclados e headsets são pedidos por requisição. O prazo de entrega é de 5 dias úteis após a aprovação.";
    const result = articleOrientation(invented, { body });
    expect(result).toBe(`${ARTICLE_BRIDGE_FALLBACK}\n\n${body}\n\nIsso resolveu?`);
    expect(result).not.toMatch(/Selecione|Hardware|portal de requisições/);
  });

  it("a ponte curta do modelo fica quando não orienta nada", () => {
    expect(articleBridge("Entendi, isso costuma acontecer. 1. Abra o portal.")).toBe(
      "Entendi, isso costuma acontecer.",
    );
    expect(articleBridge("Reinstale o cliente de VPN. Isso resolveu?")).toBe(
      ARTICLE_BRIDGE_FALLBACK,
    );
    expect(articleBridge("Siga os passos abaixo:")).toBe(ARTICLE_BRIDGE_FALLBACK);
    expect(articleBridge("O bloqueio acontece após 3 tentativas.")).toBe(ARTICLE_BRIDGE_FALLBACK);
    const context = {
      body: "O bloqueio acontece após 3 tentativas erradas. O desbloqueio é automático em 30 minutos.",
      employeeTexts: ["Não consigo entrar no SAP, aparece usuário bloqueado"],
    };
    // Repete o artigo, que vem logo abaixo.
    expect(articleBridge("O bloqueio ocorre depois de três tentativas erradas.", context)).toBe(
      ARTICLE_BRIDGE_FALLBACK,
    );
    // Traz um fato que ninguém disse.
    expect(
      articleBridge(
        "Para solicitar um novo teclado, basta abrir a requisição no portal de equipamentos.",
        {
          body: "Monitores, teclados e headsets são pedidos por requisição.",
          employeeTexts: ["Meu teclado está com várias teclas falhando."],
        },
      ),
    ).toBe(ARTICLE_BRIDGE_FALLBACK);
    expect(articleBridge("Entendi, vamos resolver o acesso ao SAP.", context)).toBe(
      "Entendi, vamos resolver o acesso ao SAP.",
    );
  });

  it('com o seletor, "não encontrei" sai do texto (QA R1, F2)', () => {
    expect(
      withoutNotFound(
        "Não encontrei esse chamado entre os seus. Qual desses chamados você quer saber o status?",
      ),
    ).toBe("Qual desses chamados você quer saber o status?");
    expect(withoutNotFound("Não encontrei esse chamado entre os seus.")).toBe("");
    expect(withoutNotFound("Você tem três chamados.")).toBe("Você tem três chamados.");
  });

  it("resposta baseada no artigo termina em Isso resolveu? e mantém os passos", () => {
    const answer =
      "Siga os passos:\n1. Reinstale o cliente.\n2. Reinicie.\nIsso respondeu sua dúvida?";
    expect(looksLikeArticleAnswer(answer)).toBe(true);
    expect(withFinalQuestion(answer, "Isso resolveu?")).toBe(
      "Siga os passos:\n1. Reinstale o cliente.\n2. Reinicie.\nIsso resolveu?",
    );
    expect(looksLikeArticleAnswer("Quem está sendo afetado por isso?")).toBe(false);
  });

  it("pergunta fechada ganha Sim/Não; pergunta aberta ou com alternativas, não", () => {
    expect(closedQuestionOptions("Você já reiniciou o computador?")).toEqual(["Sim", "Não"]);
    expect(closedQuestionOptions("Quer que eu abra um chamado?")).toEqual(["Sim", "Não"]);
    expect(closedQuestionOptions("É no notebook ou no desktop?")).toBeNull();
    expect(closedQuestionOptions("Qual é a mensagem de erro?")).toBeNull();
  });

  it("tira markdown cru", () => {
    expect(stripMarkdown("> **Atenção**: reinicie.\n## Passos")).toBe("Atenção: reinicie.\nPassos");
  });

  it("explica por que o artigo não vale, se o texto não explicou", () => {
    const article = {
      title: "VPN com erro 809",
      appliesTo: ["Windows 10"],
      knownValue: "Windows 11",
    };
    expect(inapplicableArticleSentence("Vou abrir um chamado.", article)).toBe(
      'O artigo "VPN com erro 809" vale só para Windows 10, então não se aplica ao seu Windows 11.',
    );
    expect(
      inapplicableArticleSentence("Esse artigo só vale para o Windows 10.", article),
    ).toBeNull();
  });
});

describe("nota do analista", () => {
  const NOTE = "Está aguardando ela aceitar o convite do Figma (REQ-10510).";

  it('"E aí, conseguiu?" é sobre a nota, não pedido de analista', () => {
    const asked = makeUnderstanding({ intent: "talk_to_analyst", confidence: 0.9 });
    const result = applyReturnNoteRules(asked, "E aí, conseguiu?", NOTE);
    expect(result.understanding.intent).toBe("question");
    expect(result.adjusted).toBe(true);
    expect(applyReturnNoteRules(asked, "Quero falar com o analista de novo", NOTE).adjusted).toBe(
      false,
    );
    expect(applyReturnNoteRules(asked, "E aí?", null).adjusted).toBe(false);
    expect(asksForAPerson("me passa para um atendente")).toBe(true);
  });

  it("a resposta usou a nota quando cita o código ou o conteúdo dela", () => {
    expect(replyUsesNote("O REQ-10510 aguarda você.", NOTE)).toBe(true);
    expect(replyUsesNote("Falta você aceitar o convite que chegou do Figma.", NOTE)).toBe(true);
    expect(replyUsesNote("Vou chamar um analista.", NOTE)).toBe(false);
  });
});
