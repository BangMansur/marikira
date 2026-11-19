import {
  addDays,
  daysInMonth,
  diffDays,
  formatYMD,
  type LocalDate,
  parseLocalDate,
} from './localDate';

/**
 * A budgeting cycle tied to the user's pay day.
 * Pay day 25 → cycles run 25th → 24th of next month.
 * Pay day 1 → calendar months.
 * Pay days 29–31 are clamped to the last day of shorter months
 * (pay day 31 → Feb cycle starts Feb 28, or Feb 29 in leap years).
 */
export interface PayCycle {
  start: LocalDate;
  end: LocalDate; // inclusive
  lengthDays: number;
}

function assertPayDay(payDay: number): void {
  if (!Number.isInteger(payDay) || payDay < 1 || payDay > 31) {
    throw new RangeError(`Pay day must be 1–31, got ${payDay}`);
  }
}

function cycleStartInMonth(y: number, m: number, payDay: number): LocalDate {
  return formatYMD({ y, m, d: Math.min(payDay, daysInMonth(y, m)) });
}

function shiftMonth(y: number, m: number, delta: number): { y: number; m: number } {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

/** The cycle containing `date`. */
export function getPayCycle(date: LocalDate, payDay: number): PayCycle {
  assertPayDay(payDay);
  const { y, m } = parseLocalDate(date);
  let startYM = { y, m };
  let start = cycleStartInMonth(y, m, payDay);
  if (date < start) {
    startYM = shiftMonth(y, m, -1);
    start = cycleStartInMonth(startYM.y, startYM.m, payDay);
  }
  const next = shiftMonth(startYM.y, startYM.m, 1);
  const nextStart = cycleStartInMonth(next.y, next.m, payDay);
  const end = addDays(nextStart, -1);
  return { start, end, lengthDays: diffDays(start, nextStart) };
}

/** The cycle `offset` cycles away from the one containing `date` (−1 = previous). */
export function shiftPayCycle(cycle: PayCycle, offset: number, payDay: number): PayCycle {
  let c = cycle;
  if (offset > 0) for (let i = 0; i < offset; i++) c = getPayCycle(addDays(c.end, 1), payDay);
  if (offset < 0) for (let i = 0; i < -offset; i++) c = getPayCycle(addDays(c.start, -1), payDay);
  return c;
}

/** 1-based day number of `date` within the cycle. */
export function dayOfCycle(date: LocalDate, cycle: PayCycle): number {
  return diffDays(cycle.start, date) + 1;
}

/** Days remaining in the cycle, counting today. Last day → 1. */
export function daysLeftIncludingToday(date: LocalDate, cycle: PayCycle): number {
  return diffDays(date, cycle.end) + 1;
}

export function isInCycle(date: LocalDate, cycle: PayCycle): boolean {
  return date >= cycle.start && date <= cycle.end;
}

/** All dates in the cycle, in order. */
export function cycleDates(cycle: PayCycle): LocalDate[] {
  const out: LocalDate[] = [];
  for (let i = 0; i < cycle.lengthDays; i++) out.push(addDays(cycle.start, i));
  return out;
}
