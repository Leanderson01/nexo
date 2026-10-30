import { BUSINESS_TIME_ZONE } from "@/domain/business-hours";

// Números do painel de métricas (§7.6) em português. Funções puras, para testar sem a tela.
// Sem dado, o painel mostra um traço: "0%" sugeriria uma medição que não houve.

export const NO_DATA = "—";

const percentFormat = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 0,
});

/** 0,734 → "73%". */
export function percentText(ratio: number | null): string {
  return ratio === null ? NO_DATA : percentFormat.format(ratio);
}

/** Custo em dólar com 4 casas, porque um turno custa frações de centavo: "US$ 0,0021". */
export function usdText(value: number | null): string {
  if (value === null) return NO_DATA;
  return `US$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
}

/** Latência: "850 ms" abaixo de 1 s, "4,2 s" acima. */
export function durationText(ms: number | null): string {
  if (ms === null) return NO_DATA;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
}

/** "1 conversa", "3 conversas". */
export function countText(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Largura da barra, em % da maior da lista; a maior ocupa tudo, zero não aparece. */
export function barWidth(value: number, max: number): number {
  return max <= 0 ? 0 : (value / max) * 100;
}

const sinceFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: BUSINESS_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** "Conversas iniciadas desde 23/10, 14:05". */
export function periodText(since: number): string {
  return `Conversas iniciadas desde ${sinceFormat.format(since)}`;
}
