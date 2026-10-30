import { describe, expect, test } from "vitest";

import { HANDOFF_REASONS } from "@/domain/enums";
import type { SlaTicket } from "@/domain/sla";
import {
  HANDOFF_REASON_TONES,
  avatarColorIndex,
  consoleEventText,
  conversationBadge,
  dayLabel,
  elapsedText,
  initials,
  lastMessagePreview,
  overdueFirst,
  queueCornerText,
  queueStatusLine,
  queueTimeText,
  ticketCountsText,
  ticketStatusText,
  ticketUpdateText,
  waitingBarText,
} from "../console-texts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("waitingBarText", () => {
  test('no primeiro minuto não diz "espera há agora"', () => {
    expect(waitingBarText(0, 30_000)).toBe("acabou de chegar");
    expect(waitingBarText(0, 12 * MINUTE)).toBe("espera há 12 min");
  });
});

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
    ).toEqual({ text: "Caso crítico · INC-20420", tone: "danger", colorText: true });
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
      tone: "success",
      colorText: false,
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
      "Ana Ribeiro (Suporte N1) assumiu · agent pausado",
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

  test("segunda linha do chamado: o status ou quando foi resolvido", () => {
    expect(ticketStatusText({ status: "in_progress" })).toBe("Em andamento");
    expect(ticketStatusText({ status: "resolved", resolvedAt: Date.UTC(2026, 8, 2, 15) })).toBe(
      "Resolvido em 02 set",
    );
  });
});

describe("horários e dias", () => {
  const now = Date.UTC(2026, 9, 30, 15); // quinta, 12h em São Paulo

  test("item da fila: agora, hora de hoje, ontem ou a data", () => {
    expect(queueTimeText(now - 20_000, now)).toBe("agora");
    expect(queueTimeText(now - 2 * HOUR, now)).toBe("10:00");
    expect(queueTimeText(now - DAY, now)).toBe("ontem");
    expect(queueTimeText(now - 5 * DAY, now)).toBe("25 out");
  });

  test("separador do histórico: Hoje, Ontem ou a data", () => {
    expect(dayLabel(now - HOUR, now)).toBe("Hoje");
    expect(dayLabel(now - DAY, now)).toBe("Ontem");
    expect(dayLabel(now - 30 * DAY, now)).toBe("30 set");
  });
});

describe("avatarColorIndex", () => {
  test("a mesma pessoa tem sempre a mesma cor, entre as 7 da fundação", () => {
    expect(avatarColorIndex("Pedro Santos")).toBe(avatarColorIndex("Pedro Santos"));
    for (const name of ["Ana", "Carla Mendes", "Bruno Tavares", "Ölga Ürsula"]) {
      expect(avatarColorIndex(name)).toBeGreaterThanOrEqual(0);
      expect(avatarColorIndex(name)).toBeLessThan(7);
    }
  });
});

describe("cores dos motivos", () => {
  test("cada motivo de transferência tem uma cor só dele (§7.4)", () => {
    const tones = HANDOFF_REASONS.map((reason) => HANDOFF_REASON_TONES[reason]);
    expect(new Set(tones).size).toBe(HANDOFF_REASONS.length);
  });
});

describe("queueCornerText", () => {
  const now = Date.UTC(2026, 9, 30, 15, 0);

  test("esperando analista: o tempo de espera desde a transferência", () => {
    expect(
      queueCornerText(
        { status: "waiting_analyst", waitingSince: now - 12 * MINUTE, lastMessageAt: now },
        now,
      ),
    ).toBe("espera 12 min");
    expect(
      queueCornerText({ status: "waiting_analyst", waitingSince: now, lastMessageAt: now }, now),
    ).toBe("agora");
  });

  test("nos outros estados: o horário da última mensagem", () => {
    const lastMessageAt = now - 5 * MINUTE;
    expect(
      queueCornerText({ status: "with_analyst", waitingSince: now - HOUR, lastMessageAt }, now),
    ).toBe(queueTimeText(lastMessageAt, now));
  });
});

describe("queueStatusLine: baixa confiança", () => {
  test("traz a confiança do último turno", () => {
    expect(
      queueStatusLine({
        status: "waiting_analyst",
        reason: "low_confidence",
        ticketCode: null,
        assignedAnalystName: null,
        isMine: false,
        agentConfidence: 0.41,
      }).text,
    ).toBe("Agent pediu ajuda · confiança 41%");
  });
});

describe("ticketUpdateText", () => {
  test("tira o id interno da conversa das transferências antigas", () => {
    expect(
      ticketUpdateText(
        "Conversa transferida para um analista pelo Nexo Assist (conversa k170sjp5m2qxqbbvcjxpszhzgd8h90r2).",
      ),
    ).toBe("Conversa transferida para um analista pelo Nexo Assist.");
    expect(ticketUpdateText("Reiniciei o roteador.")).toBe("Reiniciei o roteador.");
  });
});
