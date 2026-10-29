import { describe, expect, it } from "vitest";

import { canTransition, transition, type ConversationTransition } from "../conversation-fsm";
import { CONVERSATION_STATUSES, type ConversationStatus } from "../enums";
import { ok } from "../result";

const ALL_EVENTS: ConversationTransition[] = ["transfer", "assign", "return", "close"];

const VALID: [ConversationStatus, ConversationTransition, ConversationStatus][] = [
  ["agent", "transfer", "waiting_analyst"],
  ["agent", "close", "closed"],
  ["waiting_analyst", "assign", "with_analyst"],
  ["waiting_analyst", "return", "agent"],
  ["waiting_analyst", "close", "closed"],
  ["with_analyst", "return", "agent"],
  ["with_analyst", "close", "closed"],
];

describe("transition", () => {
  it.each(VALID)("%s --%s--> %s", (from, event, to) => {
    expect(transition(from, event)).toEqual(ok(to));
    expect(canTransition(from, event)).toBe(true);
  });

  it("devolver ao agent vale também antes de assumir (decisão 11)", () => {
    expect(transition("waiting_analyst", "return")).toEqual(ok("agent"));
  });

  it("recusa toda combinação fora da tabela", () => {
    const invalid = CONVERSATION_STATUSES.flatMap((from) =>
      ALL_EVENTS.filter((event) => !VALID.some(([f, e]) => f === from && e === event)).map(
        (event) => [from, event] as const,
      ),
    );

    expect(invalid).toHaveLength(16 - VALID.length);
    for (const [from, event] of invalid) {
      expect(transition(from, event).ok).toBe(false);
      expect(canTransition(from, event)).toBe(false);
    }
  });

  it("não assume fora da fila", () => {
    expect(transition("agent", "assign")).toEqual({
      ok: false,
      error: 'Não é possível assumir o atendimento a partir de "Nexo Assist".',
    });
    expect(transition("with_analyst", "assign").ok).toBe(false);
  });

  it("não sai de uma conversa encerrada", () => {
    for (const event of ALL_EVENTS) {
      expect(transition("closed", event).ok).toBe(false);
    }
  });

  it("não transfere de novo uma conversa que já está com analista", () => {
    expect(transition("waiting_analyst", "transfer").ok).toBe(false);
    expect(transition("with_analyst", "transfer").ok).toBe(false);
  });
});
