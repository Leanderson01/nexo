import { fromLocal, toLocal } from "./business-hours";

// O "dia" dos limites de uso (§12.3) é o dia de São Paulo, não o do UTC: a cota vira à
// meia-noite de Brasília, que é quando o funcionário vê o dia mudar.

/** O dia de São Paulo daquele instante, como "2026-10-29". */
export function localDay(timestamp: number): string {
  const { year, month, day } = toLocal(timestamp);
  return `${year}-${twoDigits(month)}-${twoDigits(day)}`;
}

/** Meia-noite de São Paulo do dia daquele instante, como timestamp. */
export function startOfLocalDay(timestamp: number): number {
  const { year, month, day } = toLocal(timestamp);
  return fromLocal(year, month, day, 0);
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}
