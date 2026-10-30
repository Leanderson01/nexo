"use client";

import { Alert, SegmentedControl, Skeleton, Text } from "@mantine/core";
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
  const dashboard = useQuery(api.metrics.dashboard, { period });

  return (
    <div className={classes.page}>
      <header className={classes.header}>
        <div>
          <h1 className={classes.title}>Métricas do atendimento</h1>
          <Text size="xs" c="dimmed">
            {dashboard ? periodText(dashboard.since) : " "}
          </Text>
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

      {dashboard === undefined ? (
        <DashboardSkeleton />
      ) : dashboard.metrics.conversations === 0 ? (
        <div className={classes.empty}>
          <Text fw={600}>Nenhuma conversa atendida neste período.</Text>
          <Text size="sm" c="dimmed">
            Os números aparecem assim que um funcionário conversar com o Nexo Assist.
          </Text>
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
          note={`${metrics.drafts.duplicatesAvoided} de ${countText(metrics.drafts.total, "rascunho", "rascunhos")} atualizam ou reabrem`}
        />
        <StatTile
          label="Transferências"
          value={String(metrics.handoffs.total)}
          note={`${percentText(metrics.handoffs.total / metrics.conversations)} das conversas`}
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

      <Text size="xs" c="dimmed" mt="lg" className={classes.footnote}>
        Conversa atendida: teve resposta do agent ou foi transferida. Resolvida sem fila: sem
        transferência e sem chamado criado, ou com &ldquo;Sim&rdquo; ao &ldquo;Isso resolveu?&rdquo;
        de um artigo. Duplicado evitado: rascunho que atualiza ou reabre um chamado em vez de criar
        outro (rascunhos substituídos não contam).
      </Text>
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

/** Barras horizontais de uma série só, com o rótulo e o número escritos ao lado. */
function BarList({ title, rows }: { title: string; rows: { label: string; value: number }[] }) {
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
                <span className={classes.bar} style={{ width: `${barWidth(row.value, max)}%` }} />
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
          <Skeleton key={index} height={104} radius="md" />
        ))}
      </div>
      <div className={classes.charts}>
        <Skeleton height={180} radius="md" />
        <Skeleton height={180} radius="md" />
      </div>
    </div>
  );
}
