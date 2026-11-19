import {
  convertMinor,
  divCeil,
  divRound,
  divRoundHalfEven,
  formatBps,
  formatMoney,
  formatMoneyCompact,
  parseAmount,
  parseRateE8,
  ratioBps,
  sumMinor,
  toDecimalString,
} from '..';

describe('banker’s rounding', () => {
  it.each([
    [5n, 2n, 2n], // 2.5 → 2
    [7n, 2n, 4n], // 3.5 → 4
    [-5n, 2n, -2n],
    [-7n, 2n, -4n],
    [11n, 4n, 3n], // 2.75 → 3
    [9n, 4n, 2n], // 2.25 → 2
    [10n, 5n, 2n],
    [5n, -2n, -2n],
  ])('%p / %p = %p', (n, d, q) => {
    expect(divRoundHalfEven(n, d)).toBe(q);
  });

  it('throws on division by zero', () => {
    expect(() => divRoundHalfEven(1n, 0n)).toThrow(RangeError);
  });

  it('divRound rejects floats', () => {
    expect(() => divRound(1.5, 2)).toThrow(TypeError);
  });

  it('divCeil rounds up', () => {
    expect(divCeil(10, 3)).toBe(4);
    expect(divCeil(9, 3)).toBe(3);
    expect(divCeil(0, 3)).toBe(0);
  });
});

describe('parseAmount', () => {
  it.each([
    ['12.50', 1250],
    ['12.5', 1250],
    ['12', 1200],
    ['.5', 50],
    ['1,234.56', 123456],
    ['0.01', 1],
    ['-3', -300],
    ['007', 700],
  ])('MYR %s → %d sen', (s, v) => {
    expect(parseAmount(s, 'MYR')).toBe(v);
  });

  it.each(['', '.', 'abc', '1.234', '1..2', '1e3', '12.5.0'])('rejects %p', (s) => {
    expect(parseAmount(s, 'MYR')).toBeNull();
  });

  it('respects currency exponents', () => {
    expect(parseAmount('1500', 'JPY')).toBe(1500);
    expect(parseAmount('1.5', 'JPY')).toBeNull();
    expect(parseAmount('1.234', 'KWD')).toBe(1234);
  });

  it('never goes through floats (0.1 + 0.2 class bugs)', () => {
    expect((parseAmount('0.10', 'MYR') ?? 0) + (parseAmount('0.20', 'MYR') ?? 0)).toBe(30);
  });

  it('rejects unsafe integers', () => {
    expect(parseAmount('99999999999999999999', 'MYR')).toBeNull();
  });
});

describe('formatMoney', () => {
  it('formats MYR with symbol and grouping', () => {
    expect(formatMoney(123450, 'MYR')).toBe('RM1,234.50');
    expect(formatMoney(5, 'MYR')).toBe('RM0.05');
    expect(formatMoney(-6000, 'MYR')).toBe('-RM60.00');
    expect(formatMoney(0, 'MYR')).toBe('RM0.00');
  });

  it('options', () => {
    expect(formatMoney(1200, 'MYR', { trimZeroMinor: true })).toBe('RM12');
    expect(formatMoney(1250, 'MYR', { trimZeroMinor: true })).toBe('RM12.50');
    expect(formatMoney(1250, 'MYR', { signed: true })).toBe('+RM12.50');
    expect(formatMoney(1250, 'MYR', { symbol: false })).toBe('12.50');
    expect(formatMoney(1500, 'JPY')).toBe('¥1,500');
    expect(formatMoney(1234, 'KWD')).toBe('KD1.234');
  });

  it('rejects non-integers', () => {
    expect(() => formatMoney(12.5, 'MYR')).toThrow();
  });

  it('toDecimalString round-trips with parseAmount', () => {
    for (const v of [0, 1, 99, 100, 123456, 100000000]) {
      expect(parseAmount(toDecimalString(v, 'MYR'), 'MYR')).toBe(v);
    }
  });

  it('compact format uses banker’s rounding', () => {
    expect(formatMoneyCompact(125_000, 'MYR')).toBe('RM1.2k'); // 1.25k → 1.2k (half-even)
    expect(formatMoneyCompact(135_000, 'MYR')).toBe('RM1.4k');
    expect(formatMoneyCompact(100_000, 'MYR')).toBe('RM1k');
    expect(formatMoneyCompact(250_000_000, 'MYR')).toBe('RM2.5M');
    expect(formatMoneyCompact(9_950, 'MYR')).toBe('RM100'); // 99.50 → 100 (half-even: 99 odd → 100)
    expect(formatMoneyCompact(-50_000, 'MYR')).toBe('-RM500');
  });
});

describe('ratios and percentages', () => {
  it('ratioBps', () => {
    expect(ratioBps(1, 3)).toBe(3333);
    expect(ratioBps(2, 3)).toBe(6667);
    expect(ratioBps(5, 0)).toBeNull();
  });
  it('formatBps', () => {
    expect(formatBps(2150)).toBe('21.5%');
    expect(formatBps(2000)).toBe('20%');
    expect(formatBps(-1234)).toBe('-12.3%');
    expect(formatBps(3250, 0)).toBe('32%'); // 32.5 → 32 (half-even)
    expect(formatBps(3350, 0)).toBe('34%');
  });
  it('sumMinor guards overflow', () => {
    expect(sumMinor([1, 2, 3])).toBe(6);
    expect(() => sumMinor([Number.MAX_SAFE_INTEGER, 1])).toThrow();
  });
});

describe('FX conversion', () => {
  it('parses rates to 1e8 scale', () => {
    expect(parseRateE8('4.4725')).toBe(447_250_000);
    expect(parseRateE8('0')).toBeNull();
    expect(parseRateE8('abc')).toBeNull();
  });
  it('converts across exponents with half-even rounding', () => {
    // US$10.00 at 4.4725 → RM44.725 → RM44.72 (half-even)
    expect(convertMinor(1000, 'USD', 'MYR', 447_250_000)).toBe(4472);
    // ¥1,000 at 0.0301 → RM30.10
    expect(convertMinor(1000, 'JPY', 'MYR', 3_010_000)).toBe(3010);
    // RM1.00 at 33.2 → ¥33
    expect(convertMinor(100, 'MYR', 'JPY', 3_320_000_000)).toBe(33);
  });
});
