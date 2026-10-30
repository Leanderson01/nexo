import { describe, expect, test } from "vitest";

import { criticalDraftDecision, overdueTicketDecision } from "../fixtures";
import {
  describeEntities,
  describePrioritySignals,
  formatAttempts,
  formatConfidenceValue,
  formatCostUsd,
  formatDateTime,
  formatLatency,
  formatPriorityDeadline,
  formatTokens,
  formatTurnNotes,
} from "../format";

describe("formatTurnNotes", () => {
  test("turno normal não tem nota", () => {
    expect(formatTurnNotes({})).toEqual([]);
  });

  test("curto-circuito avisa que o modelo principal não foi chamado", () => {
    expect(formatTurnNotes({ shortCircuit: true })).toEqual([
      "Uma regra decidiu sozinha: o modelo principal não foi chamado neste turno.",
    ]);
  });

  test("turno com erro diz em que etapa parou", () => {
    expect(formatTurnNotes({ errorStage: "act" })).toEqual(["O turno parou ao agir."]);
  });
});

describe("formatAttempts", () => {
  test("de primeira, quando funcionou na 1ª tentativa", () => {
    expect(formatAttempts({ attempts: 1, status: "ok" })).toBe("funcionou de primeira");
  });

  test("diz em qual das 3 tentativas funcionou", () => {
    expect(formatAttempts({ attempts: 2, status: "ok" })).toBe("tentativa 2 de 3 funcionou");
    expect(formatAttempts({ attempts: 3, status: "ok" })).toBe("tentativa 3 de 3 funcionou");
  });

  test("conta as tentativas que falharam", () => {
    expect(formatAttempts({ attempts: 1, status: "error" })).toBe("falhou na primeira tentativa");
    expect(formatAttempts({ attempts: 3, status: "error" })).toBe("falhou nas 3 tentativas");
  });
});

describe("números", () => {
  test("latência em ms abaixo de 1 s e em segundos com vírgula acima", () => {
    expect(formatLatency(3)).toBe("3 ms");
    expect(formatLatency(412.4)).toBe("412 ms");
    expect(formatLatency(1000)).toBe("1,0 s");
    expect(formatLatency(1260)).toBe("1,3 s");
    expect(formatLatency(15200)).toBe("15,2 s");
  });

  test("tokens com separador de milhar e singular", () => {
    expect(formatTokens(0)).toBe("0 tokens");
    expect(formatTokens(1)).toBe("1 token");
    expect(formatTokens(3420)).toBe("3.420 tokens");
  });

  test("custo em dólares com 4 casas, 5 para valores muito pequenos", () => {
    expect(formatCostUsd(0)).toBe("US$ 0,00");
    expect(formatCostUsd(0.00057)).toBe("US$ 0,0006");
    expect(formatCostUsd(0.0012)).toBe("US$ 0,0012");
    expect(formatCostUsd(0.00004)).toBe("US$ 0,00004");
  });

  test("confiança com duas casas", () => {
    expect(formatConfidenceValue(0.9)).toBe("0,90");
    expect(formatConfidenceValue(0.875)).toBe("0,88");
  });
});

describe("datas no fuso de São Paulo", () => {
  test("dia, mês e hora de 24h, independente do fuso da máquina", () => {
    // 29/10/2026 17:20 UTC = 14:20 em São Paulo.
    expect(formatDateTime(Date.UTC(2026, 9, 29, 17, 20))).toBe("29/10 às 14:20");
    // 03:05 UTC é 00:05 em São Paulo (UTC−3): o dia segue o fuso do service desk.
    expect(formatDateTime(Date.UTC(2026, 9, 30, 3, 5))).toBe("30/10 às 00:05");
  });

  test("prazo da prioridade com o rótulo da §3.6 e a hora final", () => {
    expect(formatPriorityDeadline("CRITICAL", Date.UTC(2026, 9, 29, 18, 23))).toBe(
      "1 hora corrida, até 29/10 às 15:23",
    );
    expect(formatPriorityDeadline("MEDIUM", Date.UTC(2026, 10, 3, 14, 0))).toBe(
      "3 dias úteis, até 03/11 às 11:00",
    );
  });
});

describe("entidades e sinais", () => {
  test("mostra só as entidades preenchidas, com rótulos em português", () => {
    const understanding = overdueTicketDecision.understanding;
    if (!understanding) throw new Error("fixture sem entendimento");
    expect(describeEntities(understanding)).toEqual([
      { label: "Dispositivo", value: "Notebook" },
      { label: "Chamado citado", value: "o do notebook" },
      { label: "Categoria", value: "Hardware" },
    ]);
  });

  test("inclui impacto e urgência quando vieram", () => {
    const understanding = criticalDraftDecision.understanding;
    if (!understanding) throw new Error("fixture sem entendimento");
    const rows = describeEntities({
      ...understanding,
      signals: { ...understanding.signals, deadlineToday: true },
    });
    expect(rows).toContainEqual({ label: "Impacto", value: "Sua equipe" });
    expect(rows).toContainEqual({ label: "Urgência", value: "Há um compromisso hoje" });
  });

  test("sinais da prioridade dizem 'não informado' quando o modelo não extraiu", () => {
    const understanding = criticalDraftDecision.understanding;
    if (!understanding) throw new Error("fixture sem entendimento");
    expect(describePrioritySignals(understanding.signals)).toEqual([
      { label: "Tipo", value: "Incidente" },
      { label: "Impacto", value: "Sua equipe" },
      { label: "Impedido de trabalhar", value: "sim" },
      { label: "Compromisso hoje", value: "não informado" },
    ]);
  });
});
