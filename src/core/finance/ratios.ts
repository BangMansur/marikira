import { diffDays, type LocalDate, parseLocalDate } from '../dates';
import { divCeil, divRound, type Minor, ratioBps } from '../money';

/**
 * All percentages are returned in basis points (1% = 100 bps) so callers
 * never handle floats. `null` means "not meaningful" (e.g. zero income).
 */

/** Savings rate = (income − expenses) ÷ income. Negative when overspending. */
export function savingsRateBps(income: Minor, expenses: Minor): number | null {
  if (income <= 0) return null;
  return ratioBps(income - expenses, income);
}

export type RatioLevel = 'healthy' | 'warning' | 'alert';

/** Commitment ratio = total monthly commitments ÷ monthly income. Warn > 40%, alert > 60%. */
export function commitmentRatio(commitments: Minor, income: Minor): { bps: number; level: RatioLevel } | null {
  if (income <= 0) return null;
  const bps = ratioBps(commitments, income) ?? 0;
  const level: RatioLevel = bps > 6000 ? 'alert' : bps > 4000 ? 'warning' : 'healthy';
  return { bps, level };
}

/**
 * Emergency fund coverage in months = savings ÷ monthly essential expenses.
 * Returned as hundredths of a month (350 = 3.5 months) to stay in integers.
 */
export function emergencyFundMonthsX100(savings: Minor, monthlyEssentials: Minor): number | null {
  if (monthlyEssentials <= 0) return null;
  return divRound(savings * 100, monthlyEssentials);
}

export type BudgetStatus = 'green' | 'amber' | 'red';

/** Budget utilisation: green < 75%, amber 75–100%, red > 100%. */
export function budgetUtilisation(spent: Minor, budget: Minor): { bps: number; status: BudgetStatus } | null {
  if (budget <= 0) return null;
  const bps = ratioBps(spent, budget) ?? 0;
  const status: BudgetStatus = bps > 10_000 ? 'red' : bps >= 7_500 ? 'amber' : 'green';
  return { bps, status };
}

/** Whole calendar months from `from` until `to`, counting a partial month as one. */
export function monthsUntil(from: LocalDate, to: LocalDate): number {
  if (diffDays(from, to) <= 0) return 0;
  const a = parseLocalDate(from);
  const b = parseLocalDate(to);
  let months = (b.y - a.y) * 12 + (b.m - a.m);
  if (b.d > a.d) months += 1;
  return Math.max(1, months);
}

/**
 * Monthly contribution needed to reach a goal by its target date.
 * Rounded UP to the minor unit so following the plan always reaches the target.
 * Target date today or past → the full remaining amount is due now.
 */
export function goalMonthlyContribution(target: Minor, saved: Minor, today: LocalDate, targetDate: LocalDate): Minor {
  const remaining = target - saved;
  if (remaining <= 0) return 0;
  const months = monthsUntil(today, targetDate);
  if (months === 0) return remaining;
  return divCeil(remaining, months);
}

/** Percentage change vs a previous period; null when the previous value is zero. */
export function changeBps(current: Minor, previous: Minor): number | null {
  if (previous === 0) return null;
  return ratioBps(current - previous, Math.abs(previous));
}
