// Spike da T6: mede os modelos candidatos do Groq no ENTENDER e no AGIR.
// Uso: npm run spike:llm   (lê GROQ_API_KEY do .env.local; não grava nada)
import { Agent } from "@mastra/core/agent";
import { classifyProviderError, providerErrorReason } from "@mastra/core/error";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { estimateCostUsd, readLlmConfig } from "../src/agent/llm/models";
import { createLlmModels, type LlmModels } from "../src/agent/llm/provider";
import { understandingSchema } from "../src/agent/pipeline/understanding-schema";
import {
  ACT_CASES,
  ACT_INSTRUCTIONS,
  UNDERSTAND_CASES,
  UNDERSTAND_INSTRUCTIONS,
} from "./spike-llm-cases";

const CANDIDATES = ["openai/gpt-oss-20b", "openai/gpt-oss-120b"];
const MAX_RATE_LIMIT_WAITS = 6;
const FALLBACK_WAIT_MS = 10_000;

interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
}

// ---------- limite de taxa ----------

const rateLimitHeaders = new Map<string, string>();

// Guarda os headers x-ratelimit-* da última resposta para mostrar o limite real da chave.
const recordingFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  response.headers.forEach((value, name) => {
    if (name.startsWith("x-ratelimit-")) rateLimitHeaders.set(name, value);
  });
  return response;
};

function retryAfterMs(error: unknown): number {
  const headers = (error as { responseHeaders?: Record<string, string> } | undefined)
    ?.responseHeaders;
  const seconds = Number(headers?.["retry-after"]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 + 250 : FALLBACK_WAIT_MS;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class RateLimited extends Error {
  constructor(readonly waitMs: number) {
    super("rate limited");
  }
}

// Repete no 429 respeitando o retry-after. Qualquer outro erro sobe.
async function withRateLimitRetry<T>(label: string, run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      const limited =
        error instanceof RateLimited || classifyProviderError(error) === "rate_limited";
      if (!limited || attempt >= MAX_RATE_LIMIT_WAITS) throw error;
      const waitMs = error instanceof RateLimited ? error.waitMs : retryAfterMs(error);
      console.log(`  429 em ${label}; esperando ${(waitMs / 1000).toFixed(1)} s`);
      await wait(waitMs);
    }
  }
}

// ---------- ENTENDER ----------

interface UnderstandRow {
  model: string;
  message: string;
  validJson: boolean;
  intent: string;
  hit: boolean;
  confidence: number | null;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  error?: string;
}

function createAgent(id: string, instructions: string, model: LlmModels["main"], tools = {}) {
  // Sem os processadores de erro padrão: quem repete no 429 é o withRateLimitRetry.
  return new Agent({ id, name: id, instructions, model, tools, errorProcessorDefaults: false });
}

function tokensOf(usage: Usage) {
  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    cachedInputTokens: usage.cachedInputTokens ?? 0,
  };
}

function costOf(model: string, usage: Usage): number {
  const tokens = tokensOf(usage);
  return estimateCostUsd(model, tokens.inputTokens, tokens.outputTokens, tokens.cachedInputTokens);
}

async function understandOnce(
  agent: Agent,
  model: string,
  message: string,
  strict: boolean,
): Promise<Omit<UnderstandRow, "hit">> {
  const started = performance.now();
  try {
    const out = await withRateLimitRetry(`ENTENDER ${model}`, () =>
      agent.generate(message, {
        structuredOutput: { schema: understandingSchema },
        providerOptions: { groq: { strictJsonSchema: strict, reasoningEffort: "low" } },
        modelSettings: { maxRetries: 0, temperature: 0 },
      }),
    );
    return {
      model,
      message,
      validJson: true,
      intent: out.object.intent,
      confidence: out.object.confidence,
      latencyMs: performance.now() - started,
      ...tokensOf(out.totalUsage),
      costUsd: costOf(model, out.totalUsage),
    };
  } catch (error) {
    return {
      model,
      message,
      validJson: false,
      intent: "-",
      confidence: null,
      latencyMs: performance.now() - started,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      error: `${classifyProviderError(error)}: ${providerErrorReason(error) ?? String(error)}`,
    };
  }
}

