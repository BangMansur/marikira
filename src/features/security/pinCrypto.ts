import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';

/**
 * PIN hashing: PBKDF2-HMAC-SHA256 with a random 16-byte salt. The record lives in the
 * OS keystore (expo-secure-store), never in the database. A 4–6 digit PIN has little
 * entropy, so the real protection is the keystore plus the attempt lockout below;
 * the KDF stops a leaked record from being reversed instantly.
 */
export const PIN_ITERATIONS = 30_000;
export const PIN_MIN = 4;
export const PIN_MAX = 6;

export interface PinRecord {
  v: 1;
  salt: string; // hex
  hash: string; // hex
  iterations: number;
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => new Uint8Array(s.match(/../g)!.map((h) => parseInt(h, 16)));

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin);
}

export async function hashPin(pin: string, salt: Uint8Array, iterations = PIN_ITERATIONS): Promise<PinRecord> {
  if (!isValidPin(pin)) throw new Error('Invalid PIN format');
  const dk = await pbkdf2Async(sha256, utf8ToBytes(pin) /* no TextEncoder dependency on Hermes */, salt, { c: iterations, dkLen: 32, asyncTick: 10 });
  return { v: 1, salt: hex(salt), hash: hex(dk), iterations };
}

/** Constant-time comparison of the derived key. */
export async function verifyPin(pin: string, record: PinRecord): Promise<boolean> {
  if (!isValidPin(pin)) return false;
  const candidate = await hashPin(pin, unhex(record.salt), record.iterations);
  const a = unhex(candidate.hash);
  const b = unhex(record.hash);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Lockout after repeated failures: 5 free tries, then 30 s doubling up to 1 hour. */
export function lockoutMs(failures: number): number {
  if (failures < 5) return 0;
  return Math.min(30_000 * 2 ** (failures - 5), 3_600_000);
}

/** Auto-lock decision: lock if the app was in the background at least `timeoutSec`. */
export function shouldAutoLock(backgroundedAt: number | null, now: number, timeoutSec: number): boolean {
  if (backgroundedAt == null) return false;
  if (timeoutSec <= 0) return true;
  return now - backgroundedAt >= timeoutSec * 1000;
}
