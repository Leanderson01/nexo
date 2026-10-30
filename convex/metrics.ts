import {
  computeMetrics,
  confirmedArticle,
  periodStart,
  resolvedWithoutQueue,
  transferReasons,
  type DashboardMetrics,
  type MetricsConversation,
} from "../src/domain/metrics";
import type { MetricsPeriod } from "../src/domain/enums";
import type { Doc } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { requireAnalyst } from "./lib/guards";
import { vMetricsPeriod } from "./lib/validators";

// Painel de métricas do console (§7.6, T17). As regras ficam em src/domain/metrics.ts; aqui
// só se lê o banco: as conversas iniciadas no período e, de cada uma, os turnos (`decisions`),
// os rascunhos (`pendingActions`) e, quando precisa, as mensagens.
//
// Limite: as `MAX_CONVERSATIONS` conversas mais recentes do período. Cada uma custa algumas
// leituras por índice (dezenas de documentos), o que cabe com folga no limite de leitura de
// uma query do Convex no volume do projeto. Acima disso o painel avisa que o número é parcial
// (`truncated`); para volume real, o caminho é agregar por dia numa tabela, na hora do turno.

export const MAX_CONVERSATIONS = 300;

export interface MetricsDashboard {
  period: MetricsPeriod;
  since: number;
  until: number;
  /** Havia mais conversas no período do que o limite: os números cobrem só as mais recentes. */
  truncated: boolean;
  metrics: DashboardMetrics;
}

export const dashboard = query({
  args: { period: vMetricsPeriod },
  handler: async (ctx, { period }): Promise<MetricsDashboard> => {
    await requireAnalyst(ctx);
    const until = Date.now();
    const since = periodStart(period, until);

    const recent = await ctx.db
      .query("conversations")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", since))
      .order("desc")
      .take(MAX_CONVERSATIONS + 1);
    const conversations = recent.slice(0, MAX_CONVERSATIONS);

    const rows = await Promise.all(
      conversations.map((conversation) => toMetricsConversation(ctx, conversation)),
    );
    return {
      period,
      since,
      until,
      truncated: recent.length > MAX_CONVERSATIONS,
      metrics: computeMetrics(rows),
    };
  },
});

async function toMetricsConversation(
  ctx: QueryCtx,
  conversation: Doc<"conversations">,
): Promise<MetricsConversation> {
  const [decisions, drafts] = await Promise.all([
    ctx.db
      .query("decisions")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
      .collect(),
    ctx.db
      .query("pendingActions")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
      .collect(),
  ]);

  const row: MetricsConversation = {
    handoffReason: conversation.handoff?.reason ?? null,
    decisions: decisions.map((decision) => ({
      confidence: decision.confidence?.value ?? null,
      costUsd: decision.usage.estimatedCostUsd,
      latencyMs: decision.usage.latencyMs,
      shortCircuit: decision.shortCircuit ?? false,
      corrections: (decision.corrections ?? []).map((correction) => correction.rule),
    })),
    drafts: drafts.map((draft) => ({ kind: draft.action.kind, status: draft.status })),
    articleConfirmed: false,
  };

  // O "Sim" ao artigo só muda o resultado de quem foi para a fila (transferiu ou criou
  // chamado), e só quem transferiu tem transferências a contar: só nesses casos vale ler as
  // mensagens. Cada transferência deixou uma parte `handoff` no histórico.
  if (!resolvedWithoutQueue(row)) {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation_createdAt", (q) => q.eq("conversationId", conversation._id))
      .collect();
    row.articleConfirmed = confirmedArticle(messages);
    row.transfers = transferReasons(messages);
  }
  return row;
}