async function runUnderstand(apiKey: string, model: string): Promise<UnderstandRow[]> {
  const models = createLlmModels(configFor(apiKey, model, model), recordingFetch);
  const agent = createAgent("spike-understand", UNDERSTAND_INSTRUCTIONS, models.fast);
  let strict = true;
  const rows: UnderstandRow[] = [];
  for (const testCase of UNDERSTAND_CASES) {
    let row = await understandOnce(agent, model, testCase.message, strict);
    // Decisão 18: se o modo estrito for recusado (ex.: minimum/maximum), registra e segue sem ele.
    if (strict && row.error && /invalid_request|model_rejected/.test(row.error)) {
      console.log(`  ${model}: modo estrito recusado -> ${row.error}`);
      console.log("  seguindo com strictJsonSchema: false (o Zod valida a resposta)");
      strict = false;
      row = await understandOnce(agent, model, testCase.message, strict);
    }
    if (row.error?.startsWith("auth")) throw new Error(`Chave recusada pelo Groq (${row.error}).`);
    rows.push({ ...row, hit: testCase.accepted.some((intent) => intent === row.intent) });
  }
  console.log(`  ${model}: modo estrito ${strict ? "aceito" : "RECUSADO"}`);
  return rows;
}

// ---------- AGIR ----------

interface ActRow {
  model: string;
  message: string;
  tools: string;
  hit: boolean;
  firstTokenMs: number | null;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  reply: string;
  error?: string;
}

function createFakeTools(calls: string[]) {
  return {
    searchKnowledgeBase: createTool({
      id: "searchKnowledgeBase",
      description: "Busca artigos da central de ajuda e devolve trechos e condições.",
      inputSchema: z.object({ query: z.string() }),
      execute: async () => {
        calls.push("searchKnowledgeBase");
        return {
          articles: [
            {
              title: "VPN: erro 809",
              excerpt: "No Windows 10, reinstale o cliente da VPN.",
              conditions: "Só vale para Windows 10. No Windows 11, abrir chamado.",
            },
          ],
        };
      },
    }),
    listMyTickets: createTool({
      id: "listMyTickets",
      description: "Lista os chamados do funcionário logado, com o selo de prazo.",
      inputSchema: z.object({ status: z.enum(["open", "resolved", "all"]).nullable() }),
      execute: async () => {
        calls.push("listMyTickets");
        return {
          tickets: [
            {
              code: "INC-20311",
              title: "Notebook não liga",
              status: "Em andamento",
              sla: "vencido: prioridade Média, prazo de 3 dias úteis, última atualização há 6 dias",
            },
          ],
        };
      },
    }),
    proposeTicketDraft: createTool({
      id: "proposeTicketDraft",
      description: "Propõe um rascunho de chamado para o funcionário confirmar.",
      inputSchema: z.object({
        title: z.string(),
        description: z.string(),
        category: z.enum(["access", "network_vpn", "hardware", "software", "email", "other"]),
        impact: z.enum(["individual", "team", "company"]),
        blocked: z.boolean(),
      }),
      execute: async () => {
        calls.push("proposeTicketDraft");
        return { draftId: "D-1", priority: "Baixa", dueIn: "5 dias úteis" };
      },
    }),
  };
}

async function actOnce(apiKey: string, model: string, message: string, expectedTool: string) {
  const calls: string[] = [];
  const models = createLlmModels(configFor(apiKey, model, model), recordingFetch);
  const agent = createAgent("spike-act", ACT_INSTRUCTIONS, models.main, createFakeTools(calls));
  const started = performance.now();
  return withRateLimitRetry(`AGIR ${model}`, async (): Promise<ActRow> => {
    calls.length = 0;
    const out = await agent.stream(message, {
      maxSteps: 4,
      providerOptions: { groq: { reasoningEffort: "low" } },
      modelSettings: { maxRetries: 0, timeout: { firstChunkMs: 15_000, totalMs: 60_000 } },
    });
    let firstTokenMs: number | null = null;
    let reply = "";
    for await (const piece of out.textStream) {
      firstTokenMs ??= performance.now() - started;
      reply += piece;
    }
    if (out.error) {
      if (classifyProviderError(out.error) === "rate_limited") {
        throw new RateLimited(retryAfterMs(out.error));
      }
      throw out.error;
    }
    const usage = await out.totalUsage;
    return {
      model,
      message,
      tools: calls.join(", ") || "(nenhuma)",
      hit: calls.includes(expectedTool),
      firstTokenMs,
      latencyMs: performance.now() - started,
      ...tokensOf(usage),
      costUsd: costOf(model, usage),
      reply: reply.replace(/\s+/g, " ").slice(0, 70),
    };
  }).catch((error: unknown): ActRow => ({
    model,
    message,
    tools: calls.join(", ") || "(nenhuma)",
    hit: false,
    firstTokenMs: null,
    latencyMs: performance.now() - started,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    reply: "",
    error: `${classifyProviderError(error)}: ${providerErrorReason(error) ?? String(error)}`,
  }));
}

