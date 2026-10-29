import { describe, expect, it } from "vitest";

import { addBusinessHours } from "../business-hours";
import type { Priority, TicketStatus } from "../enums";
import {
  computeDueAt,
  formatSlaBadge,
  getSlaState,
  isOverdue,
  timeUntilDue,
  type SlaTicket,
} from "../sla";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Hora de parede em São Paulo (UTC-3, sem horário de verão desde 2019). */
function saoPaulo(month: number, day: number, hour: number, minute = 0): number {
  return Date.UTC(2026, month - 1, day, hour + 3, minute);
}

// Semana de referência: segunda 26/10/2026 a domingo 01/11/2026.
const MONDAY = 26;
const TUESDAY = 27;
const WEDNESDAY = 28;
const FRIDAY = 30;
const SATURDAY = 31;

function ticket(priority: Priority, status: TicketStatus, lastActivityAt: number): SlaTicket {
  return { priority, status, lastActivityAt };
}

describe("addBusinessHours", () => {
  it("sexta 17h + 4h úteis vence segunda 11h", () => {
    expect(addBusinessHours(saoPaulo(10, FRIDAY, 17), 4)).toBe(saoPaulo(11, 2, 11));
  });

  it("dentro do expediente soma direto", () => {
    expect(addBusinessHours(saoPaulo(10, TUESDAY, 9, 30), 4)).toBe(saoPaulo(10, TUESDAY, 13, 30));
  });

  it("pode vencer exatamente às 18h", () => {
    expect(addBusinessHours(saoPaulo(10, TUESDAY, 14), 4)).toBe(saoPaulo(10, TUESDAY, 18));
  });

  it("atividade à noite começa a contar às 8h do dia seguinte", () => {
    expect(addBusinessHours(saoPaulo(10, TUESDAY, 20), 4)).toBe(saoPaulo(10, WEDNESDAY, 12));
    expect(addBusinessHours(saoPaulo(10, TUESDAY, 18), 4)).toBe(saoPaulo(10, WEDNESDAY, 12));
  });

  it("atividade de madrugada começa a contar às 8h do mesmo dia", () => {
    expect(addBusinessHours(saoPaulo(10, TUESDAY, 6), 4)).toBe(saoPaulo(10, TUESDAY, 12));
  });

  it("atividade no fim de semana começa a contar na segunda 8h", () => {
    expect(addBusinessHours(saoPaulo(10, SATURDAY, 10), 4)).toBe(saoPaulo(11, 2, 12));
    expect(addBusinessHours(saoPaulo(11, 1, 23, 59), 4)).toBe(saoPaulo(11, 2, 12));
  });
});

describe("computeDueAt", () => {
  it("Alta: 4 horas úteis", () => {
    expect(computeDueAt("HIGH", saoPaulo(10, FRIDAY, 17))).toBe(saoPaulo(11, 2, 11));
  });

  it("Média: 3 dias úteis = 30 horas úteis", () => {
    expect(computeDueAt("MEDIUM", saoPaulo(10, MONDAY, 8))).toBe(saoPaulo(10, WEDNESDAY, 18));
    expect(computeDueAt("MEDIUM", saoPaulo(10, WEDNESDAY, 15))).toBe(saoPaulo(11, 2, 15));
  });

  it("Baixa: 5 dias úteis = 50 horas úteis", () => {
    expect(computeDueAt("LOW", saoPaulo(10, MONDAY, 8))).toBe(saoPaulo(10, FRIDAY, 18));
    expect(computeDueAt("LOW", saoPaulo(10, MONDAY, 9))).toBe(saoPaulo(11, 2, 9));
  });

  it("Crítica: 1 hora corrida, mesmo de madrugada no fim de semana", () => {
    expect(computeDueAt("CRITICAL", saoPaulo(10, SATURDAY, 23, 30))).toBe(saoPaulo(11, 1, 0, 30));
    expect(computeDueAt("CRITICAL", saoPaulo(10, TUESDAY, 17, 30))).toBe(
      saoPaulo(10, TUESDAY, 18, 30),
    );
  });
});

describe("isOverdue", () => {
  const lastActivityAt = saoPaulo(10, TUESDAY, 9);
  const dueAt = saoPaulo(10, TUESDAY, 13);

  it("vence só depois do prazo", () => {
    expect(isOverdue(ticket("HIGH", "in_progress", lastActivityAt), dueAt)).toBe(false);
    expect(isOverdue(ticket("HIGH", "in_progress", lastActivityAt), dueAt + 1)).toBe(true);
  });

  it("conta para os status abertos, inclusive Aprovado e Aguardando analista", () => {
    for (const status of ["open", "in_progress", "awaiting_analyst", "approved"] as const) {
      expect(isOverdue(ticket("HIGH", status, lastActivityAt), dueAt + HOUR)).toBe(true);
    }
  });

  it("pausa em Aguardando você", () => {
    expect(isOverdue(ticket("HIGH", "awaiting_employee", lastActivityAt), dueAt + DAY)).toBe(false);
  });

  it("não vence chamado Resolvido nem Fechado", () => {
    expect(isOverdue(ticket("HIGH", "resolved", lastActivityAt), dueAt + DAY)).toBe(false);
    expect(isOverdue(ticket("HIGH", "closed", lastActivityAt), dueAt + DAY)).toBe(false);
  });
});

