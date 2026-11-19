import * as Crypto from 'expo-crypto';
import { setRandomSource } from '@/core/id';

/**
 * Hermes/React Native has no `globalThis.crypto`, so IDs would fail to generate
 * ("No secure random source configured") on the very first insert. expo-crypto is part
 * of Expo Go and every build, and fills bytes from the OS CSPRNG.
 */
export function installNativeRandomSource(): void {
  setRandomSource((bytes) => Crypto.getRandomValues(bytes));
}
