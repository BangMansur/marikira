import { getPayCycle } from '../../dates';
import { safeToSpend, type SafeToSpendInput } from '../safeToSpend';

const RM = (v: number) => Math.round(v * 100); // test helper only; app code never multiplies floats

const nov = getPayCycle('2026-11-15', 1); // 2026-11-01 .. 2026-11-30, 30 days

function input(over: Partial<SafeToSpendInput>): SafeToSpendInput {
  return {
    income: RM(4000),
    commitments: RM(1500),
    savingsTarget: RM(400),
    savedThisCycle: 0,
    spentBeforeToday: 0,
    spentToday: 0,
    today: '2026-11-11',
    cycle: nov,
    ...over,
  };
}

describe('safeToSpend', () => {
  it('acceptance: RM4,000 income, RM1,500 commitments, RM400 savings, RM900 spent in days 1–10 → RM60.00/day', () => {
    const r = safeToSpend(input({ spentBeforeToday: RM(900), today: '2026-11-11' }));
    expect(r).toMatchObject({ status: 'ok', perDay: RM(60), daysLeft: 20, pool: RM(1200), overBy: 0 });
  });

  it('shows "left today" = safe − spent today, and today’s spending does not move the daily figure', () => {
    const r = safeToSpend(input({ spentBeforeToday: RM(900), spentToday: RM(38) }));
    expect(r).toMatchObject({ perDay: RM(60), leftToday: RM(22) });
  });

  it('day 1 of cycle: whole cycle ahead', () => {
    const r = safeToSpend(input({ today: '2026-11-01' }));
    expect(r).toMatchObject({ daysLeft: 30, pool: RM(2100), perDay: RM(70) });
  });

  it('last day of cycle: everything left is safe today', () => {
    const r = safeToSpend(input({ today: '2026-11-30', spentBeforeToday: RM(2000) }));
    expect(r).toMatchObject({ daysLeft: 1, perDay: RM(100) });
  });

  it('pay day not on the 1st (25th → 24th cycle)', () => {
    const cycle = getPayCycle('2026-11-19', 25); // 2026-10-25 .. 2026-11-24 (31 days)
    const r = safeToSpend(input({ cycle, today: '2026-11-19', spentBeforeToday: RM(1800) }));
    expect(r).toMatchObject({ daysLeft: 6, pool: RM(300), perDay: RM(50) });
  });

  it('pay cycle across February in a leap year', () => {
    const cycle = getPayCycle('2028-02-29', 25); // 2028-02-25 .. 2028-03-24 (29 days)
    expect(cycle.lengthDays).toBe(29);
    const r = safeToSpend(input({ cycle, today: '2028-02-25', commitments: 0, savingsTarget: 0, income: RM(2900) }));
    expect(r).toMatchObject({ daysLeft: 29, perDay: RM(100) });
  });

  it('zero income → no_income (UI asks the user to add income)', () => {
    expect(safeToSpend(input({ income: 0, spentBeforeToday: RM(10) }))).toEqual({ status: 'no_income' });
  });

  it('negative pool → RM0 safe and "over by" for the cycle', () => {
    const r = safeToSpend(input({ spentBeforeToday: RM(2300), spentToday: RM(15) }));
    // pool = 4000 − 1500 − 400 − 2300 = −200; over by 200 + today’s 15
    expect(r).toMatchObject({ status: 'over', perDay: 0, pool: RM(-200), overBy: RM(215), leftToday: RM(-15) });
  });

  it('today’s spending can tip the cycle over even when the morning pool was positive', () => {
    const r = safeToSpend(input({ today: '2026-11-30', spentBeforeToday: RM(2000), spentToday: RM(150) }));
    expect(r).toMatchObject({ status: 'over', perDay: RM(100), leftToday: RM(-50), overBy: RM(50) });
  });

  it('commitments are not double-counted: spent excludes commitment payments, so paying one changes nothing', () => {
    // Before paying the RM1,500 loan: discretionary spend RM900.
    const before = safeToSpend(input({ spentBeforeToday: RM(900) }));
    // After paying it, the repository still reports RM900 discretionary spend
    // (commitment-linked transactions are excluded; see reports.repo tests).
    const after = safeToSpend(input({ spentBeforeToday: RM(900) }));
    expect(after).toEqual(before);
    // Counting it in both places would wrongly wipe out the daily figure:
    const doubleCounted = safeToSpend(input({ spentBeforeToday: RM(900 + 1500) }));
    expect(doubleCounted).toMatchObject({ status: 'over', perDay: 0, overBy: RM(300) });
  });

  it('transfers to savings goals count toward the savings target, not spending', () => {
    const base = safeToSpend(input({ spentBeforeToday: RM(900) }));
    // Moving RM400 into a goal exactly meets the target: no change.
    expect(safeToSpend(input({ spentBeforeToday: RM(900), savedThisCycle: RM(400) }))).toEqual(base);
    // Saving less than the target still reserves the full target.
    expect(safeToSpend(input({ spentBeforeToday: RM(900), savedThisCycle: RM(100) }))).toEqual(base);
    // Saving more than the target reserves what was actually saved.
    const extra = safeToSpend(input({ spentBeforeToday: RM(900), savedThisCycle: RM(600) }));
    expect(extra).toMatchObject({ pool: RM(1000), perDay: RM(50) });
  });

  it('per-day amount uses banker’s rounding to the sen', () => {
    // 2100.01 / 2 = 1050.005 → 1050.00 (half to even)
    const cycle = nov;
    const r = safeToSpend(input({ today: '2026-11-29', income: RM(3600) + 1, spentBeforeToday: 0, commitments: RM(1500) }));
    expect(r).toMatchObject({ daysLeft: 2, pool: RM(1700) + 1, perDay: RM(850) });
    const r2 = safeToSpend(input({ cycle, today: '2026-11-28', income: RM(1000), commitments: 0, savingsTarget: 0 }));
    expect(r2).toMatchObject({ daysLeft: 3, perDay: 33333 });
  });

  it('rejects a date outside the cycle and float inputs', () => {
    expect(() => safeToSpend(input({ today: '2026-12-01' }))).toThrow(RangeError);
    expect(() => safeToSpend(input({ spentToday: 10.5 }))).toThrow(TypeError);
  });
});
