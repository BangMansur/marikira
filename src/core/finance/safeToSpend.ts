import { daysLeftIncludingToday, isInCycle, type LocalDate, type PayCycle } from '../dates';
import { assertSafeInt, divRound, type Minor } from '../money';

/**
 * Safe to spend today =
 *   (income − commitments − savings reserved − spent before today) ÷ days left including today
 *
 * Rules (agreed in the Phase 1 design):
 * - `spentBeforeToday` / `spentToday` are DISCRETIONARY spending: expenses − refunds,
 *   excluding any transaction linked to a commitment payment. Commitments are subtracted
 *   in full via `commitments`, so a paid commitment is never counted twice.
 * - Transfers (including to savings goals) are never spending. Money moved into savings
 *   goals counts toward the savings target: reserved = max(savingsTarget, savedThisCycle).
 * - Excluding today's spending from the pool keeps the daily figure stable all day;
 *   "left today" then counts down as the user spends.
 * - If the pool is negative the safe amount is 0 and `overBy` says by how much the
 *   cycle is over (including today's spending).
 * - The per-day division uses banker's rounding to the nearest minor unit.
 */
export interface SafeToSpendInput {
  income: Minor;
  commitments: Minor;
  savingsTarget: Minor;
  /** Transfers into savings goals this cycle (counts toward savingsTarget). */
  savedThisCycle: Minor;
  spentBeforeToday: Minor;
  spentToday: Minor;
  today: LocalDate;
  cycle: PayCycle;
}

export type SafeToSpendResult =
  | { status: 'no_income' }
  | {
      status: 'ok' | 'over';
      /** Safe amount for today (≥ 0). */
      perDay: Minor;
      /** perDay − spentToday; negative means over today's amount. */
      leftToday: Minor;
      /** How far the whole cycle is over budget, ≥ 0. */
      overBy: Minor;
      daysLeft: number;
      /** Money available for the rest of the cycle, from the start of today. */
      pool: Minor;
    };

export function safeToSpend(input: SafeToSpendInput): SafeToSpendResult {
  const { income, commitments, savingsTarget, savedThisCycle, spentBeforeToday, spentToday } = input;
  for (const [k, v] of Object.entries({ income, commitments, savingsTarget, savedThisCycle, spentBeforeToday, spentToday })) {
    assertSafeInt(v, k);
  }
  if (!isInCycle(input.today, input.cycle)) {
    throw new RangeError(`today ${input.today} is outside cycle ${input.cycle.start}..${input.cycle.end}`);
  }
  if (income <= 0) return { status: 'no_income' };

  const reservedSavings = Math.max(savingsTarget, savedThisCycle, 0);
  const pool = income - commitments - reservedSavings - spentBeforeToday;
  const daysLeft = daysLeftIncludingToday(input.today, input.cycle);
  const perDay = pool > 0 ? divRound(pool, daysLeft) : 0;
  const overBy = Math.max(0, spentToday - pool);
  return {
    status: overBy > 0 ? 'over' : 'ok',
    perDay,
    leftToday: perDay - spentToday,
    overBy,
    daysLeft,
    pool,
  };
}
