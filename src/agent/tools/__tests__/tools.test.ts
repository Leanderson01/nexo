import { describe, expect, it } from "vitest";

import { makeUnderstanding } from "@/agent/policies/__tests__/fixtures";
import {
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
import { searchKnowledgeBaseTool } from "../search-knowledge-base";
import type { ToolGateways, ToolSession } from "../tool-session";

function setup(
  options: {
    understanding?: Partial<Understanding>;
    gateway?: FakeTicketGateway;
  } = {},
) {
  const store = new InMemoryAgentStore();
  const workspace = new TurnWorkspace();
  const session: ToolSession = {
    now: NOW,
    conversationId: "conv_1",
    employee: { name: "Rafael Lima", department: "Comercial" },
    understanding: makeUnderstanding(options.understanding),
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
  description: "A VPN falha com o erro 809.",
  affected: null,
  impact: "individual" as const,
  blocked: true,
  deadlineToday: false,
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

    await proposeTicketDraftTool(session).run(
      { ...DRAFT, impact: "team", blocked: true, affected: "Equipe Comercial" },
      gateways,
    );

    expect(store.drafts[0].handoffOnConfirm).toBe(true);
    expect(store.drafts[0].action).toMatchObject({ ticket: { priority: "CRITICAL" } });
  });

  it("sem impacto nem bloqueio, pede para perguntar antes", async () => {
    const { session, workspace, gateways } = setup();
    workspace.similarTickets = new Map();

    const output = await proposeTicketDraftTool(session).run(
      { ...DRAFT, impact: null, blocked: null },
      gateways,
    );

    expect(output).toMatchObject({ ok: false, error: expect.stringContaining("impacto") });
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

describe("proposeReopen", () => {
  it("reabre só o que foi resolvido há até 7 dias", async () => {
    const gateway = new FakeTicketGateway({ tickets: [SAP, WIFI] });
    const { session, store, gateways } = setup({ gateway });
    const tool = proposeReopenTool(session);

    const sap = await tool.run({ code: SAP.code, reason: "Bloqueou de novo." }, gateways);

    expect(sap.ok).toBe(true);
    expect(store.drafts[0].action).toEqual({
      kind: "reopen_ticket",
      code: SAP.code,
      reason: "Bloqueou de novo.",
    });

    const second = setup({ gateway });
    const wifi = await proposeReopenTool(second.session).run(
      { code: WIFI.code, reason: "Voltou." },
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
    expect(workspace.hasQuickReplies()).toBe(false);
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
