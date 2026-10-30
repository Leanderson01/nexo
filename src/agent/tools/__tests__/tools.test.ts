import { describe, expect, it } from "vitest";

import { makeUnderstanding } from "@/agent/policies/__tests__/fixtures";
import {
  detailOf,
  FakeTicketGateway,
  fakeKnowledge,
  InMemoryAgentStore,
  NOTEBOOK,
  NOW,
  SAP,
  VPN_ARTICLE,
  WIFI,
} from "@/agent/pipeline/__tests__/fakes";
import { TurnWorkspace } from "@/agent/pipeline/turn-workspace";
import type { Understanding } from "@/domain/understanding";

import { getMyTicketTool } from "../get-my-ticket";
import { proposeReopenTool } from "../propose-reopen";
import { proposeTicketDraftTool } from "../propose-ticket-draft";
import { proposeTicketUpdateTool, signalToConfirm } from "../propose-ticket-update";
import { searchKnowledgeBaseTool } from "../search-knowledge-base";
import type { ToolGateways, ToolSession } from "../tool-session";

const VPN_TEXT = "Minha VPN dá erro 809 no Windows 11 desde ontem e já reiniciei o computador.";
const SAID_SIGNALS = {
  kind: "INC",
  category: "network_vpn",
  impact: "individual",
  blocked: true,
  deadlineToday: false,
} as const;

function setup(
  options: {
    understanding?: Partial<Understanding>;
    gateway?: FakeTicketGateway;
    employeeTexts?: string[];
    unconfirmedSignals?: ToolSession["facts"]["unconfirmedSignals"];
  } = {},
) {
  const store = new InMemoryAgentStore();
  const workspace = new TurnWorkspace();
  const session: ToolSession = {
    now: NOW,
    conversationId: "conv_1",
    employee: { name: "Rafael Lima", department: "Comercial" },
    understanding: makeUnderstanding({ ticketSignals: SAID_SIGNALS, ...options.understanding }),
    facts: {
      employeeTexts: options.employeeTexts ?? [VPN_TEXT],
      articlesTried: [],
      unconfirmedSignals: options.unconfirmedSignals ?? {},
    },
    store,
    workspace,
  };
  const gateway = options.gateway ?? new FakeTicketGateway();
  const gateways: ToolGateways = {
    tickets: gateway.forCall(() => {}),
    knowledge: fakeKnowledge([VPN_ARTICLE]),
  };
  return { session, store, workspace, gateways };
}

const DRAFT = {
  kind: "INC" as const,
  category: "network_vpn" as const,
  title: "VPN com erro 809 no Windows 11",
  symptom: "A VPN apresenta o erro 809 no Windows 11.",
  symptomEvidence: "VPN dá erro 809 no Windows 11",
  since: "Desde ontem.",
  sinceEvidence: "desde ontem",
  tried: "Já reiniciou o computador.",
  triedEvidence: "já reiniciei o computador",
  referenceCode: null,
};

