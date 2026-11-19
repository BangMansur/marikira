import {
  budgetUtilisation,
  changeBps,
  commitmentRatio,
  emergencyFundMonthsX100,
  goalMonthlyContribution,
  monthsUntil,
  savingsRateBps,
} from '../ratios';

describe('savings rate', () => {
  it('normal', () => expect(savingsRateBps(400_000, 320_000)).toBe(2000));
  it('overspending is negative', () => expect(savingsRateBps(400_000, 500_000)).toBe(-2500));
  it('zero income → null', () => expect(savingsRateBps(0, 10_000)).toBeNull());
  it('no expenses → 100%', () => expect(savingsRateBps(1, 0)).toBe(10_000));
});

describe('commitment ratio', () => {
  it.each([
    [150_000, 400_000, 3750, 'healthy'],
    [160_000, 400_000, 4000, 'healthy'], // exactly 40% is not above 40%
    [160_100, 400_000, 4002, 'warning'], // 40.025% → 4002 bps (half-even), still > 40%
    [240_000, 400_000, 6000, 'warning'],
    [250_000, 400_000, 6250, 'alert'],
  ])('%d / %d', (c, i, bps, level) => {
    expect(commitmentRatio(c, i)).toEqual({ bps, level });
  });
  it('zero income → null', () => expect(commitmentRatio(100, 0)).toBeNull());
});

describe('emergency fund months', () => {
  it('3.5 months', () => expect(emergencyFundMonthsX100(700_000, 200_000)).toBe(350));
  it('no essentials → null', () => expect(emergencyFundMonthsX100(1, 0)).toBeNull());
  it('zero savings', () => expect(emergencyFundMonthsX100(0, 200_000)).toBe(0));
});

describe('budget utilisation', () => {
  it.each([
    [0, 10_000, 0, 'green'],
    [7_499, 10_000, 7499, 'green'],
    [7_500, 10_000, 7500, 'amber'],
    [10_000, 10_000, 10_000, 'amber'],
    [10_001, 10_000, 10_001, 'red'],
  ])('%d of %d', (spent, budget, bps, status) => {
    expect(budgetUtilisation(spent, budget)).toEqual({ bps, status });
  });
  it('no budget → null', () => expect(budgetUtilisation(1, 0)).toBeNull());
});

describe('goal contribution', () => {
  it('months until', () => {
    expect(monthsUntil('2026-11-19', '2027-11-19')).toBe(12);
    expect(monthsUntil('2026-11-19', '2027-11-20')).toBe(13);
    expect(monthsUntil('2026-11-19', '2026-11-25')).toBe(1);
    expect(monthsUntil('2026-11-19', '2026-11-19')).toBe(0);
    expect(monthsUntil('2026-11-19', '2026-01-01')).toBe(0);
  });
  it('rounds up so the goal is always reached', () => {
    expect(goalMonthlyContribution(1_000_000, 0, '2026-11-19', '2027-02-19')).toBe(333_334);
  });
  it('already reached → 0', () => expect(goalMonthlyContribution(100, 150, '2026-11-19', '2027-01-01')).toBe(0));
  it('past target date → full remaining now', () =>
    expect(goalMonthlyContribution(100_000, 40_000, '2026-11-19', '2026-10-01')).toBe(60_000));
  it('leap-day target', () => expect(goalMonthlyContribution(120_000, 0, '2027-02-28', '2028-02-29')).toBe(9_231));
});

describe('period change', () => {
  it('+32%', () => expect(changeBps(132_000, 100_000)).toBe(3200));
  it('decrease', () => expect(changeBps(50, 100)).toBe(-5000));
  it('no previous → null', () => expect(changeBps(50, 0)).toBeNull());
});
