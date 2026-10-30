import { describe, expect, test } from "vitest";

import type { SlaTicket } from "@/domain/sla";
import {
  consoleEventText,
  conversationBadge,
  elapsedText,
  initials,
  lastMessagePreview,
  overdueFirst,
  queueStatusLine,
  ticketCountsText,
} from "../console-texts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("elapsedText", () => {
  test("agora, minutos, horas com minutos e dias", () => {
    expect(elapsedText(0, 30_000)).toBe("agora");
    expect(elapsedText(0, 32 * MINUTE)).toBe("32 min");
    expect(elapsedText(0, 2 * HOUR + 5 * MINUTE)).toBe("2h 05");
    expect(elapsedText(0, DAY + HOUR)).toBe("1 dia");
    expect(elapsedText(0, 3 * DAY)).toBe("3 dias");
  });
});

describe("initials", () => {
  test("primeira letra do primeiro e do último nome", () => {
    expect(initials("Pedro Santos")).toBe("PS");
    expect(initials("Ana Maria Ribeiro")).toBe("AR");
    expect(initials("Carlos")).toBe("C");
  });
});

describe("queueStatusLine", () => {
  const base = {
    reason: null,
    ticketCode: null,
    assignedAnalystName: null,
    isMine: false,
  } as const;

  test("aguardando: motivo com a cor e o chamado", () => {
    expect(
      queueStatusLine({
        ...base,
        status: "waiting_analyst",
        reason: "critical",
        ticketCode: "INC-20420",
      }),
    ).toEqual({ text: "Caso crítico · INC-20420", color: "red" });
  });

  test("em atendimento: por mim ou por outro analista", () => {
    expect(queueStatusLine({ ...base, status: "with_analyst", isMine: true }).text).toBe(
      "Você está atendendo",
    );
    expect(
      queueStatusLine({ ...base, status: "with_analyst", assignedAnalystName: "Carlos Mendes" })
        .text,
    ).toBe("Com Carlos");
  });

  test("com o agent e encerrada", () => {
    expect(queueStatusLine({ ...base, status: "agent" })).toEqual({
      text: "Agent atendendo",
      color: "green",
    });
    expect(queueStatusLine({ ...base, status: "closed" }).text).toBe("Encerrada");
  });
});

describe("lastMessagePreview", () => {
  test("prefixa o autor quando não é o funcionário", () => {
    expect(lastMessagePreview({ role: "assistant", text: "Chamado criado." })).toBe(
      "Nexo: Chamado criado.",
    );
    expect(lastMessagePreview({ role: "user", text: "Oi" })).toBe("Oi");
    expect(lastMessagePreview(null)).toBe("Sem mensagens ainda");
  });
});

describe("conversationBadge", () => {
  test("mostra quem atende para quem só acompanha", () => {
    expect(conversationBadge("with_analyst", "Carlos Mendes", false).label).toBe(
      "Em atendimento por Carlos",
    );
    expect(conversationBadge("waiting_analyst", null, false).label).toBe("Aguardando atendente");
  });
});

describe("consoleEventText", () => {
  test("fala do ponto de vista do analista", () => {
    expect(consoleEventText("assigned", "Ana Ribeiro (Suporte N1)")).toBe(
      "Ana Ribeiro (Suporte N1) assumiu a conversa · agent pausado",
    );
    expect(consoleEventText("returned_to_agent", "Ana Ribeiro (Suporte N1)")).toBe(
      "Ana Ribeiro (Suporte N1) devolveu ao agent",
    );
    expect(consoleEventText("closed")).toBe("Conversa encerrada");
  });
});

describe("painel do funcionário", () => {
  test("conta abertos e encerrados", () => {
    expect(ticketCountsText(["open", "in_progress", "resolved"])).toBe("2 abertos · 1 encerrado");
  });

  test("vencidos no topo, o resto na ordem recebida", () => {
    const now = Date.UTC(2026, 9, 30, 15); // quinta, 12h em São Paulo
    const tickets: (SlaTicket & { code: string })[] = [
      { code: "A", priority: "LOW", status: "open", lastActivityAt: now - HOUR },
      { code: "C", priority: "HIGH", status: "closed", lastActivityAt: now - 9 * DAY },
      { code: "B", priority: "HIGH", status: "open", lastActivityAt: now - 5 * DAY },
    ];

    expect(overdueFirst(tickets, now).map((ticket) => ticket.code)).toEqual(["B", "A", "C"]);
  });
});
