/**
 * Calendar dates as 'YYYY-MM-DD' strings in the user's local calendar.
 * Day arithmetic goes through an epoch-day number computed from y/m/d,
 * so it is immune to time zones and daylight-saving shifts.
 */
export type LocalDate = string;

export interface YMD {
  y: number;
  m: number; // 1-12
  d: number; // 1-31
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function daysInMonth(y: number, m: number): number {
  return m === 2 && isLeapYear(y) ? 29 : DAYS[m - 1];
}

export function parseLocalDate(s: LocalDate): YMD {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`Invalid local date: ${s}`);
  const ymd = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  if (ymd.m < 1 || ymd.m > 12 || ymd.d < 1 || ymd.d > daysInMonth(ymd.y, ymd.m)) {
    throw new Error(`Invalid local date: ${s}`);
  }
  return ymd;
}

export function isValidLocalDate(s: string): boolean {
  try {
    parseLocalDate(s);
    return true;
  } catch {
    return false;
  }
}

export function formatYMD({ y, m, d }: YMD): LocalDate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Days since 1970-01-01 (proleptic Gregorian). */
export function toEpochDay(s: LocalDate): number {
  const { y, m, d } = parseLocalDate(s);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function fromEpochDay(n: number): LocalDate {
  const dt = new Date(n * 86_400_000);
  return formatYMD({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() });
}

export function addDays(s: LocalDate, n: number): LocalDate {
  return fromEpochDay(toEpochDay(s) + n);
}

/** b − a in whole days. */
export function diffDays(a: LocalDate, b: LocalDate): number {
  return toEpochDay(b) - toEpochDay(a);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(s: LocalDate): number {
  return (((toEpochDay(s) + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
}

/** Local calendar date of a JS Date in the device time zone. */
export function toLocalDate(date: Date): LocalDate {
  return formatYMD({ y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() });
}

export function todayLocal(now: Date = new Date()): LocalDate {
  return toLocalDate(now);
}

/** Add calendar months, clamping the day (Jan 31 + 1 month → Feb 28/29). */
export function addMonths(s: LocalDate, n: number): LocalDate {
  const { y, m, d } = parseLocalDate(s);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return formatYMD({ y: ny, m: nm, d: Math.min(d, daysInMonth(ny, nm)) });
}

export function compareLocalDate(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Combine a local date with the time-of-day of `time` (device zone) → epoch ms. */
export function localDateTimeToEpochMs(date: LocalDate, time: Date): number {
  const { y, m, d } = parseLocalDate(date);
  return new Date(y, m - 1, d, time.getHours(), time.getMinutes(), time.getSeconds()).getTime();
}
