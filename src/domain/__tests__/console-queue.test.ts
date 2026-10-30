import { describe, expect, test } from "vitest";

import { belongsToTab, compareQueueEntries, countByTab, type QueueEntry } from "../console-queue";

function entry(overrides: Partial<QueueEntry>): QueueEntry {
  return {
    status: "waiting_analyst",
    reason: "requested",
    isMine: false,
    waitingSince: 1_000,
    lastMessageAt: 1_000,
    ...overrides,
  };
}

describe("belongsToTab", () => {
  test("'Para você' é aguardando analista; 'Minhas' é em atendimento por mim", () => {
    expect(belongsToTab(entry({ status: "waiting_analyst" }), "for_you")).toBe(true);
    expect(belongsToTab(entry({ status: "with_analyst", isMine: true }), "mine")).toBe(true);
    expect(belongsToTab(entry({ status: "with_analyst", isMine: false }), "mine")).toBe(false);
    expect(belongsToTab(entry({ status: "agent" }), "with_agent")).toBe(true);
  });

  test("'Todas' deixa as encerradas de fora; elas têm a aba delas", () => {
    expect(belongsToTab(entry({ status: "closed" }), "all")).toBe(false);
    expect(belongsToTab(entry({ status: "closed" }), "closed")).toBe(true);
  });
});

describe("countByTab", () => {
  test("conta cada conversa em todas as abas a que pertence", () => {
    const counts = countByTab([
      entry({ status: "waiting_analyst" }),
      entry({ status: "with_analyst", isMine: true }),
      entry({ status: "agent" }),
      entry({ status: "closed" }),
    ]);

    expect(counts).toEqual({ all: 3, for_you: 1, with_agent: 1, mine: 1, closed: 1 });
  });
});

describe("compareQueueEntries", () => {
  test("críticas primeiro, depois quem espera há mais tempo, depois o resto do mais recente", () => {
    const oldRequest = entry({ reason: "requested", waitingSince: 100 });
    const newCritical = entry({ reason: "critical", waitingSince: 900 });
    const newRequest = entry({ reason: "overdue", waitingSince: 500 });
    const withAgentOld = entry({
      status: "agent",
      reason: null,
      waitingSince: null,
      lastMessageAt: 50,
    });
    const withAgentNew = entry({
      status: "agent",
      reason: null,
      waitingSince: null,
      lastMessageAt: 800,
    });

    const sorted = [withAgentOld, oldRequest, withAgentNew, newRequest, newCritical].sort(
      compareQueueEntries,
    );

    expect(sorted).toEqual([newCritical, oldRequest, newRequest, withAgentNew, withAgentOld]);
  });
});
