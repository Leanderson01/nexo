import { describe, expect, test } from "vitest";

import { conversationStatusText, handoffBannerText } from "../chat-texts";
import { getComposerState, getCounterTone, type ComposerConversation } from "../composer-state";

const base: ComposerConversation = {
  status: "agent",
  agentBusy: false,
  employeeMessageCount: 3,
  messageLimit: 30,
};

describe("getComposerState (§7.2)", () => {
  test.each<[string, Partial<ComposerConversation>, ReturnType<typeof getComposerState>]>([
    ["agent pronto", {}, "ready"],
    ["agent pensando", { agentBusy: true }, "agent_busy"],
    ["aguardando analista", { status: "waiting_analyst" }, "analyst"],
    ["com analista", { status: "with_analyst" }, "analyst"],
    ["limite atingido", { employeeMessageCount: 30 }, "limit_reached"],
    ["encerrada", { status: "closed" }, "closed"],
    ["encerrada vence o limite", { status: "closed", employeeMessageCount: 30 }, "closed"],
    [
      "limite vence o turno em andamento",
      { agentBusy: true, employeeMessageCount: 30 },
      "limit_reached",
    ],
  ])("%s", (_name, overrides, expected) => {
    expect(getComposerState({ ...base, ...overrides })).toBe(expected);
  });
});

describe("contador de mensagens", () => {
  test("destaca a partir de 20 e marca o limite", () => {
    expect(getCounterTone(19, 30)).toBe("normal");
    expect(getCounterTone(20, 30)).toBe("warning");
    expect(getCounterTone(30, 30)).toBe("limit");
  });
});

describe("textos do chat", () => {
  test("selo do estado da conversa", () => {
    expect(conversationStatusText("agent", null)).toBe("Nexo Assist");
    expect(conversationStatusText("waiting_analyst", null)).toBe("Aguardando analista");
    expect(conversationStatusText("with_analyst", { name: "Ana Ribeiro", level: "N1" })).toBe(
      "Com Ana, Suporte N1",
    );
    expect(conversationStatusText("closed", null)).toBe("Conversa encerrada");
  });

  test("banner de transferência avisa fora do horário, exceto no crítico", () => {
    expect(handoffBannerText("requested", true).outOfHoursNote).not.toBeNull();
    expect(handoffBannerText("requested", false).outOfHoursNote).toBeNull();
    expect(handoffBannerText("critical", true).outOfHoursNote).toBeNull();
  });
});
