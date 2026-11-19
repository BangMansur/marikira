import { hashPin, isValidPin, lockoutMs, shouldAutoLock, verifyPin } from '../pinCrypto';

const salt = new Uint8Array(16).fill(7);

describe('PIN hashing', () => {
  it('validates format', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('123456')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('1234567')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
  });

  it('hashes deterministically per salt and verifies', async () => {
    const rec = await hashPin('2580', salt, 1000);
    expect(rec.hash).toHaveLength(64);
    expect(rec.hash).not.toContain('2580');
    expect(await verifyPin('2580', rec)).toBe(true);
    expect(await verifyPin('2581', rec)).toBe(false);
    expect(await verifyPin('abc', rec)).toBe(false);
    const other = await hashPin('2580', new Uint8Array(16).fill(8), 1000);
    expect(other.hash).not.toBe(rec.hash);
  });
});

describe('lockout', () => {
  it('5 free attempts then doubling, capped at 1 hour', () => {
    expect(lockoutMs(4)).toBe(0);
    expect(lockoutMs(5)).toBe(30_000);
    expect(lockoutMs(6)).toBe(60_000);
    expect(lockoutMs(20)).toBe(3_600_000);
  });
});

describe('auto-lock', () => {
  it('locks after the timeout, immediately when timeout is 0', () => {
    expect(shouldAutoLock(null, 10_000, 60)).toBe(false);
    expect(shouldAutoLock(0, 59_999, 60)).toBe(false);
    expect(shouldAutoLock(0, 60_000, 60)).toBe(true);
    expect(shouldAutoLock(0, 1, 0)).toBe(true);
  });
});
