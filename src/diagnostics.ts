import { getRuntimeMode, type RuntimeMode } from './runtime';

/**
 * Developer diagnostics for Expo Go test mode.
 *
 * Shown and logged ONLY when both are true:
 *  - the app runs in Expo Go test mode (unencrypted, demo data only), and
 *  - it is a development bundle (__DEV__).
 * Dev builds, preview and production builds never show or log error details,
 * so no financial data can leak through error messages there.
 */
export interface ErrorDetails {
  name: string;
  message: string;
  code: string | null;
  stack: string | null;
}

export function describeError(e: unknown): ErrorDetails {
  if (e instanceof Error) {
    const code = (e as { code?: unknown }).code;
    return {
      name: e.name || 'Error',
      message: e.message,
      code: code == null ? null : String(code),
      stack: e.stack ?? null,
    };
  }
  return { name: typeof e, message: String(e), code: null, stack: null };
}

export function diagnosticsEnabled(mode: RuntimeMode = getRuntimeMode(), dev: boolean = __DEV__): boolean {
  return mode === 'expo-go-test' && dev === true;
}

export function formatErrorDetails(d: ErrorDetails): string {
  return [`${d.name}: ${d.message}`, d.code ? `code: ${d.code}` : null, d.stack].filter(Boolean).join('\n\n');
}

/** Logs a startup error to Metro, in test mode + __DEV__ only. */
export function reportStartupError(e: unknown, enabled: boolean = diagnosticsEnabled()): void {
  if (!enabled) return;
  // eslint-disable-next-line no-console -- Expo Go test mode + __DEV__ only (demo data, no real finances)
  console.error('[MariKira test mode] Could not open the database:\n' + formatErrorDetails(describeError(e)));
}
