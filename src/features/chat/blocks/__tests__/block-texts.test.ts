import { describe, expect, test } from "vitest";

import type { MessagePart } from "@/domain/message-parts";
import { computeDueAt } from "@/domain/sla";
import { handoffBannerText } from "../../chat-texts";
import {
  draftDeadlineText,
  draftKindText,
  draftStatusText,
  formatDateTime,
  formatShortDate,
  nextBusinessDayText,
  priorityMotiveText,
  relativeTimeText,
  ticketChoiceText,
} from "../block-texts";
import { findChosenText, toReplySegments } from "../reply-segments";

/** Hora de parede em São Paulo (UTC-3, sem horário de verão). */
function saoPaulo(month: number, day: number, hour: number, minute = 0): number {
  return Date.UTC(2026, month - 1, day, hour + 3, minute);
}

// 30/10/2026 é uma sexta-feira.
const FRIDAY_9_43 = saoPaulo(10, 30, 9, 43);

describe("datas dos cards", () => {
  test("data curta e data com hora, sem o ponto do mês", () => {
    expect(formatShortDate(saoPaulo(10, 16, 14, 20))).toBe("16 out");
    expect(formatDateTime(saoPaulo(10, 16, 14, 20))).toBe("16 out, 14:20");
  });

  test.each([
    [30 * 1000, "agora há pouco"],
    [5 * 60 * 1000, "há 5 min"],
    [3 * 60 * 60 * 1000, "há 3h"],
    [30 * 60 * 60 * 1000, "há 1 dia"],
    [5 * 24 * 60 * 60 * 1000 + 1000, "há 5 dias"],
  ])("tempo desde a última atualização (%i ms)", (elapsed, expected) => {
    expect(relativeTimeText(FRIDAY_9_43 - elapsed, FRIDAY_9_43)).toBe(expected);
  });
});

describe("prazo do rascunho", () => {
  test("Alta proposta às 9:43 de sexta: resposta até 13:43 (4 horas úteis)", () => {
    const dueAt = computeDueAt("HIGH", FRIDAY_9_43);
    expect(draftDeadlineText(dueAt, FRIDAY_9_43)).toBe("resposta até 13:43");
  });

  test("prazo em outro dia mostra a data", () => {
    const fridayEvening = saoPaulo(10, 30, 16, 0);
    const dueAt = computeDueAt("HIGH", fridayEvening);
    expect(draftDeadlineText(dueAt, fridayEvening)).toBe("resposta até 02 nov, 10:00");
  });

  test("motivo da prioridade com o prazo da regra", () => {
    expect(priorityMotiveText("HIGH", "Compromisso hoje em risco")).toBe(
      "Compromisso hoje em risco · prazo de 4 horas úteis",
    );
    expect(priorityMotiveText("CRITICAL", "Parado para uma equipe/empresa")).toBe(
      "Parado para uma equipe/empresa · prazo de 1 hora corrida",
    );
  });

  test("cabeçalho e selo do card", () => {
    expect(draftKindText({ kind: "reopen_ticket", code: "INC-20150", reason: "voltou" })).toBe(
      "Reabertura do INC-20150",
    );
    expect(draftStatusText("pending", null)).toBe("Aguardando confirmação");
    expect(draftStatusText("confirmed", "INC-20420")).toBe("Confirmado · INC-20420");
    expect(draftStatusText("cancelled", null)).toBe("Cancelado");
  });
});

describe("banner de transferência fora do horário (§3.8)", () => {
  test("sexta à noite: avisa a segunda-feira", () => {
    expect(nextBusinessDayText(saoPaulo(10, 30, 20, 0))).toBe(
      "na segunda-feira, 02 nov, a partir das 8h",
    );
  });

  test("madrugada de dia útil: hoje, a partir das 8h", () => {
    expect(nextBusinessDayText(saoPaulo(10, 29, 6, 30))).toBe("hoje, a partir das 8h");
  });

  test("o aviso entra no texto do banner, exceto no caso crítico", () => {
    const saturday = saoPaulo(10, 31, 11, 0);
    expect(handoffBannerText("requested", true, saturday).outOfHoursNote).toBe(
      "Estamos fora do horário de atendimento (8h às 18h, dias úteis). Um analista responde na segunda-feira, 02 nov, a partir das 8h.",
    );
    expect(handoffBannerText("critical", true, saturday).outOfHoursNote).toBeNull();
    expect(handoffBannerText("overdue", false, saturday).title).toBe(
      "Transferimos para um analista: seu chamado passou do prazo.",
    );
  });
});

describe("seletor e opções rápidas", () => {
  test("a escolha vai com o código e o título", () => {
    expect(ticketChoiceText("INC-20311", "Notebook lento após atualização")).toBe(
      "INC-20311 · Notebook lento após atualização",
    );
    expect(ticketChoiceText("INC-20311", null)).toBe("INC-20311");
  });

  test("opções rápidas logo depois do texto entram no mesmo balão", () => {
    const parts: MessagePart[] = [
      { type: "text", text: "Quem está sendo afetado?" },
      { type: "quickReplies", options: [{ label: "Só eu", value: "individual" }] },
      { type: "ticket", code: "INC-20311" },
    ];
    expect(toReplySegments(parts)).toEqual([
      { kind: "bubble", text: "Quem está sendo afetado?", quickReplies: parts[1] },
      { kind: "block", part: parts[2] },
    ]);
  });

  test("opções rápidas sem texto antes ficam soltas", () => {
    const parts: MessagePart[] = [
      { type: "quickReplies", options: [{ label: "Sim", value: "yes" }] },
    ];
    expect(toReplySegments(parts)).toEqual([{ kind: "block", part: parts[0] }]);
  });

  test("a resposta escolhida é a próxima mensagem do funcionário", () => {
    const messages = [
      { role: "assistant", parts: [] },
      { role: "system", parts: [] },
      { role: "user", parts: [{ type: "text", text: "Só eu" }] as MessagePart[] },
    ];
    expect(findChosenText(messages, 0)).toBe("Só eu");
    expect(findChosenText(messages, 2)).toBeNull();
  });
});
