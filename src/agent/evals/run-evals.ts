import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { readLlmConfig } from "@/agent/llm/models";

import { parseEvalArgs, selectScenarios } from "./eval-args";
import { readEvalConfig } from "./eval-environment";
import {
  formatDuration,
  formatMarkdown,
  formatTerminalSummary,
  formatTerminalTable,
  formatUsd,
  isPassing,
  summarize,
  type ScenarioRun,
} from "./eval-report";
import { DEFAULT_RATE_LIMIT, rateLimitedFetch } from "./rate-limited-fetch";
import { runScenario } from "./run-scenario";
import { SCENARIOS } from "./scenarios";

// Runner dos evals do agent (T14b): roda os cenários de scenarios.ts contra o modelo real,
// imprime a tabela de aprovação com o custo e grava o resultado em Markdown.
//
//   npm run evals                          todos os cenários, uma vez
//   npm run evals -- --only prompt-injection --only holerite-fora-de-escopo
//   npm run evals -- --repeat 3            estabilidade: cada cenário três vezes
//   npm run evals -- --no-out              sem gravar docs/evals/resultado.md
//
// Precisa do Convex de desenvolvimento rodando (`npx convex dev`), do seed e do .env.local
// com as chaves do Groq, AGENT_SERVER_SECRET, TICKETING_SERVICE_KEY e EVALS_SECRET (este
// também no Convex). Apaga as conversas do funcionário de cada cenário e os chamados que
// não são do seed: não rode contra um deployment com dados que importam.

const TURN_TIMEOUT_MS = 90_000;

async function main(): Promise<number> {
  process.loadEnvFile(".env.local");
  const parsed = parseEvalArgs(process.argv.slice(2));
  if (!parsed.ok) return usageError(parsed.error);
  const selected = selectScenarios(SCENARIOS, parsed.value.only);
  if (!selected.ok) return usageError(selected.error);
  const { repeat, outFile } = parsed.value;
  const scenarios = selected.value;

  const config = readEvalConfig(process.env);
  const llm = readLlmConfig(process.env);
  const llmFetch = rateLimitedFetch(fetch, {
    ...DEFAULT_RATE_LIMIT,
    onWait: (waitMs) => console.log(`    429 do provedor: esperando ${Math.ceil(waitMs / 1000)} s`),
  });

  console.log(
    `Evals: ${scenarios.length} cenário(s) × ${repeat}, ENTENDER ${llm.fastModel}, AGIR ${llm.mainModel}\n`,
  );
  const startedAt = Date.now();
  const runs: ScenarioRun[] = [];
  const total = scenarios.length * repeat;
  for (let round = 1; round <= repeat; round++) {
    for (const scenario of scenarios) {
      const run = await runScenario(scenario, { config, llmFetch, turnTimeoutMs: TURN_TIMEOUT_MS });
      runs.push(run);
      console.log(progressLine(runs.length, total, run));
    }
  }
  const summary = summarize(runs, Date.now() - startedAt);

  console.log(`\n${formatTerminalTable(runs)}\n\n${formatTerminalSummary(summary)}`);
  if (outFile) {
    const markdown = formatMarkdown(runs, summary, {
      date: new Date(),
      fastModel: llm.fastModel,
      mainModel: llm.mainModel,
      repeat,
    });
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, markdown);
    console.log(`Resultado gravado em ${outFile}`);
  }
  return summary.passedRuns === summary.runs ? 0 : 1;
}

function progressLine(index: number, total: number, run: ScenarioRun): string {
  const result = isPassing(run) ? "passou" : `FALHOU (${run.failures.length} falha(s))`;
  return `[${index}/${total}] ${run.scenario.id}: ${result}, ${run.usage.turns} turno(s), ${formatUsd(run.usage.costUsd)}, ${formatDuration(run.durationMs)}`;
}

function usageError(message: string): number {
  console.error(
    `${message}\nUso: npm run evals -- [--only <id>]... [--repeat N] [--out arquivo | --no-out]`,
  );
  return 2;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error("[evals] o runner falhou", error);
    process.exit(1);
  },
);
