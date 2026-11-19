import { applyKey, evaluateToMinor, hasOperator, type Key } from '../calculator';

describe('evaluateToMinor', () => {
  it.each([
    ['12.50+8', 2050],
    ['12.50', 1250],
    ['3×4.20', 1260],
    ['10−2.5', 750],
    ['2+3×4', 1400], // precedence
    ['100÷3', 3333],
    ['0.1+0.2', 30], // exact, no float drift
    ['12+', 1200], // trailing operator ignored while typing
    ['1,000+1', 100100],
    ['0.125×2', 25],
    ['0.005×1', 0], // 0.5 sen → 0 (half-even)
    ['0.015×1', 2], // 1.5 sen → 2
  ])('%s → %d', (expr, minor) => {
    expect(evaluateToMinor(expr, 2)).toBe(minor);
  });

  it.each(['', '+', '1++2', '5÷0', 'abc', '1..2', '.'])('invalid %p → null', (expr) => {
    expect(evaluateToMinor(expr, 2)).toBeNull();
  });

  it('zero-exponent currencies', () => {
    expect(evaluateToMinor('1000÷3', 0)).toBe(333);
  });

  it('can be negative (caller rejects)', () => {
    expect(evaluateToMinor('5−8', 2)).toBe(-300);
  });
});

describe('applyKey', () => {
  const type = (keys: Key[], exp = 2) => keys.reduce((e, k) => applyKey(e, k, exp), '');

  it('builds expressions', () => {
    expect(type(['1', '2', '.', '5', '0', '+', '8'])).toBe('12.50+8');
  });
  it('limits decimals to the currency exponent', () => {
    expect(type(['1', '.', '2', '3', '4'])).toBe('1.23');
    expect(type(['1', '.', '2'], 0)).toBe('12');
  });
  it('leading dot becomes 0.', () => expect(type(['.', '5'])).toBe('0.5'));
  it('one dot per number', () => expect(type(['1', '.', '.', '2', '+', '3', '.', '4'])).toBe('1.2+3.4'));
  it('operators replace operators and cannot lead', () => {
    expect(type(['+'])).toBe('');
    expect(type(['5', '+', '×'])).toBe('5×');
    expect(type(['5', '.', '+'])).toBe('5+');
  });
  it('no leading zeros', () => expect(type(['0', '0', '7'])).toBe('7'));
  it('back and clear', () => {
    expect(type(['1', '2', 'back'])).toBe('1');
    expect(type(['1', '2', 'clear'])).toBe('');
  });
  it('hasOperator', () => {
    expect(hasOperator('12+3')).toBe(true);
    expect(hasOperator('12.3')).toBe(false);
  });
});
