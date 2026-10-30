import { describe, expect, it } from "vitest";

import {
  formatDuration,
  formatMarkdown,
  formatTerminalSummary,
  formatTerminalTable,
  groupByScenario,
  summarize,
  type ScenarioRun,
} from "../eval-report";

function run(id: string, failures: string[] = [], costUsd = 0.001): ScenarioRun {
  return {
    scenario: { id, title: `Título de ${id}`, source: "spec" },
    failures,
    transcript: failures.length > 0 ? ["Funcionário: oi", "Assistente: olá"] : [],
    usage: { turns: 1, inputTokens: 1000, outputTokens: 100, costUsd },
    durationMs: 2000,
  };
}

const META = {
  date: new Date("2026-10-30T12:00:00Z"),
  fastModel: "openai/gpt-oss-20b",
  mainModel: "openai/gpt-oss-120b",
  repeat: 1,
};

describe("groupByScenario e summarize", () => {
  it("soma as execuções de cada cenário e guarda as falhas de cada uma", () => {
    const runs = [run("a"), run("b", ["x"]), run("a", ["y"]), run("b", ["z"])];

    const rows = groupByScenario(runs);

    expect(rows.map((row) => [row.id, row.passed, row.runs])).toEqual([
      ["a", 1, 2],
      ["b", 0, 2],
    ]);
    expect(rows[0].failuresByRun.map((failed) => failed.run)).toEqual([2]);
    expect(rows[0].usage.costUsd).toBeCloseTo(0.002, 10);
  });

  it("o resumo conta execuções aprovadas e cenários estáveis", () => {
    const summary = summarize([run("a"), run("a"), run("b"), run("b", ["x"])], 5000);

    expect(summary).toMatchObject({ runs: 4, passedRuns: 3, scenarios: 2, stableScenarios: 1 });
    expect(summary.usage.turns).toBe(4);
  });
});

describe("tabela do terminal", () => {
  it("alinha as colunas e lista as falhas e a conversa abaixo do cenário", () => {
    const table = formatTerminalTable([run("curto"), run("cenario-longo", ["deu errado"])]);
    const lines = table.split("\n");

    expect(lines[0]).toBe("Cenário        Resultado  Turnos  Custo");
    expect(lines[2]).toBe("curto          passou     1       US$ 0.0010");
    expect(lines[3]).toBe("cenario-longo  FALHOU     1       US$ 0.0010");
    expect(lines[4]).toBe("    - deu errado");
    expect(lines[5]).toBe("      | Funcionário: oi");
  });

  it("com repetição, mostra quantas execuções passaram", () => {
    const table = formatTerminalTable([run("a"), run("a", ["x"]), run("a")]);

    expect(table).toContain("2/3");
    expect(table).toContain("execução 2:");
  });

  it("resumo com aprovados, custo e tempo", () => {
    const text = formatTerminalSummary(summarize([run("a"), run("b", ["x"])], 75_000));

    expect(text).toContain("Aprovados: 1/2");
    expect(text).toContain("Custo total: US$ 0.0020 (2 turnos do agent");
    expect(text).toContain("Tempo: 1 min 15 s");
  });
});

describe("Markdown", () => {
  it("traz data, modelos, tabela e as falhas com a conversa", () => {
    const runs = [run("a"), run("b", ["regex | não casou"])];
    const markdown = formatMarkdown(runs, summarize(runs, 3000), META);

    expect(markdown).toContain("Rodado em 2026-10-30");
    expect(markdown).toContain("`openai/gpt-oss-120b`");
    expect(markdown).toContain("| Título de a (`a`) | §13.2 | passou | 1 | US$ 0.0010 |");
    expect(markdown).toContain("- regex \\| não casou");
    expect(markdown).toContain("<details><summary>Conversa</summary>");
  });

  it("sem falhas, não tem a seção de falhas", () => {
    const markdown = formatMarkdown([run("a")], summarize([run("a")], 1000), META);

    expect(markdown).not.toContain("## Falhas");
    expect(markdown.endsWith("\n")).toBe(true);
  });
});

describe("formatDuration", () => {
  it("segundos e minutos", () => {
    expect(formatDuration(4_400)).toBe("4 s");
    expect(formatDuration(69_000)).toBe("1 min 09 s");
  });
});