describe("proposeTicketDraft", () => {
  it("exige o findSimilarTickets antes", async () => {
    const { session, gateways } = setup();
    const output = await proposeTicketDraftTool(session).run(DRAFT, gateways);
    expect(output).toMatchObject({
      ok: false,
      error: expect.stringContaining("findSimilarTickets"),
    });
  });

  it("deriva a prioridade em código e grava só o rascunho", async () => {
    const { session, store, workspace, gateways } = setup();
    workspace.similarTickets = new Map();

    const output = await proposeTicketDraftTool(session).run(DRAFT, gateways);

    expect(output).toMatchObject({ ok: true, priority: "Alta", transfersOnConfirm: false });
    expect(store.drafts).toHaveLength(1);
    expect(store.drafts[0].action).toMatchObject({
      kind: "create_ticket",
      ticket: { priority: "HIGH", affected: "Rafael Lima" },
    });
    expect(workspace.derivedPriority?.value).toBe("HIGH");
    expect(workspace.structuredParts({ includeArticle: false })).toEqual([
      { type: "draft", pendingActionId: "draft_1" },
    ]);
  });

  it("marca handoffOnConfirm quando a CriticalPolicy mandou", async () => {
    const { session, store, workspace, gateways } = setup();
    workspace.similarTickets = new Map();
    workspace.criticalCase = true;

    await proposeTicketDraftTool(session).run(DRAFT, gateways);

    expect(store.drafts[0].handoffOnConfirm).toBe(true);
    expect(store.drafts[0].action).toMatchObject({ ticket: { priority: "HIGH" } });
  });

  it("o artigo que vale e ainda não foi tentado vem antes do chamado (F1)", async () => {
    const { session, workspace, gateways, store } = setup({
      understanding: { intent: "question" },
    });
    workspace.similarTickets = new Map();
    workspace.topArticle = {
      part: { type: "article", slug: "vpn-erro-809", title: "VPN com erro 809", excerpt: "" },
      body: "Reinstale o cliente de VPN.",
      status: "applies",
      appliesTo: [],
      knownValue: null,
    };

    const refused = await proposeTicketDraftTool(session).run(DRAFT, gateways);
    session.facts.articlesTried.push("VPN com erro 809");
    const accepted = await proposeTicketDraftTool(session).run(DRAFT, gateways);

    expect(refused).toMatchObject({ ok: false, error: expect.stringContaining("Isso resolveu?") });
    expect(accepted.ok).toBe(true);
    expect(store.drafts).toHaveLength(1);
  });

  it("os sinais vêm só do ENTENDER conferido: sem impacto, nada de rascunho", async () => {
    const { session, workspace, gateways, store } = setup({
      understanding: { ticketSignals: { ...SAID_SIGNALS, impact: null, blocked: null } },
    });
    workspace.similarTickets = new Map();

    const output = await proposeTicketDraftTool(session).run(DRAFT, gateways);

    expect(output).toMatchObject({ ok: false, error: expect.stringContaining("quem é afetado") });
    expect(store.drafts).toEqual([]);
  });

  it("a equipe parada vira Crítica e transfere ao confirmar, sem a CriticalPolicy", async () => {
    const { session, workspace, gateways, store } = setup({
      understanding: { ticketSignals: { ...SAID_SIGNALS, impact: "team" } },
    });
    workspace.similarTickets = new Map();

    await proposeTicketDraftTool(session).run(DRAFT, gateways);

    expect(store.drafts[0]).toMatchObject({
      handoffOnConfirm: true,
      action: { ticket: { priority: "CRITICAL", affected: "Equipe de Comercial" } },
    });
  });

  it("monta a descrição só com o que foi dito (§11.2)", async () => {
    const { session, workspace, gateways, store } = setup({
      understanding: { entities: { ...makeUnderstanding().entities, os: "Windows 11" } },
    });
    workspace.similarTickets = new Map();

    await proposeTicketDraftTool(session).run(
      {
        ...DRAFT,
        tried: "Já reinstalou o cliente da VPN pelo portal.",
        triedEvidence: "reinstalei o cliente",
      },
      gateways,
    );

    expect(store.drafts[0].action).toMatchObject({
      ticket: {
        description:
          "A VPN apresenta o erro 809 no Windows 11. Desde ontem. Afeta apenas o solicitante; impede o trabalho, sem alternativa no momento. Sistema operacional: Windows 11.",
      },
    });
    expect(workspace.correctedDescriptionFields).toEqual(["o que já foi tentado"]);
  });

  it("só aceita referência a um parecido que o domínio mandou criar novo", async () => {
    const { session, workspace, gateways, store } = setup();
    workspace.similarTickets = new Map([
      [WIFI.code, "new_with_reference"],
      [NOTEBOOK.code, "update"],
    ]);
    const tool = proposeTicketDraftTool(session);

    const refused = await tool.run({ ...DRAFT, referenceCode: NOTEBOOK.code }, gateways);
    const accepted = await tool.run({ ...DRAFT, referenceCode: WIFI.code }, gateways);

    expect(refused).toMatchObject({
      ok: false,
      error: expect.stringContaining("proposeTicketUpdate"),
    });
    expect(accepted.ok).toBe(true);
    expect(store.drafts[0].action).toMatchObject({ ticket: { reopenedFrom: WIFI.code } });
  });
});