describe("timeUntilDue", () => {
  it("é positivo antes do prazo e negativo depois", () => {
    const highTicket = ticket("HIGH", "open", saoPaulo(10, TUESDAY, 9));
    expect(timeUntilDue(highTicket, saoPaulo(10, TUESDAY, 11))).toBe(2 * HOUR);
    expect(timeUntilDue(highTicket, saoPaulo(10, TUESDAY, 14))).toBe(-HOUR);
  });
});

describe("formatSlaBadge", () => {
  const lastActivityAt = saoPaulo(10, MONDAY, 8);
  const mediumDueAt = saoPaulo(10, WEDNESDAY, 18);
  const medium = (status: TicketStatus) => ticket("MEDIUM", status, lastActivityAt);

  it("diz 'no prazo' com 24h ou mais de folga", () => {
    expect(formatSlaBadge(medium("open"), mediumDueAt - DAY)).toBe("no prazo");
    expect(getSlaState(medium("open"), mediumDueAt - DAY)).toBe("on_time");
  });

  it("mostra quanto falta abaixo de 24h", () => {
    expect(formatSlaBadge(medium("open"), mediumDueAt - DAY + 1)).toBe("vence em 23h");
    expect(formatSlaBadge(medium("open"), mediumDueAt - 2 * HOUR - 50 * MINUTE)).toBe(
      "vence em 2h",
    );
    expect(formatSlaBadge(medium("open"), mediumDueAt - 45 * MINUTE)).toBe("vence em 45 min");
    expect(formatSlaBadge(medium("open"), mediumDueAt)).toBe("vence em 1 min");
    expect(getSlaState(medium("open"), mediumDueAt)).toBe("due_soon");
  });

  it("mostra há quanto tempo venceu", () => {
    expect(formatSlaBadge(medium("open"), mediumDueAt + 10 * MINUTE)).toBe("vencido há 10 min");
    expect(formatSlaBadge(medium("open"), mediumDueAt + 3 * HOUR)).toBe("vencido há 3h");
    expect(formatSlaBadge(medium("open"), mediumDueAt + DAY + 5 * HOUR)).toBe("vencido há 1 dia");
    expect(formatSlaBadge(medium("open"), mediumDueAt + 3 * DAY)).toBe("vencido há 3 dias");
    expect(getSlaState(medium("open"), mediumDueAt + 1)).toBe("overdue");
  });

  it("mostra prazo pausado e chamado encerrado", () => {
    expect(formatSlaBadge(medium("awaiting_employee"), mediumDueAt + DAY)).toBe("prazo pausado");
    expect(formatSlaBadge(medium("resolved"), mediumDueAt + DAY)).toBe("encerrado");
    expect(formatSlaBadge(medium("closed"), mediumDueAt - DAY)).toBe("encerrado");
  });
});

describe("chamados do seed ao longo de uma semana (§4.2, decisão 3)", () => {
  // "Agora" a cada 15 minutos, de segunda 0h até domingo 23h45 em São Paulo.
  const weekStart = saoPaulo(10, MONDAY, 0);
  const instants = Array.from({ length: (7 * DAY) / (15 * MINUTE) }, (_, i) => {
    return weekStart + i * 15 * MINUTE;
  });

  it("INC-20311 (Média, há 6 dias, Aguardando analista) está sempre vencido", () => {
    for (const now of instants) {
      expect(isOverdue(ticket("MEDIUM", "awaiting_analyst", now - 6 * DAY), now)).toBe(true);
    }
  });

  it("INC-20402, REQ-10442, INC-20395, REQ-10498 e INC-20420 nunca aparecem vencidos", () => {
    for (const now of instants) {
      const seedTickets = [
        ticket("HIGH", "in_progress", now - HOUR), // INC-20402
        ticket("LOW", "approved", now - 3 * DAY), // REQ-10442
        ticket("MEDIUM", "open", now - 2 * DAY), // INC-20395
        ticket("LOW", "open", now - DAY), // REQ-10498
        ticket("CRITICAL", "in_progress", now - 30 * MINUTE), // INC-20420
      ];
      for (const seedTicket of seedTickets) {
        expect(isOverdue(seedTicket, now)).toBe(false);
      }
    }
  });

  it("REQ-10510 (Aguardando você) mostra prazo pausado", () => {
    const now = saoPaulo(10, WEDNESDAY, 10);
    expect(formatSlaBadge(ticket("LOW", "awaiting_employee", now - 2 * DAY), now)).toBe(
      "prazo pausado",
    );
  });
});
