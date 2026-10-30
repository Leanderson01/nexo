// Calendário útil do service desk (§3.6): segunda a sexta, das 8h às 18h,
// no fuso America/Sao_Paulo, sem feriados. Os horários são sempre lidos no fuso
// de São Paulo pelo Intl, então o resultado não depende do fuso da máquina.

export const BUSINESS_TIME_ZONE = "America/Sao_Paulo";
export const BUSINESS_DAY_START_HOUR = 8;
export const BUSINESS_DAY_END_HOUR = 18;

const HOUR_MS = 60 * 60 * 1000;
const SATURDAY = 6;
const SUNDAY = 0;

/** Data e hora de parede em São Paulo. `month` vai de 1 a 12. */
export interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const localFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

export function toLocal(timestamp: number): LocalDateTime {
  const parts = localFormatter.formatToParts(new Date(timestamp));
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

/** Converte uma hora de parede de São Paulo para timestamp. */
export function fromLocal(year: number, month: number, day: number, hour: number): number {
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour);
  // Descobre a diferença entre o fuso e o UTC naquele instante e desconta.
  const offset = wallClockAsUtc - localAsUtc(toLocal(wallClockAsUtc));
  return wallClockAsUtc + offset;
}

function localAsUtc(local: LocalDateTime): number {
  return Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
}

function isWeekday(year: number, month: number, day: number): boolean {
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday !== SATURDAY && weekday !== SUNDAY;
}

/** Se o instante está fora do expediente, avança para o próximo início (8h de um dia útil). */
function moveIntoBusinessHours(timestamp: number): number {
  const local = toLocal(timestamp);
  const workday = isWeekday(local.year, local.month, local.day);

  if (workday && local.hour < BUSINESS_DAY_START_HOUR) {
    return fromLocal(local.year, local.month, local.day, BUSINESS_DAY_START_HOUR);
  }
  if (workday && local.hour < BUSINESS_DAY_END_HOUR) {
    return timestamp;
  }

  // Depois das 18h ou fim de semana: procura o próximo dia útil.
  const nextDay = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
  while (!isWeekday(nextDay.getUTCFullYear(), nextDay.getUTCMonth() + 1, nextDay.getUTCDate())) {
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  }
  return fromLocal(
    nextDay.getUTCFullYear(),
    nextDay.getUTCMonth() + 1,
    nextDay.getUTCDate(),
    BUSINESS_DAY_START_HOUR,
  );
}

function endOfBusinessDay(timestamp: number): number {
  const local = toLocal(timestamp);
  return fromLocal(local.year, local.month, local.day, BUSINESS_DAY_END_HOUR);
}

/**
 * Soma horas úteis a um instante. Atividade fora do expediente começa a contar
 * no próximo início (§3.6): sexta 17h + 4h úteis = segunda 11h.
 */
export function addBusinessHours(start: number, hours: number): number {
  let remaining = hours * HOUR_MS;
  let cursor = moveIntoBusinessHours(start);

  for (;;) {
    const availableToday = endOfBusinessDay(cursor) - cursor;
    if (remaining <= availableToday) return cursor + remaining;
    remaining -= availableToday;
    cursor = moveIntoBusinessHours(endOfBusinessDay(cursor));
  }
}
