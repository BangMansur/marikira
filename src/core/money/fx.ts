import { getCurrency } from './currencies';
import type { Minor } from './money';
import { divRoundHalfEven } from './rounding';

/** Exchange rates are stored as integers scaled by 10^8 (rate × 100,000,000). */
export const FX_SCALE = 100_000_000n;

/** Parse "4.4725" into a rate scaled by 10^8. */
export function parseRateE8(input: string): number | null {
  const m = /^(\d+)(?:\.(\d{1,8}))?$/.exec(input.trim());
  if (!m) return null;
  const v = Number(m[1] + (m[2] ?? '').padEnd(8, '0'));
  return Number.isSafeInteger(v) && v > 0 ? v : null;
}

/**
 * Convert an amount between currencies with a stored rate (1 `from` = rate `to`).
 * Handles different minor-unit exponents; result banker's-rounded.
 */
export function convertMinor(amount: Minor, from: string, to: string, rateE8: number): Minor {
  const fe = getCurrency(from).exponent;
  const te = getCurrency(to).exponent;
  const num = BigInt(amount) * BigInt(rateE8) * 10n ** BigInt(te);
  const den = FX_SCALE * 10n ** BigInt(fe);
  return Number(divRoundHalfEven(num, den));
}
