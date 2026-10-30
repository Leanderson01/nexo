import { describe, expect, test } from "vitest";

import {
  advanceMark,
  messageReceipt,
  receiptStatus,
  receiverMarks,
  type ReceiptMessage,
} from "../read-receipts";

const user = (createdAt: number, receiver?: "agent" | "analyst"): ReceiptMessage => ({
  role: "user",
  status: "complete",
  createdAt,
  receiver,
});

describe("receiptStatus", () => {
  test.each([
    [{ deliveredAt: null, readAt: null }, "sent"],
    [{ deliveredAt: 9, readAt: null }, "sent"],
    [{ deliveredAt: 10, readAt: null }, "delivered"],
    [{ deliveredAt: 10, readAt: 9 }, "delivered"],
    [{ deliveredAt: 10, readAt: 10 }, "read"],
    // Leu sem a marca de entrega (ex.: abriu direto a conversa): lida.
    [{ deliveredAt: null, readAt: 20 }, "read"],
  ] as const)("marcas %o → %s", (marks, expected) => {
    expect(receiptStatus(10, marks)).toBe(expected);
  });
});

describe("receiverMarks", () => {
  const conversation = {
    agentDeliveredAt: 1,
    agentReadAt: 2,
    analystDeliveredAt: 3,
    analystReadAt: 4,
    employeeDeliveredAt: 5,
    employeeReadAt: 6,
  };

  test("mensagem do funcionário usa as marcas do receptor dela", () => {
    expect(receiverMarks(user(0, "agent"), conversation)).toEqual({ deliveredAt: 1, readAt: 2 });
    expect(receiverMarks(user(0, "analyst"), conversation)).toEqual({ deliveredAt: 3, readAt: 4 });
  });

  test("respostas do agent e do analista usam as marcas do funcionário", () => {
    for (const role of ["assistant", "analyst"] as const) {
      expect(receiverMarks({ role, status: "complete", createdAt: 0 }, conversation)).toEqual({
        deliveredAt: 5,
        readAt: 6,
      });
    }
  });

  test("sem ✓: eventos, streaming e mensagens antigas sem receptor", () => {
    expect(receiverMarks({ role: "system", status: "complete", createdAt: 0 }, conversation)).toBe(
      null,
    );
    expect(
      receiverMarks({ role: "assistant", status: "streaming", createdAt: 0 }, conversation),
    ).toBeNull();
    expect(receiverMarks(user(0), conversation)).toBeNull();
  });

  test("a resposta com erro leva ✓ (o funcionário a recebe do mesmo jeito)", () => {
    expect(
      receiverMarks({ role: "assistant", status: "error", createdAt: 0 }, conversation),
    ).not.toBeNull();
  });
});

describe("messageReceipt", () => {
  test("a marca do agent não vale para a mensagem que foi para o analista", () => {
    const conversation = { agentDeliveredAt: 100, agentReadAt: 100 };
    expect(messageReceipt(user(50, "agent"), conversation)).toBe("read");
    expect(messageReceipt(user(50, "analyst"), conversation)).toBe("sent");
  });

  test("conversa sem marca nenhuma: só salva", () => {
    expect(messageReceipt(user(50, "agent"), {})).toBe("sent");
  });
});

describe("advanceMark", () => {
  test("primeira confirmação grava", () => {
    expect(advanceMark(undefined, 10, 100)).toBe(10);
  });

  test("repetir ou confirmar algo mais antigo não escreve", () => {
    expect(advanceMark(10, 10, 100)).toBeNull();
    expect(advanceMark(10, 5, 100)).toBeNull();
  });

  test("anda para a frente", () => {
    expect(advanceMark(10, 20, 100)).toBe(20);
  });

  test("nunca passa de agora", () => {
    expect(advanceMark(undefined, 500, 100)).toBe(100);
    expect(advanceMark(100, 500, 100)).toBeNull();
  });
});
