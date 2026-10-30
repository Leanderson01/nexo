import { MetricsDashboard } from "@/features/metrics/metrics-dashboard";
import { MetricsErrorBoundary } from "@/features/metrics/metrics-error-boundary";

/** `/console/metrics`: o painel de métricas do atendimento (§7.6), só para analistas. */
export default function MetricsPage() {
  return (
    <MetricsErrorBoundary>
      <MetricsDashboard />
    </MetricsErrorBoundary>
  );
}
