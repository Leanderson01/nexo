import { describe, expect, it } from "vitest";

import {
  canReopen,
  findDuplicateCandidates,
  isOpen,
  suggestDuplicateAction,
} from "../ticket-rules";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 9, 29, 15, 0);

describe("isOpen", () => {
  it("considera aberto tudo que não é Resolvido nem Fechado", () => {
    expect(isOpen("open")).toBe(true);
    expect(isOpen("awaiting_employee")).toBe(true);
    expect(isOpen("approved")).toBe(true);
    expect(isOpen("resolved")).toBe(false);
    expect(isOpen("closed")).toBe(false);
  });
});

describe("canReopen", () => {
  it("aceita resolvido há exatamente 7 dias", () => {
    expect(canReopen({ status: "resolved", resolvedAt: now - 7 * DAY }, now)).toBe(true);
  });

  it("recusa resolvido há mais de 7 dias", () => {
    expect(canReopen({ status: "resolved", resolvedAt: now - 7 * DAY - 1 }, now)).toBe(false);
  });

  it("recusa chamado que não está resolvido", () => {
    expect(canReopen({ status: "closed", resolvedAt: now - DAY }, now)).toBe(false);
    expect(canReopen({ status: "open" }, now)).toBe(false);
  });
});

describe("suggestDuplicateAction", () => {
  it("propõe atualizar um chamado aberto", () => {
    const ticket = { status: "awaiting_analyst", lastActivityAt: now - 20 * DAY } as const;
    expect(suggestDuplicateAction(ticket, now)).toBe("update");
  });

  it("propõe reabrir um resolvido há até 7 dias", () => {
    const resolvedAt = now - 7 * DAY;
    const ticket = { status: "resolved", lastActivityAt: resolvedAt, resolvedAt } as const;
    expect(suggestDuplicateAction(ticket, now)).toBe("reopen");
  });

  it("propõe um novo com referência a um resolvido há mais de 7 dias", () => {
    const resolvedAt = now - 7 * DAY - 1;
    const ticket = { status: "resolved", lastActivityAt: resolvedAt, resolvedAt } as const;
    expect(suggestDuplicateAction(ticket, now)).toBe("new_with_reference");
  });

  it("propõe um novo com referência a um fechado, mesmo recente", () => {
    const resolvedAt = now - DAY;
    const ticket = { status: "closed", lastActivityAt: resolvedAt, resolvedAt } as const;
    expect(suggestDuplicateAction(ticket, now)).toBe("new_with_reference");
  });
});

describe("findDuplicateCandidates", () => {
  const open = { code: "INC-1", status: "open", lastActivityAt: now - 60 * DAY } as const;
  const resolvedAtLimit = {
    code: "INC-2",
    status: "resolved",
    lastActivityAt: now - 30 * DAY,
    resolvedAt: now - 30 * DAY,
  } as const;
  const resolvedTooOld = {
    code: "INC-3",
    status: "resolved",
    lastActivityAt: now - 30 * DAY - 1,
    resolvedAt: now - 30 * DAY - 1,
  } as const;
  const closedWithoutResolvedAt = {
    code: "INC-4",
    status: "closed",
    lastActivityAt: now - 10 * DAY,
  } as const;
  const closedTooOld = { code: "INC-5", status: "closed", lastActivityAt: now - 40 * DAY } as const;

  it("mantém abertos e encerrados há até 30 dias", () => {
    const tickets = [open, resolvedAtLimit, resolvedTooOld, closedWithoutResolvedAt, closedTooOld];
    expect(findDuplicateCandidates(tickets, now).map((ticket) => ticket.code)).toEqual([
      "INC-1",
      "INC-2",
      "INC-4",
    ]);
  });
});
