import { describe, expect, test } from "vitest";

import type { PendingAction } from "@/domain/pending-action";
import { draftView, shownAction } from "../blocks/draft-optimistic";
import {
  isOptimisticId,
  optimisticId,
  withAnalystRequested,
  withNewConversation,
  withSummaryStatus,
  type ConversationHeader,
  type ConversationSummary,
} from "../optimistic-updates";

const SUMMARY: ConversationSummary = {
  _id: "conv_1" as ConversationSummary["_id"],
  status: "agent",
  subject: "VPN",
  lastMessageAt: 1,
};

const HEADER: ConversationHeader = {
  _id: "conv_1" as ConversationHeader["_id"],
  status: "agent",
  subject: "VPN",
  agentBusy: false,
  employeeMessageCount: 3,
  messageLimit: 30,
  dailyLimitReached: false,
  analyst: null,
  lastMessageAt: 1,
};

describe("chat: atualizações otimistas", () => {
  test("Nova conversa entra no topo do histórico, sem link", () => {
    const id = optimisticId<"conversations">("nova");
    const list = withNewConversation([SUMMARY], id, 50);

    expect(list[0]).toEqual({ _id: id, status: "agent", subject: null, lastMessageAt: 50 });
    expect(list[1]).toBe(SUMMARY);
    expect(isOptimisticId(list[0]!._id)).toBe(true);
    expect(isOptimisticId(SUMMARY._id)).toBe(false);
  });

  test("Falar com um analista: a conversa passa a aguardar", () => {
    expect(withAnalystRequested(HEADER).status).toBe("waiting_analyst");
    expect(withSummaryStatus([SUMMARY], "conv_1", "waiting_analyst")[0]?.status).toBe(
      "waiting_analyst",
    );
  });

  test("Falar com um analista fora de `agent` não muda nada", () => {
    const closed = { ...HEADER, status: "closed" as const };
    expect(withAnalystRequested(closed)).toBe(closed);
  });
});

describe("rascunho: estado otimista do card", () => {
  test("pendente sem clique: botões e o rótulo normal", () => {
    expect(draftView("pending", null, null)).toMatchObject({
      label: "Aguardando confirmação",
      showActions: true,
      looksFinal: false,
    });
  });

  test("Confirmar e Cancelar mostram o estado final provável, sem botões", () => {
    expect(draftView("pending", null, "confirm")).toMatchObject({
      label: "Confirmando…",
      showActions: false,
      looksFinal: true,
    });
    expect(draftView("pending", null, "cancel")).toMatchObject({
      label: "Cancelando…",
      showActions: false,
    });
  });

  test("o estado real vence o clique", () => {
    expect(draftView("confirmed", "INC-20500", "confirm")).toMatchObject({
      label: "Confirmado · INC-20500",
      showActions: false,
    });
  });

  test("a edição aparece até a versão salva chegar", () => {
    const original: PendingAction = { kind: "reopen_ticket", code: "INC-1", reason: "Voltou." };
    const edited: PendingAction = { ...original, reason: "Voltou de novo." };
    const saved: PendingAction = { ...edited };

    expect(shownAction(original, { base: original, edited })).toBe(edited);
    expect(shownAction(saved, { base: original, edited })).toBe(saved);
    expect(shownAction(original, null)).toBe(original);
  });
});