describe("proposeTicketUpdate (F3, reclassificação)", () => {
  const PRINTER = detailOf(
    {
      code: "INC-20395",
      kind: "INC",
      category: "hardware",
      priority: "MEDIUM",
      status: "open",
      title: "Impressora do 2º andar não imprime",
      createdAt: NOW - 2 * 24 * 60 * 60 * 1000,
      lastActivityAt: NOW - 2 * 24 * 60 * 60 * 1000,
    },
    { prioritySignals: { impact: "team", blocked: false, deadlineToday: false } },
  );
  const PEDRO =
    "Sobre a impressora do 2º andar: agora ninguém do andar consegue imprimir e a equipe tem que entregar contratos impressos hoje à tarde.";
  const UPDATE = {
    code: PRINTER.code,
    text: "Ninguém do andar consegue imprimir.",
    evidence: "ninguém do andar consegue imprimir",
  };

  it("com bloqueio e compromisso confirmados na fala, propõe a nova prioridade Crítica e transfere", async () => {
    const { session, store, gateways } = setup({
      gateway: new FakeTicketGateway({ tickets: [PRINTER] }),
      employeeTexts: [PEDRO],
      understanding: {
        intent: "update_ticket",
        ticketSignals: {
          kind: "INC",
          category: "hardware",
          impact: "team",
          blocked: true,
          deadlineToday: true,
        },
      },
    });
    const result = await proposeTicketUpdateTool(session).run(UPDATE, gateways);
    expect(result).toMatchObject({ ok: true, newPriority: "Crítica" });
    expect(store.drafts[0].action).toMatchObject({
      kind: "update_ticket",
      fieldChanges: { priority: "CRITICAL" },
    });
    expect(store.drafts[0].handoffOnConfirm).toBe(true);
  });

  it("sinal sem confirmação que mudaria a prioridade: não propõe, pergunta", async () => {
    const { session, store, workspace, gateways } = setup({
      gateway: new FakeTicketGateway({ tickets: [PRINTER] }),
      employeeTexts: ["A impressora do 2º andar continua sem imprimir"],
      understanding: {
        intent: "update_ticket",
        ticketSignals: {
          kind: "INC",
          category: "hardware",
          impact: null,
          blocked: null,
          deadlineToday: null,
        },
      },
      unconfirmedSignals: { blocked: true },
    });
    const result = await proposeTicketUpdateTool(session).run(UPDATE, gateways);
    expect(result).toMatchObject({ ok: false });
    expect(store.drafts).toHaveLength(0);
    expect(workspace.updateNeedsSignal).toEqual({ code: PRINTER.code, signal: "blocked" });
  });

  it("sinal sem confirmação que não muda nada: atualiza sem perguntar", () => {
    const said = {
      kind: "INC",
      category: "hardware",
      impact: "team",
      blocked: true,
      deadlineToday: null,
    } as const;
    expect(signalToConfirm(PRINTER, said, { deadlineToday: true })).toBeNull();
    expect(signalToConfirm(PRINTER, { ...said, blocked: null }, { blocked: true })).toBe("blocked");
  });
});

describe("proposeReopen: artigo antes (F1, QA R1)", () => {
  it("com artigo que vale e ainda não foi tentado, não reabre", async () => {
    const { session, workspace, store, gateways } = setup({
      gateway: new FakeTicketGateway({ tickets: [SAP] }),
      understanding: { intent: "question" },
      employeeTexts: ["Não consigo entrar no SAP, aparece usuário bloqueado"],
    });
    workspace.topArticle = {
      part: {
        type: "article",
        slug: "senha-sap-bloqueada",
        title: "Senha do SAP bloqueada",
        excerpt: "",
      },
      body: "O desbloqueio é automático em 30 minutos.",
      status: "applies",
      appliesTo: [],
      knownValue: null,
    };
    const result = await proposeReopenTool(session).run(
      { code: SAP.code, reason: "Usuário bloqueado.", evidence: "aparece usuário bloqueado" },
      gateways,
    );
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("Isso resolveu?") });
    expect(store.drafts).toHaveLength(0);
  });
});

