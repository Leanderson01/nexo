import { v } from "convex/values";

import type { TurnUsage } from "../src/domain/decision-record";
import { localDay, startOfLocalDay } from "../src/domain/local-day";
import { err, ok, type Result } from "../src/domain/result";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireAgentServer } from "./lib/guards";

// Uso diário e limites contra abuso e custo do deploy público (§12.3). Uma linha da tabela
// `usage` por dia de São Paulo soma o que o agent e a transcrição gastaram. Os limites são
// lidos do env do Convex (com padrão), para mudar em produção sem novo deploy.
//
//   - teto de custo do LLM: atingido, o agent para de responder até a meia-noite;
//   - conversas novas por funcionário por dia;
//   - transcrição: quantidade e segundos por dia (global).
//
// A rota de transcrição (T15) chama, com o AGENT_SERVER_SECRET:
//   1. antes do Whisper: `api.usage.checkTranscription({ secret })`
//        → `{ ok: false, error: "transcription_limit_reached" }`: responde 429 e não transcreve;
//   2. depois do Whisper: `api.usage.recordTranscription({ secret, seconds })`, com a duração
//      do áudio em segundos.

const DEFAULT_MAX_DAILY_LLM_COST_USD = 5;
const DEFAULT_MAX_CONVERSATIONS_PER_DAY = 10;
/** 1 hora de áudio por dia: ~US$ 0,04 no Whisper do Groq (docs/decisoes/llm.md). */
const DEFAULT_MAX_DAILY_TRANSCRIPTION_SECONDS = 3_600;
const DEFAULT_MAX_DAILY_TRANSCRIPTIONS = 200;

// ---------- Limites (env do Convex) ----------

/** Número do env; ausente, vazio ou inválido usa o padrão. Zero vale: desliga o recurso. */
function readLimit(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function readDailyCostLimitUsd(): number {
  return readLimit("MAX_DAILY_LLM_COST_USD", DEFAULT_MAX_DAILY_LLM_COST_USD);
}

export function readConversationsPerDayLimit(): number {
  return readLimit("MAX_CONVERSATIONS_PER_DAY", DEFAULT_MAX_CONVERSATIONS_PER_DAY);
}

function readTranscriptionLimits() {
  return {
    seconds: readLimit("MAX_DAILY_TRANSCRIPTION_SECONDS", DEFAULT_MAX_DAILY_TRANSCRIPTION_SECONDS),
    count: readLimit("MAX_DAILY_TRANSCRIPTIONS", DEFAULT_MAX_DAILY_TRANSCRIPTIONS),
  };
}

// ---------- Uso do dia ----------

type UsageCounters = Omit<Doc<"usage">, "_id" | "_creationTime" | "day">;

const ZERO_USAGE: UsageCounters = {
  inputTokens: 0,
  outputTokens: 0,
  estimatedCostUsd: 0,
  transcriptionSeconds: 0,
  transcriptionCount: 0,
};

async function findUsageOfDay(ctx: QueryCtx, day: string): Promise<Doc<"usage"> | null> {
  return await ctx.db
    .query("usage")
    .withIndex("by_day", (q) => q.eq("day", day))
    .unique();
}

/** O uso do dia daquele instante; zerado se ainda não houve nada. */
async function usageAt(ctx: QueryCtx, now: number): Promise<UsageCounters> {
  return (await findUsageOfDay(ctx, localDay(now))) ?? ZERO_USAGE;
}

/** Soma ao contador do dia, criando a linha do dia na primeira vez. */
async function addToUsage(ctx: MutationCtx, now: number, delta: Partial<UsageCounters>) {
  const day = localDay(now);
  const current = await findUsageOfDay(ctx, day);
  const base = current ?? ZERO_USAGE;
  const next: UsageCounters = {
    inputTokens: base.inputTokens + (delta.inputTokens ?? 0),
    outputTokens: base.outputTokens + (delta.outputTokens ?? 0),
    estimatedCostUsd: base.estimatedCostUsd + (delta.estimatedCostUsd ?? 0),
    transcriptionSeconds: base.transcriptionSeconds + (delta.transcriptionSeconds ?? 0),
    transcriptionCount: base.transcriptionCount + (delta.transcriptionCount ?? 0),
  };
  if (current) await ctx.db.patch(current._id, next);
  else await ctx.db.insert("usage", { day, ...next });
}

// ---------- LLM ----------

/** Soma os tokens e o custo de um turno do agent (chamado ao gravar o DecisionRecord). */
export async function recordTurnUsage(ctx: MutationCtx, usage: TurnUsage, now: number) {
  await addToUsage(ctx, now, {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    estimatedCostUsd: usage.estimatedCostUsd,
  });
}

/**
 * O teto diário de custo foi atingido? Então o agent não começa turno novo (mensagem e
 * "Tentar de novo"). O turno que já começou termina: o teto pode passar um pouco.
 */
export async function isDailyCostLimitReached(ctx: QueryCtx, now: number): Promise<boolean> {
  const usage = await usageAt(ctx, now);
  return usage.estimatedCostUsd >= readDailyCostLimitUsd();
}

// ---------- Conversas por funcionário ----------

/**
 * As conversas que o funcionário criou hoje. Usa o índice por `lastMessageAt`: quem foi
 * criada hoje teve atividade hoje, então o intervalo do índice já contém todas, e a data de
 * criação separa as que só foram retomadas hoje.
 */
export async function findConversationsCreatedToday(
  ctx: QueryCtx,
  employeeId: Id<"people">,
  now: number,
): Promise<Doc<"conversations">[]> {
  const startOfToday = startOfLocalDay(now);
  const activeToday = await ctx.db
    .query("conversations")
    .withIndex("by_employee_lastMessage", (q) =>
      q.eq("employeeId", employeeId).gte("lastMessageAt", startOfToday),
    )
    .collect();
  return activeToday.filter((conversation) => conversation._creationTime >= startOfToday);
}

/**
 * Conversas criadas hoje que contam para `MAX_CONVERSATIONS_PER_DAY`: só as que têm ao menos
 * uma mensagem do funcionário. Clicar em "Nova conversa" sem escrever nada não gasta o limite
 * (e o `create` reaproveita a conversa vazia, então elas não se acumulam).
 */
export function countStartedConversations(conversations: Doc<"conversations">[]): number {
  return conversations.filter((conversation) => conversation.employeeMessageCount > 0).length;
}

// ---------- Transcrição (rota /api/transcribe, com o segredo do servidor) ----------

export type TranscriptionLimitError = "transcription_limit_reached";

/** Ainda cabe uma transcrição hoje? Chamar antes de mandar o áudio para o Whisper. */
export const checkTranscription = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }): Promise<Result<null, TranscriptionLimitError>> => {
    requireAgentServer(secret);
    const usage = await usageAt(ctx, Date.now());
    const limits = readTranscriptionLimits();
    const withinLimits =
      usage.transcriptionCount < limits.count && usage.transcriptionSeconds < limits.seconds;
    return withinLimits ? ok(null) : err("transcription_limit_reached");
  },
});

/** Registra uma transcrição feita: soma uma à quantidade e a duração do áudio aos segundos. */
export const recordTranscription = mutation({
  args: { secret: v.string(), seconds: v.number() },
  handler: async (ctx, { secret, seconds }) => {
    requireAgentServer(secret);
    await addToUsage(ctx, Date.now(), {
      transcriptionSeconds: Math.max(0, seconds),
      transcriptionCount: 1,
    });
  },
});
