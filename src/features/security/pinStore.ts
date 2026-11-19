import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { hashPin, lockoutMs, type PinRecord, verifyPin } from './pinCrypto';

const PIN_KEY = 'marikira.pin.v1';
const ATTEMPTS_KEY = 'marikira.pin.attempts.v1';
const opts = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

interface Attempts {
  failures: number;
  lockedUntil: number;
}

export async function hasPin(): Promise<boolean> {
  return (await SecureStore.getItemAsync(PIN_KEY, opts)) != null;
}

/** PIN length (4–6), so the pad only checks a complete entry and partial input never counts as a failure. */
export async function getPinLength(): Promise<number | null> {
  const raw = await SecureStore.getItemAsync(PIN_KEY, opts);
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as { length?: number }).length ?? null;
  } catch {
    return null;
  }
}

export async function setPin(pin: string): Promise<void> {
  const record = await hashPin(pin, Crypto.getRandomBytes(16));
  await SecureStore.setItemAsync(PIN_KEY, JSON.stringify({ ...record, length: pin.length }), opts);
  await SecureStore.deleteItemAsync(ATTEMPTS_KEY, opts);
}

export async function clearPin(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_KEY, opts);
  await SecureStore.deleteItemAsync(ATTEMPTS_KEY, opts);
}

async function getAttempts(): Promise<Attempts> {
  const raw = await SecureStore.getItemAsync(ATTEMPTS_KEY, opts);
  if (!raw) return { failures: 0, lockedUntil: 0 };
  try {
    return JSON.parse(raw) as Attempts;
  } catch {
    return { failures: 0, lockedUntil: 0 };
  }
}

export type PinCheck = { ok: true } | { ok: false; lockedForMs: number };

export async function checkPin(pin: string, now = Date.now()): Promise<PinCheck> {
  const attempts = await getAttempts();
  if (attempts.lockedUntil > now) return { ok: false, lockedForMs: attempts.lockedUntil - now };
  const raw = await SecureStore.getItemAsync(PIN_KEY, opts);
  if (!raw) return { ok: true };
  const ok = await verifyPin(pin, JSON.parse(raw) as PinRecord);
  if (ok) {
    await SecureStore.deleteItemAsync(ATTEMPTS_KEY, opts);
    return { ok: true };
  }
  const failures = attempts.failures + 1;
  const wait = lockoutMs(failures);
  await SecureStore.setItemAsync(ATTEMPTS_KEY, JSON.stringify({ failures, lockedUntil: now + wait }), opts);
  return { ok: false, lockedForMs: wait };
}

export async function biometricsAvailable(): Promise<boolean> {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

export async function authenticateBiometric(prompt: string, fallbackLabel: string): Promise<boolean> {
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: prompt,
      fallbackLabel,
      disableDeviceFallback: true,
      cancelLabel: fallbackLabel,
    });
    return r.success;
  } catch {
    return false;
  }
}