// ---------- saída ----------

function configFor(apiKey: string, fast: string, main: string) {
  return readLlmConfig({
    LLM_PROVIDER: "groq",
    GROQ_API_KEY: apiKey,
    LLM_MODEL_FAST: fast,
    LLM_MODEL_MAIN: main,
  });
}

function printTable(rows: Record<string, string | number>[]): void {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  const widths = columns.map((column) =>
    Math.max(column.length, ...rows.map((row) => String(row[column]).length)),
  );
  const line = (cells: string[]) => cells.map((cell, i) => cell.padEnd(widths[i])).join(" | ");
  console.log(line(columns));
  console.log(widths.map((width) => "-".repeat(width)).join("-|-"));
  for (const row of rows) console.log(line(columns.map((column) => String(row[column]))));
  console.log();
}

const ms = (value: number | null) => (value === null ? "-" : `${Math.round(value)}`);
const usd = (value: number) => value.toFixed(6);
const pct = (part: number, total: number) => `${Math.round((part / total) * 100)}%`;
const average = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)];
};

function summarize(understand: UnderstandRow[], act: ActRow[]) {
  return CANDIDATES.map((model) => {
    const u = understand.filter((row) => row.model === model);
    const a = act.filter((row) => row.model === model);
    const okU = u.filter((row) => row.validJson);
    const okA = a.filter((row) => !row.error);
    return {
      modelo: model,
      "json ok": pct(okU.length, u.length),
      "intenção ok": pct(u.filter((row) => row.hit).length, u.length),
      "entender p50 ms": ms(median(okU.map((row) => row.latencyMs))),
      "entender US$ médio": usd(average(okU.map((row) => row.costUsd))),
      "tool certa": pct(a.filter((row) => row.hit).length, a.length),
      "agir 1º token ms": ms(
        median(okA.flatMap((row) => (row.firstTokenMs === null ? [] : [row.firstTokenMs]))),
      ),
      "agir p50 ms": ms(median(okA.map((row) => row.latencyMs))),
      "agir US$ médio": usd(average(okA.map((row) => row.costUsd))),
    };
  });
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Sem .env.local: vale o que estiver no ambiente.
  }
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    console.error("GROQ_API_KEY ausente no .env.local; nada a medir.");
    process.exitCode = 1;
    return;
  }

  const understand: UnderstandRow[] = [];
  const act: ActRow[] = [];
  for (const model of CANDIDATES) {
    console.log(`ENTENDER com ${model}...`);
    understand.push(...(await runUnderstand(apiKey, model)));
    console.log(`AGIR com ${model}...`);
    for (const testCase of ACT_CASES) {
      act.push(await actOnce(apiKey, model, testCase.message, testCase.expectedTool));
    }
  }

  console.log("\n## ENTENDER\n");
  printTable(
    understand.map((row) => ({
      modelo: row.model,
      mensagem: row.message.slice(0, 40),
      json: row.validJson ? "ok" : "falhou",
      intenção: row.intent,
      acerto: row.hit ? "sim" : "não",
      confiança: row.confidence ?? "-",
      ms: ms(row.latencyMs),
      entrada: row.inputTokens,
      saída: row.outputTokens,
      US$: usd(row.costUsd),
      erro: row.error?.slice(0, 80) ?? "",
    })),
  );

  console.log("## AGIR\n");
  printTable(
    act.map((row) => ({
      modelo: row.model,
      mensagem: row.message.slice(0, 40),
      tools: row.tools,
      acerto: row.hit ? "sim" : "não",
      "1º token ms": ms(row.firstTokenMs),
      ms: ms(row.latencyMs),
      entrada: row.inputTokens,
      saída: row.outputTokens,
      US$: usd(row.costUsd),
      resposta: row.error ? `ERRO ${row.error.slice(0, 60)}` : row.reply,
    })),
  );

  console.log("## Resumo por modelo\n");
  printTable(summarize(understand, act));

  console.log("## Limite de taxa (headers da última resposta)\n");
  for (const [name, value] of [...rateLimitHeaders].sort()) console.log(`${name}: ${value}`);
}

await main();
