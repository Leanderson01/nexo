import { describe, expect, test } from "vitest";

import { conversationEventText } from "@/features/chat/chat-texts";
import { consoleEventText } from "@/features/console/console-texts";
import { isNewNotice } from "../notice-tracking";
import { ticketUpdatedText } from "../notification-texts";

describe("isNewNotice", () => {
  test("a primeira leitura é a base: nada vira toast ao abrir o chat", () => {
    expect(isNewNotice(undefined, "u1")).toBe(false);
  });

  test("id diferente da base é novo; o mesmo id, não", () => {
    expect(isNewNotice("u1", "u2")).toBe(true);
    expect(isNewNotice(null, "u1")).toBe(true);
    expect(isNewNotice("u1", "u1")).toBe(false);
    expect(isNewNotice("u1", null)).toBe(false);
  });
});

describe("ticketUpdatedText", () => {
  test("com mudança de status, diz o status novo", () => {
    expect(ticketUpdatedText({ code: "INC-20311", status: "in_progress" })).toBe(
      "O chamado INC-20311 foi atualizado: Em andamento",
    );
  });

  test("sem mudança de status ou sem código", () => {
    expect(ticketUpdatedText({ code: "INC-20311" })).toBe(
      "O chamado INC-20311 foi atualizado pelo suporte",
    );
    expect(ticketUpdatedText({})).toBe("Um chamado seu foi atualizado pelo suporte");
  });
});

describe("evento ticket_updated", () => {
  const ticket = { code: "INC-20311", status: "resolved" } as const;

  test("no chat, o funcionário lê o chamado e o status", () => {
    expect(conversationEventText("ticket_updated", "Ana Ribeiro (Suporte N1)", ticket)).toBe(
      "O chamado INC-20311 foi atualizado: Resolvido",
    );
  });

  test("no console, a linha diz quem atualizou", () => {
    expect(consoleEventText("ticket_updated", "Ana Ribeiro (Suporte N1)", ticket)).toBe(
      "Ana Ribeiro (Suporte N1) atualizou o INC-20311: Resolvido",
    );
    expect(consoleEventText("ticket_updated", undefined, { code: "INC-20311" })).toBe(
      "O chamado INC-20311 foi atualizado pelo suporte",
    );
  });
});
