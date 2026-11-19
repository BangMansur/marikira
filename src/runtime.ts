import Constants from 'expo-constants';

/**
 * Runtime mode.
 *
 * - 'encrypted' (dev builds, preview and production builds): SQLCipher, biometrics, crash reporting.
 * - 'expo-go-test' (Expo Go only): plain SQLite, PIN-only lock, demo data, permanent warning banner.
 *
 * Fail closed: ONLY the exact Expo Go value ('storeClient') selects test mode. Anything else,
 * including an unknown or missing value, means encrypted. A real build can never fall into
 * the unencrypted path by accident.
 */
export type RuntimeMode = 'encrypted' | 'expo-go-test';

export const EXPO_GO_ENVIRONMENT = 'storeClient';

export function resolveRuntimeMode(executionEnvironment: string | null | undefined): RuntimeMode {
  return executionEnvironment === EXPO_GO_ENVIRONMENT ? 'expo-go-test' : 'encrypted';
}

export function getRuntimeMode(): RuntimeMode {
  return resolveRuntimeMode(Constants.executionEnvironment);
}

export function isExpoGoTestMode(): boolean {
  return getRuntimeMode() === 'expo-go-test';
}
