/**
 * UUID v7 (RFC 9562): 48-bit Unix ms timestamp + random bits.
 * Time-ordered ids keep SQLite B-tree inserts cheap and are unique across devices (for sync).
 * The random source is injectable so tests and Node can provide one.
 */
type RandomFn = (bytes: Uint8Array) => Uint8Array;

/**
 * Default: the Web Crypto global. React Native (Hermes) and Expo do NOT provide one, so the app
 * must call setRandomSource() at startup. openAppDatabase() does this via installNativeRandomSource().
 */
const globalCryptoSource: RandomFn = (bytes) => {
  const c = (globalThis as { crypto?: { getRandomValues?: (b: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) return c.getRandomValues(bytes);
  throw new Error('No secure random source configured; call setRandomSource()');
};

let randomFill: RandomFn = globalCryptoSource;

export function setRandomSource(fn: RandomFn): void {
  randomFill = fn;
}

/** Restore the default (global crypto) source. Tests use it to reproduce a runtime without `crypto`. */
export function resetRandomSource(): void {
  randomFill = globalCryptoSource;
}

export function uuidv7(now: number = Date.now()): string {
  const b = randomFill(new Uint8Array(16));
  let ts = now;
  for (let i = 5; i >= 0; i--) {
    b[i] = ts % 256;
    ts = Math.floor(ts / 256);
  }
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
