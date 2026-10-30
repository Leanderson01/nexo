import { describe, expect, test } from "vitest";

import {
  addPending,
  countInFlight,
  hasArrived,
  isWaitingForAgent,
  markFailed,
  markSaved,
  removePending,
  visiblePending,
  type PendingMessage,
  type SavedMessage,
} from "../pending-messages";

const CONVERSATION = "conv_1";

const saved = (...roles: string[]): SavedMessage[] =>
  roles.map((role, index) => ({ _id: `msg_${index}`, role }));

function send(
  pending: PendingMessage[],
  clientId: string,
  history: SavedMessage[],
  receiver: "agent" | "analyst" = "agent",
) {
  return addPending(
    pending,
    { clientId, origin: CONVERSATION, text: `texto ${clientId}`, receiver, sentAt: 1 },
    history,
  );
}

describe("mensagem otimista do chat", () => {
  test("aparece na hora, com a posição depois das mensagens já salvas", () => {
    const history = saved("user", "assistant");
    const pending = send([], "a", history);

    expect(visiblePending(pending, CONVERSATION, history)).toEqual([
      expect.objectContaining({ clientId: "a", expectedIndex: 1, failure: null }),
    ]);
  });

  test("some quando a salva chega pela query, antes mesmo da resposta da rota", () => {
    const pending = send([], "a", saved("user", "assistant"));
    const afterArrival = saved("user", "assistant", "user", "assistant");

    expect(visiblePending(pending, CONVERSATION, afterArrival)).toEqual([]);
  });

  test("com o id da rota, some quando aquela mensagem chega", () => {
    const pending = markSaved(send([], "a", []), "a", "msg_9");

    expect(hasArrived(pending[0]!, [{ _id: "msg_9", role: "user" }])).toBe(true);
    expect(hasArrived(pending[0]!, [])).toBe(false);
  });

  test("duas seguidas (com analista) esperam posições diferentes", () => {
    const history = saved("user");
    const pending = send(send([], "a", history, "analyst"), "b", history, "analyst");

    expect(pending.map((item) => item.expectedIndex)).toEqual([1, 2]);
    // Chegou só a primeira: a segunda continua na tela.
    expect(
      visiblePending(pending, CONVERSATION, saved("user", "user")).map((item) => item.clientId),
    ).toEqual(["b"]);
  });

  test("a que falhou fica na tela com o erro e não conta como a caminho", () => {
    const failed = markFailed(send([], "a", []), "a", { message: "Fora do ar", retryable: true });

    expect(visiblePending(failed, CONVERSATION, saved("user"))).toHaveLength(1);
    expect(countInFlight(failed)).toBe(0);
    expect(isWaitingForAgent(failed)).toBe(false);
    expect(removePending(failed, "a")).toEqual([]);
  });

  test("a caminho do agent: o 'digitando…' aparece; para o analista, não", () => {
    expect(isWaitingForAgent(send([], "a", []))).toBe(true);
    expect(isWaitingForAgent(send([], "a", [], "analyst"))).toBe(false);
  });

  test("as de outra conversa não aparecem", () => {
    const pending = send([], "a", []);
    expect(visiblePending(pending, "outra", [])).toEqual([]);
  });

  test("as que já chegaram saem da lista no envio seguinte", () => {
    const first = send([], "a", []);
    const second = send(first, "b", saved("user", "assistant"));

    expect(second.map((item) => item.clientId)).toEqual(["b"]);
    expect(second[0]?.expectedIndex).toBe(1);
  });
});