describe("proposeReopen", () => {
  it("reabre só o que foi resolvido há até 7 dias", async () => {
    const gateway = new FakeTicketGateway({ tickets: [SAP, WIFI] });
    const { session, store, gateways } = setup({
      gateway,
      employeeTexts: ["Minha senha do SAP bloqueou de novo"],
    });
    const tool = proposeReopenTool(session);

    const sap = await tool.run(
      {
        code: SAP.code,
        reason: "Já tentei desbloquear conforme orientações anteriores.",
        evidence: "senha do SAP bloqueou de novo",
      },
      gateways,
    );

    expect(sap.ok).toBe(true);
    // A tentativa inventada sai: fica a fala do funcionário.
    expect(store.drafts[0].action).toEqual({
      kind: "reopen_ticket",
      code: SAP.code,
      reason: "Senha do SAP bloqueou de novo.",
    });

    const second = setup({ gateway });
    const wifi = await proposeReopenTool(second.session).run(
      { code: WIFI.code, reason: "Voltou.", evidence: "voltou" },
      second.gateways,
    );
    expect(wifi).toMatchObject({ ok: false, error: expect.stringContaining("referenceCode") });
  });
});

describe("getMyTicket", () => {
  it("chamado alheio ou inexistente não repete o código nem confirma que existe", async () => {
    const { session, workspace, gateways } = setup();
    const output = await getMyTicketTool(session).run({ code: "INC-20388" }, gateways);

    expect(output.ok).toBe(false);
    expect(JSON.stringify(output)).not.toContain("INC-20388");
    expect(workspace.shownTickets()).toEqual([]);
  });

  it("chamado do funcionário mostra o card", async () => {
    const gateway = new FakeTicketGateway({ tickets: [NOTEBOOK] });
    const { session, workspace, gateways } = setup({ gateway });

    const output = await getMyTicketTool(session).run({ code: "inc-20311" }, gateways);

    expect(output).toMatchObject({ ok: true, ticket: { code: NOTEBOOK.code, overdue: true } });
    expect(workspace.shownTickets()).toEqual([NOTEBOOK.code]);
  });
});

describe("searchKnowledgeBase", () => {
  it("sem saber o Windows, anexa as opções da condição e não guarda o artigo", async () => {
    const { session, workspace, gateways } = setup();

    const output = await searchKnowledgeBaseTool(session).run({ query: "vpn 809" }, gateways);

    expect(output).toMatchObject({ ok: true, articles: [{ applicability: "needs_confirmation" }] });
    expect(workspace.applicableArticle).toBeNull();
    expect(workspace.structuredParts({ includeArticle: true })).toEqual([
      {
        type: "quickReplies",
        options: ["Windows 10", "Windows 11", "Não sei"].map((label) => ({ label, value: label })),
      },
    ]);
  });

  it("com Windows 11, manda não seguir o artigo", async () => {
    const { session, workspace, gateways } = setup({
      understanding: {
        entities: {
          system: "VPN",
          errorCode: "809",
          os: "Windows 11",
          device: null,
          ticketRef: null,
        },
      },
    });

    const output = await searchKnowledgeBaseTool(session).run({ query: "vpn 809" }, gateways);

    expect(output).toMatchObject({ ok: true, articles: [{ applicability: "does_not_apply" }] });
    expect(workspace.applicableArticle).toBeNull();
    expect(workspace.quickReplyLabels()).toBeNull();
  });

  it("com Windows 10, guarda o artigo para o card", async () => {
    const { session, workspace, gateways } = setup({
      understanding: {
        entities: {
          system: "VPN",
          errorCode: "809",
          os: "Windows 10",
          device: null,
          ticketRef: null,
        },
      },
    });

    await searchKnowledgeBaseTool(session).run({ query: "vpn 809" }, gateways);

    expect(workspace.applicableArticle?.slug).toBe(VPN_ARTICLE.slug);
  });
});
