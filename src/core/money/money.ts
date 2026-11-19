import { getCurrency, pow10 } from './currencies';
import { assertSafeInt, divRoundHalfEven } from './rounding';

/** An integer count of minor units (e.g. sen). Never a float. */
export type Minor = number;

/**
 * Parse a user-typed decimal string ("1,234.5", "12.50", "-3") into minor units.
 * Pure string arithmetic — no floating point is ever involved.
 * Returns null for anything that is not a valid amount for the currency.
 */
export function parseAmount(input: string, currency: string): Minor | null {
  const { exponent } = getCurrency(currency);
  const s = input.trim().replace(/[,\s]/g, '');
  const m = /^(-)?(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m) return null;
  const [, neg, whole = '', frac = ''] = m;
  if (whole === '' && frac === '') return null;
  if (frac.length > exponent) return null;
  const digits = (whole || '0') + frac.padEnd(exponent, '0');
  const value = Number(digits.replace(/^0+(?=\d)/, ''));
  if (!Number.isSafeInteger(value)) return null;
  return neg ? -value : value;
}

export interface FormatOptions {
  /** Show the currency symbol (default true). */
  symbol?: boolean;
  /** Prefix positive values with "+" (default false). */
  signed?: boolean;
  /** Drop the minor digits when they are zero (RM12 instead of RM12.00). */
  trimZeroMinor?: boolean;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Format minor units for display, e.g. 123450 MYR → "RM1,234.50". */
export function formatMoney(amount: Minor, currency: string, opts: FormatOptions = {}): string {
  assertSafeInt(amount, 'amount');
  const { exponent, symbol } = getCurrency(currency);
  const showSymbol = opts.symbol ?? true;
  const abs = Math.abs(amount);
  const unit = pow10(exponent);
  const whole = Math.floor(abs / unit);
  const frac = abs % unit;
  let body = groupThousands(String(whole));
  if (exponent > 0 && !(opts.trimZeroMinor && frac === 0)) {
    body += '.' + String(frac).padStart(exponent, '0');
  }
  const sign = amount < 0 ? '-' : opts.signed && amount > 0 ? '+' : '';
  return `${sign}${showSymbol ? symbol : ''}${body}`;
}

/**
 * Compact display for charts and tight spaces: RM1.2k, RM3.4M.
 * Uses banker's rounding (display-time only).
 */
export function formatMoneyCompact(amount: Minor, currency: string): string {
  const { exponent, symbol } = getCurrency(currency);
  const unit = BigInt(pow10(exponent));
  const abs = BigInt(Math.abs(amount));
  const sign = amount < 0 ? '-' : '';
  const thresholds: [bigint, string][] = [
    [1_000_000_000n, 'B'],
    [1_000_000n, 'M'],
    [1_000n, 'k'],
  ];
  for (const [t, suffix] of thresholds) {
    if (abs >= t * unit) {
      const tenths = divRoundHalfEven(abs * 10n, t * unit);
      const w = tenths / 10n;
      const f = tenths % 10n;
      return `${sign}${symbol}${w}${f === 0n ? '' : '.' + f}${suffix}`;
    }
  }
  const whole = divRoundHalfEven(abs, unit);
  return `${sign}${symbol}${whole}`;
}

/** Convert minor units to the plain decimal string shown in an input field ("12.5" → "12.50"). */
export function toDecimalString(amount: Minor, currency: string): string {
  return formatMoney(amount, currency, { symbol: false }).replace(/,/g, '');
}

export function sumMinor(values: readonly Minor[]): Minor {
  let total = 0;
  for (const v of values) {
    assertSafeInt(v);
    total += v;
  }
  assertSafeInt(total, 'sum');
  return total;
}

/**
 * Percentage in basis points (1% = 100 bps), banker's-rounded.
 * Returns null when the denominator is zero (undefined ratio).
 */
export function ratioBps(part: Minor, whole: Minor): number | null {
  if (whole === 0) return null;
  return Number(divRoundHalfEven(BigInt(part) * 10_000n, BigInt(whole)));
}

/** Format basis points as a percentage string: 2150 → "21.5%". */
export function formatBps(bps: number, decimals: 0 | 1 = 1): string {
  const scale = decimals === 1 ? 10n : 100n;
  const v = divRoundHalfEven(BigInt(bps), scale);
  const neg = v < 0n;
  const a = neg ? -v : v;
  if (decimals === 0) return `${neg ? '-' : ''}${a}%`;
  const w = a / 10n;
  const f = a % 10n;
  return `${neg ? '-' : ''}${w}${f === 0n ? '' : '.' + f}%`;
}

/**
 * Split `total` units across items in proportion to `values` so the parts sum to EXACTLY `total`
 * (largest-remainder / Hamilton method, exact BigInt arithmetic). Used for percentages that must
 * add up to 100%, e.g. apportion([1, 1, 1], 100) → [34, 33, 33].
 * Ties on the remainder go to the larger value, then to the earlier item. All-zero input → all zeros.
 */
export function apportion(values: readonly number[], total: number): number[] {
  for (const v of values) assertSafeInt(v, 'value');
  if (values.some((v) => v < 0)) throw new RangeError('apportion needs non-negative values');
  const sum = values.reduce((s, v) => s + BigInt(v), 0n);
  if (sum === 0n || values.length === 0) return values.map(() => 0);
  const T = BigInt(total);
  const base = values.map((v) => (BigInt(v) * T) / sum);
  const rem = values.map((v, i) => ({ i, r: (BigInt(v) * T) % sum, v }));
  let left = Number(T - base.reduce((s, b) => s + b, 0n));
  rem.sort((a, b) => (a.r === b.r ? (a.v === b.v ? a.i - b.i : b.v - a.v) : a.r > b.r ? -1 : 1));
  const out = base.map(Number);
  for (const { i } of rem) {
    if (left <= 0) break;
    out[i] += 1;
    left--;
  }
  return out;
}
