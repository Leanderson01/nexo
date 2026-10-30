import { describe, expect, test } from "vitest";

import { ackToSend, latestIncoming, type AckMessage } from "../receipt-acks";

describe("o que o chat do funcionário confirma", () => {
  const messages: AckMessage[] = [
    { role: "user", createdAt: 1, receipt: "read" },
    { role: "assistant", createdAt: 2, receipt: "sent" },
    { role: "system", createdAt: 3, receipt: null },
    { role: "analyst", createdAt: 4, receipt: "delivered" },
    { role: "user", createdAt: 5, receipt: "sent" },
    { role: "assistant", createdAt: 6, receipt: null }, // em streaming
  ];

  test("a resposta mais recente que leva ✓, sem as do próprio funcionário nem o streaming", () => {
    expect(latestIncoming(messages)).toEqual({ upTo: 4, receipt: "delivered" });
  });

  test("sem resposta, nada a confirmar", () => {
    expect(latestIncoming([{ role: "user", createdAt: 1, receipt: "sent" }])).toBeNull();
  });

  test("aba visível: lê; escondida: só chegou", () => {
    expect(ackToSend({ upTo: 4, receipt: "sent" }, true)).toBe("read");
    expect(ackToSend({ upTo: 4, receipt: "delivered" }, true)).toBe("read");
    expect(ackToSend({ upTo: 4, receipt: "sent" }, false)).toBe("delivered");
  });

  test("já no ponto: não manda nada", () => {
    expect(ackToSend({ upTo: 4, receipt: "read" }, true)).toBeNull();
    expect(ackToSend({ upTo: 4, receipt: "delivered" }, false)).toBeNull();
    expect(ackToSend({ upTo: 4, receipt: "read" }, false)).toBeNull();
  });
});
