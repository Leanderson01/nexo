"use client";

import { Alert, SegmentedControl, Skeleton } from "@mantine/core";
import { useQuery } from "convex/react";
import { useState } from "react";

import {
  HANDOFF_REASONS,
  METRICS_PERIODS,
  REPLY_CORRECTION_RULES,
  type MetricsPeriod,
} from "@/domain/enums";
import {
  HANDOFF_REASON_LABELS,
  METRICS_PERIOD_LABELS,
  REPLY_CORRECTION_RULE_LABELS,
} from "@/domain/labels";
import type { DashboardMetrics } from "@/domain/metrics";
import { HANDOFF_REASON_TONES, type StatusTone } from "@/features/console/console-texts";
import { useHydrated } from "@/shared/use-hydrated";
import { api } from "../../../convex/_generated/api";
import classes from "./metrics.module.css";
import {
  barWidth,
  countText,
  durationText,
  percentText,
  periodText,
  usdText,
} from "./metrics-texts";

/**
 * Painel de métricas do console (§7.6, T17): números grandes para as métricas de sucesso da
 * §1 e barras para as contagens por motivo e por regra. Tempo real como o resto do console:
 * um turno novo atualiza os números sem recarregar.
 */
export function MetricsDashboard() {
  const [period, setPeriod] = useState<MetricsPeriod>("7d");
  // Até hidratar, a query fica parada: servidor e cliente desenham o mesmo esqueleto.
  const dashboard = useQuery(api.metrics.dashboard, useHydrated() ? { period } : "skip");

  return (
    <div className={classes.page}>
      <header className={classes.header}>
        <div>
          <h1 className={classes.title}>Métricas do atendimento</h1>
          <div className={classes.subtitle}>{dashboard ? periodText(dashboard.since) : " "}</div>
        </div>
        <SegmentedControl
          size="xs"
          value={period}
          onChange={(value) => setPeriod(value as MetricsPeriod)}
          data={METRICS_PERIODS.map((value) => ({
            value,
            label: METRICS_PERIOD_LABELS[value],
          }))}
          aria-label="Período"
        />
      </header>

      <div className={classes.body}>
        <div className={classes.content}>
          {dashboard === undefined ? (
            <DashboardSkeleton />
          ) : dashboard.metrics.conversations === 0 ? (
            <div className={classes.empty}>
              <div className={classes.emptyTitle}>Nenhuma conversa atendida neste período.</div>
              <p className={classes.emptyText}>
                Os números aparecem assim que um funcionário conversar com o Nexo Assist.
              </p>
            </div>
          ) : (
            <>
              {dashboard.truncated && (
                <Alert color="yellow" variant="light" mb="md">
                  O período tem muitas conversas: os números cobrem só as mais recentes.
                </Alert>
              )}
              <DashboardBody metrics={dashboard.metrics} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DashboardBody({ metrics }: { metrics: DashboardMetrics }) {
  const conversations = countText(metrics.conversations, "conversa", "conversas");
  const turns = countText(metrics.turns, "turno", "turnos");

  return (
    <>
      <section className={classes.tiles} aria-label="Métricas principais">
        <StatTile
          label="Resolvidas sem fila"
          value={percentText(metrics.resolvedWithoutQueue.rate)}
          note={`${metrics.resolvedWithoutQueue.count} de ${conversations}`}
        />
        <StatTile
          label="Duplicados evitados"
          value={String(metrics.drafts.duplicatesAvoided)}
          note={`atualizar ou reabrir, em ${countText(metrics.drafts.total, "rascunho", "rascunhos")} · ${countText(metrics.drafts.ticketsCreated, "chamado criado", "chamados criados")}`}
        />
        <StatTile
          label="Transferências"
          value={String(metrics.handoffs.total)}
          note={`em ${countText(metrics.handoffs.conversations, "conversa", "conversas")} · ${percentText(metrics.handoffs.conversations / metrics.conversations)} do total`}
        />
        <StatTile
          label="Confiança média"
          value={percentText(metrics.averageConfidence)}
          note={`em ${turns}`}
        />
        <StatTile
          label="Custo médio por conversa"
          value={usdText(metrics.averageCostPerConversationUsd)}
          note={`total ${usdText(metrics.totalCostUsd)}`}
        />
        <StatTile
          label="Tempo médio de resposta"
          value={durationText(metrics.averageResponseMs)}
          note={`${metrics.shortCircuits} de ${turns} decididos em código`}
        />
      </section>

      <div className={classes.charts}>
        <BarList
          title="Transferências por motivo"
          rows={HANDOFF_REASONS.map((reason) => ({
            label: HANDOFF_REASON_LABELS[reason],
            value: metrics.handoffs.byReason[reason],
            // A mesma cor do motivo na fila e no card de resumo (§7.4).
            tone: HANDOFF_REASON_TONES[reason],
          }))}
        />
        <BarList
          title="Correções em código por regra"
          rows={REPLY_CORRECTION_RULES.map((rule) => ({
            label: REPLY_CORRECTION_RULE_LABELS[rule],
            value: metrics.correctionsByRule[rule],
          }))}
        />
      </div>

      <p className={classes.footnote}>
        Conversa atendida: teve resposta do agent ou foi transferida. Resolvida sem fila: sem
        transferência e sem chamado criado, ou com &ldquo;Sim&rdquo; ao &ldquo;Isso resolveu?&rdquo;
        de um artigo. Duplicado evitado: rascunho que atualiza ou reabre um chamado em vez de criar
        outro (rascunhos substituídos não contam).
      </p>
    </>
  );
}

function StatTile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className={classes.tile}>
      <div className={classes.tileLabel}>{label}</div>
      <div className={classes.tileValue}>{value}</div>
      <div className={classes.tileNote}>{note}</div>
    </div>
  );
}

interface BarRow {
  label: string;
  value: number;
  /** Cor da barra (tom de status do console); sem tom, a primária. */
  tone?: StatusTone;
}

/** Barras horizontais de uma série só, com o rótulo e o número escritos ao lado. */
function BarList({ title, rows }: { title: string; rows: BarRow[] }) {
  const max = Math.max(0, ...rows.map((row) => row.value));
  return (
    <section className={classes.card} aria-label={title}>
      <h2 className={classes.cardTitle}>{title}</h2>
      <ul className={classes.bars}>
        {rows.map((row) => (
          <li key={row.label} className={classes.barRow}>
            <span className={classes.barLabel}>{row.label}</span>
            <span className={classes.barTrack} aria-hidden>
              {row.value > 0 && (
                <span
                  className={classes.bar}
                  data-tone={row.tone}
                  style={{ width: `${barWidth(row.value, max)}%` }}
                />
              )}
            </span>
            <span className={classes.barValue}>{row.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-label="Carregando as métricas">
      <div className={classes.tiles}>
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} height={104} radius="lg" />
        ))}
      </div>
      <div className={classes.charts}>
        <Skeleton height={180} radius="lg" />
        <Skeleton height={180} radius="lg" />
      </div>
    </div>
  );
}
