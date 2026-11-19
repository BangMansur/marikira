/**
 * Integer division with banker's rounding (round half to even).
 * Works on BigInt so intermediate products never lose precision.
 */
export function divRoundHalfEven(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError('Division by zero');
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const negative = numerator < 0n;
  const n = negative ? -numerator : numerator;
  let q = n / denominator;
  const r = n % denominator;
  const twice = r * 2n;
  if (twice > denominator || (twice === denominator && q % 2n === 1n)) q += 1n;
  return negative ? -q : q;
}

/** Banker's-rounded integer division for safe-integer inputs. */
export function divRound(numerator: number, denominator: number): number {
  assertSafeInt(numerator, 'numerator');
  assertSafeInt(denominator, 'denominator');
  return Number(divRoundHalfEven(BigInt(numerator), BigInt(denominator)));
}

/** Ceiling division for non-negative safe integers. */
export function divCeil(numerator: number, denominator: number): number {
  assertSafeInt(numerator, 'numerator');
  assertSafeInt(denominator, 'denominator');
  if (denominator <= 0) throw new RangeError('Denominator must be positive');
  if (numerator <= 0) return -Math.floor(-numerator / denominator);
  return Math.floor((numerator + denominator - 1) / denominator);
}

export function assertSafeInt(v: number, label = 'value'): void {
  if (!Number.isSafeInteger(v)) throw new TypeError(`${label} must be a safe integer, got ${v}`);
}
