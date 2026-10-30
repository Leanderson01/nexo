import { describe, expect, test } from "vitest";

import type { MessagePart } from "@/domain/message-parts";
import { StreamingMessage, type AgentMessageSink } from "../streaming-message";

/** Sink em memória; `accepting = false` simula a mensagem que saiu de `streaming`. */
function createFakeSink() {
  const calls: {
    deltas: string[];
    finalized: MessagePart[][];
    replacedText: (string | undefined)[];
    failed: string[];
  } = { deltas: [], finalized: [], replacedText: [], failed: [] };
  let accepting = true;
  const sink: AgentMessageSink = {
    appendDelta: async (delta) => {
      if (accepting) calls.deltas.push(delta);
      return accepting;
    },
    finalize: async (parts, _decisionId, text) => {
      if (accepting) calls.finalized.push(parts);
      if (accepting) calls.replacedText.push(text);
      return accepting;
    },
    fail: async (message) => {
      if (accepting) calls.failed.push(message);
      return accepting;
    },
  };
  return { sink, calls, stopAccepting: () => (accepting = false) };
}

function createClock() {
  let now = 0;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("StreamingMessage", () => {
  test("junta os pedaços e grava em lotes de 150 ms", async () => {
    const { sink, calls } = createFakeSink();
    const clock = createClock();
    const reply = new StreamingMessage(sink, clock.now);

    await reply.write("Olá");
    clock.advance(100);
    await reply.write(", ");
    expect(calls.deltas).toEqual([]);

    clock.advance(50);
    await reply.write("Mariana");
    expect(calls.deltas).toEqual(["Olá, Mariana"]);

    await reply.write("!");
    await reply.finish([{ type: "ticket", code: "INC-20311" }]);
    expect(calls.deltas).toEqual(["Olá, Mariana", "!"]);
    expect(calls.finalized).toEqual([[{ type: "ticket", code: "INC-20311" }]]);
    expect(reply.stopped).toBe(true);
  });

  test("finish com texto de correção descarta o pendente e manda a troca", async () => {
    const { sink, calls } = createFakeSink();
    const reply = new StreamingMessage(sink, createClock().now);

    await reply.write("Preparei uma atualização.");
    await reply.finish([], undefined, "Não consegui preparar o rascunho.");

    expect(calls.deltas).toEqual([]);
    expect(calls.replacedText).toEqual(["Não consegui preparar o rascunho."]);
  });

  test("para de escrever quando a mensagem já não aceita (timeout)", async () => {
    const { sink, calls, stopAccepting } = createFakeSink();
    const clock = createClock();
    const reply = new StreamingMessage(sink, clock.now);

    stopAccepting();
    clock.advance(200);
    await reply.write("atrasado");

    expect(reply.stopped).toBe(true);
    await reply.write("mais");
    await reply.finish();
    expect(calls).toEqual({ deltas: [], finalized: [], replacedText: [], failed: [] });
  });

  test("fail grava o texto pendente e depois o erro", async () => {
    const { sink, calls } = createFakeSink();
    const reply = new StreamingMessage(sink, createClock().now);

    await reply.write("Começando");
    await reply.fail("Não consegui responder agora.", true);

    expect(calls.deltas).toEqual(["Começando"]);
    expect(calls.failed).toEqual(["Não consegui responder agora."]);
  });
});
