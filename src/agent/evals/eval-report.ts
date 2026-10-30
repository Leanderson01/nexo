import { addUsage, NO_USAGE, type UsageSummary } from "./observation";
import type { Scenario } from "./scenario";

// Puro: monta a tabela do terminal e o Markdown do resultado a partir das execuções.

/** Uma execução de um cenário (com `--repeat 3`, cada cenário tem três). */
export interface ScenarioRun {
  scenario: Pick<Scenario, "id" | "title" | "source">;
  /** Falhas de `checkScenario`, passos que não puderam ser executados e erros do runner. */
  failures: string[];
  /** A conversa em texto (ver transcript.ts), mostrada quando o cenário falha. */
  transcript: string[];
  usage: UsageSummary;
  durationMs: number;
}

/** As execuções de um cenário somadas: uma linha da tabela. */
export interface ScenarioRow {
  id: string;
  title: string;
  source: Scenario["source"];
  runs: number;
  passed: number;
  usage: UsageSummary;
  /** Falhas de cada execução que falhou, na ordem das execuções. */
  failuresByRun: { run: number; failures: string[]; transcript: string[] }[];
}

export interface RunSummary {
  runs: number;
  passedRuns: number;
  scenarios: number;
  /** Cenários que passaram em todas as execuções. */
  stableScenarios: number;
  usage: UsageSummary;
  durationMs: number;
}

export interface ReportMeta {
  date: Date;
  fastModel: string;
  mainModel: string;
  repeat: number;
}

export function isPassing(run: ScenarioRun): boolean {
  return run.failures.length === 0;
}

export function groupByScenario(runs: ScenarioRun[]): ScenarioRow[] {
  const rows = new Map<string, ScenarioRow>();
  for (const run of runs) {
    const row = rows.get(run.scenario.id) ?? {
      ...run.scenario,
      runs: 0,
      passed: 0,
      usage: NO_USAGE,
      failuresByRun: [],
    };
    row.runs += 1;
    if (isPassing(run)) row.passed += 1;
    else {
      row.failuresByRun.push({ run: row.runs, failures: run.failures, transcript: run.transcript });
    }
    row.usage = addUsage(row.usage, run.usage);
    rows.set(run.scenario.id, row);
  }
  return [...rows.values()];
}

export function summarize(runs: ScenarioRun[], durationMs: number): RunSummary {
  const rows = groupByScenario(runs);
  return {
    runs: runs.length,
    passedRuns: runs.filter(isPassing).length,
    scenarios: rows.length,
    stableScenarios: rows.filter((row) => row.passed === row.runs).length,
    usage: runs.reduce((total, run) => addUsage(total, run.usage), NO_USAGE),
    durationMs,
  };
}

// ---------- Formatos ----------

export function formatUsd(value: number): string {
  return `US$ ${value.toFixed(4)}`;
}

export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;
}

function resultLabel(row: ScenarioRow): string {
  if (row.runs === 1) return row.passed === 1 ? "passou" : "FALHOU";
  return `${row.passed}/${row.runs}`;
}

// ---------- Terminal ----------

export function formatTerminalTable(runs: ScenarioRun[]): string {
  const rows = groupByScenario(runs);
  const header = ["Cenário", "Resultado", "Turnos", "Custo"];
  const body = rows.map((row) => [
    row.id,
    resultLabel(row),
    String(row.usage.turns),
    formatUsd(row.usage.costUsd),
  ]);
  const widths = header.map((title, column) =>
    Math.max(title.length, ...body.map((cells) => cells[column].length)),
  );
  const line = (cells: string[]) =>
    cells
      .map((cell, column) => cell.padEnd(widths[column]))
      .join("  ")
      .trimEnd();

  const lines = [line(header), widths.map((width) => "-".repeat(width)).join("  ")];
  rows.forEach((row, index) => {
    lines.push(line(body[index]));
    for (const { run, failures, transcript } of row.failuresByRun) {
      if (row.runs > 1) lines.push(`    execução ${run}:`);
      for (const failure of failures) lines.push(`    - ${failure}`);
      for (const line of transcript) lines.push(`      | ${line}`);
    }
  });
  return lines.join("\n");
}

export function formatTerminalSummary(summary: RunSummary): string {
  const scenarios =
    summary.runs === summary.scenarios
      ? `Aprovados: ${summary.passedRuns}/${summary.runs}`
      : `Aprovados: ${summary.passedRuns}/${summary.runs} execuções; ${summary.stableScenarios}/${summary.scenarios} cenários passaram em todas`;
  return [
    scenarios,
    `Custo total: ${formatUsd(summary.usage.costUsd)} (${summary.usage.turns} turnos do agent, ${summary.usage.inputTokens} tokens de entrada, ${summary.usage.outputTokens} de saída)`,
    `Tempo: ${formatDuration(summary.durationMs)}`,
  ].join("\n");
}

// ---------- Markdown ----------

export function formatMarkdown(runs: ScenarioRun[], summary: RunSummary, meta: ReportMeta): string {
  const rows = groupByScenario(runs);
  const date = meta.date.toISOString().slice(0, 10);
  const lines = [
    "# Resultado dos evals do agent",
    "",
    `Rodado em ${date} com \`npm run evals${meta.repeat > 1 ? ` -- --repeat ${meta.repeat}` : ""}\`, contra o agent real:` +
      ` ENTENDER com \`${meta.fastModel}\` e AGIR com \`${meta.mainModel}\` (Groq).` +
      " Cada cenário começa do seed, numa conversa nova, e passa pelo mesmo turno do produto.",
    "",
    `- **Aprovados:** ${summary.passedRuns}/${summary.runs}${summary.runs === summary.scenarios ? "" : ` execuções (${summary.stableScenarios}/${summary.scenarios} cenários passaram em todas)`}`,
    `- **Custo total:** ${formatUsd(summary.usage.costUsd)} em ${summary.usage.turns} turnos do agent (${summary.usage.inputTokens} tokens de entrada, ${summary.usage.outputTokens} de saída)`,
    `- **Tempo:** ${formatDuration(summary.durationMs)}`,
    "",
    "| Cenário | Origem | Resultado | Turnos | Custo |",
    "| ------- | ------ | --------- | -----: | ----: |",
    ...rows.map(
      (row) =>
        `| ${escapeCell(row.title)} (\`${row.id}\`) | ${row.source === "spec" ? "§13.2" : "extra"} | ${resultLabel(row)} | ${row.usage.turns} | ${formatUsd(row.usage.costUsd)} |`,
    ),
  ];

  const failing = rows.filter((row) => row.failuresByRun.length > 0);
  if (failing.length > 0) {
    lines.push("", "## Falhas", "");
    for (const row of failing) {
      for (const { run, failures, transcript } of row.failuresByRun) {
        lines.push(`**\`${row.id}\`**${row.runs > 1 ? ` (execução ${run})` : ""}`, "");
        for (const failure of failures) lines.push(`- ${escapeCell(failure)}`);
        if (transcript.length > 0) {
          lines.push(
            "",
            "<details><summary>Conversa</summary>",
            "",
            "```text",
            ...transcript,
            "```",
            "",
            "</details>",
          );
        }
        lines.push("");
      }
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

/** `|` quebraria a tabela do Markdown. */
function escapeCell(text: string): string {
  return text.replaceAll("|", "\\|");
}
