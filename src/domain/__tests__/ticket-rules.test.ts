import { describe, expect, it } from "vitest";

import { canReopen, isOpen } from "../ticket-rules";

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
