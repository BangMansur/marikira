import { divRoundHalfEven, type Minor, pow10 } from '../money';

/**
 * Keypad calculator: "12.50+8", "3×4.20", "100÷3".
 * Evaluated with exact rational arithmetic on BigInt (no eval, no floats),
 * then banker's-rounded once to the currency's minor unit.
 */
export const OPERATORS = ['+', '−', '×', '÷'] as const;
export type Operator = (typeof OPERATORS)[number];
export type Key = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | Operator | 'back' | 'clear';

interface Rational {
  n: bigint;
  d: bigint;
}

const OP_ALIASES: Record<string, Operator> = { '+': '+', '-': '−', '−': '−', '*': '×', x: '×', '×': '×', '/': '÷', '÷': '÷' };

function isOperator(c: string): c is Operator {
  return (OPERATORS as readonly string[]).includes(c);
}

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a || 1n;
}

function norm(r: Rational): Rational {
  if (r.d < 0n) r = { n: -r.n, d: -r.d };
  const g = gcd(r.n, r.d);
  return { n: r.n / g, d: r.d / g };
}

function parseNumber(s: string): Rational | null {
  const m = /^(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[1] === '' && (m[2] ?? '') === '')) return null;
  const frac = m[2] ?? '';
  return norm({ n: BigInt((m[1] || '0') + frac), d: 10n ** BigInt(frac.length) });
}

type Token = { kind: 'num'; v: Rational } | { kind: 'op'; v: Operator };

function tokenize(expr: string): Token[] | null {
  const tokens: Token[] = [];
  let buf = '';
  for (const raw of expr.replace(/[\s,]/g, '')) {
    const op = OP_ALIASES[raw];
    if (op) {
      if (buf === '') return null;
      const v = parseNumber(buf);
      if (!v) return null;
      tokens.push({ kind: 'num', v }, { kind: 'op', v: op });
      buf = '';
    } else if (/[\d.]/.test(raw)) {
      buf += raw;
    } else {
      return null;
    }
  }
  if (buf !== '') {
    const v = parseNumber(buf);
    if (!v) return null;
    tokens.push({ kind: 'num', v });
  }
  return tokens;
}

/** Evaluate to an exact rational, honouring × ÷ before + −. Null if invalid. */
export function evaluateRational(expr: string): Rational | null {
  const tokens = tokenize(expr);
  if (!tokens || tokens.length === 0) return null;
  // Allow a trailing operator while typing ("12+") by ignoring it.
  if (tokens[tokens.length - 1].kind === 'op') tokens.pop();
  const terms: Rational[] = [];
  const signs: (1n | -1n)[] = [];
  let current = (tokens[0] as { v: Rational }).v;
  let sign: 1n | -1n = 1n;
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i].v as Operator;
    const next = (tokens[i + 1] as { v: Rational }).v;
    if (op === '×') current = norm({ n: current.n * next.n, d: current.d * next.d });
    else if (op === '÷') {
      if (next.n === 0n) return null;
      current = norm({ n: current.n * next.d, d: current.d * next.n });
    } else {
      terms.push(current);
      signs.push(sign);
      sign = op === '+' ? 1n : -1n;
      current = next;
    }
  }
  terms.push(current);
  signs.push(sign);
  let acc: Rational = { n: 0n, d: 1n };
  terms.forEach((t, i) => {
    acc = norm({ n: acc.n * t.d + signs[i] * t.n * acc.d, d: acc.d * t.d });
  });
  return acc;
}

/** Evaluate to minor units for a currency exponent. Null if invalid or not a safe integer. */
export function evaluateToMinor(expr: string, exponent: number): Minor | null {
  const r = evaluateRational(expr);
  if (!r) return null;
  const v = Number(divRoundHalfEven(r.n * BigInt(pow10(exponent)), r.d));
  return Number.isSafeInteger(v) ? v : null;
}

export function hasOperator(expr: string): boolean {
  return [...expr].some(isOperator);
}

const MAX_EXPR_LENGTH = 32;

/** Apply a keypad key to the expression, enforcing sane input. */
export function applyKey(expr: string, key: Key, exponent: number): string {
  if (key === 'clear') return '';
  if (key === 'back') return expr.slice(0, -1);
  if (expr.length >= MAX_EXPR_LENGTH) return expr;
  const last = expr.slice(-1);
  const currentNumber = expr.split(/[+−×÷]/).pop() ?? '';
  if (isOperator(key)) {
    if (expr === '') return expr;
    if (isOperator(last)) return expr.slice(0, -1) + key;
    if (last === '.') return expr.slice(0, -1) + key;
    return expr + key;
  }
  if (key === '.') {
    if (exponent === 0 || currentNumber.includes('.')) return expr;
    return expr + (currentNumber === '' ? '0.' : '.');
  }
  // digit
  const dot = currentNumber.indexOf('.');
  if (dot >= 0 && currentNumber.length - dot - 1 >= exponent) return expr;
  if (currentNumber === '0') return expr.slice(0, -1) + key;
  return expr + key;
}
