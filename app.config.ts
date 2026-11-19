import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Notes:
 * - SQLCipher (`useSQLCipher`) means this app needs a development build
 *   (`npx expo run:android|ios` or EAS); it cannot run in Expo Go.
 * - android.allowBackup is off: the DB key lives in the Android Keystore and does not
 *   survive a cloud restore, so a restored DB file would be unreadable anyway.
 *   Encrypted backup/restore is a later-phase feature.
 */
/** EAS project (expo.dev/@bangmansur/marikira). */
export const EAS_PROJECT_ID = '80c1111d-0672-4a86-bef5-c09186a466aa';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'MariKira',
  slug: 'marikira',
  owner: 'bangmansur',
  scheme: 'marikira',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'app.marikira',
    supportsTablet: true,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: 'app.marikira',
    allowBackup: false,
    adaptiveIcon: {
      backgroundColor: '#0B7A5C',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: { favicon: './assets/favicon.png' },
  // EAS Update. "sdkVersion" → runtime "exposdk:58.0.0", the runtime Expo Go accepts, so
  // `eas update --channel preview` can be opened in Expo Go (test mode: unencrypted, demo data).
  // Before shipping OTA updates to real (SQLCipher) builds, switch to { policy: 'fingerprint' }
  // so an update can never land on a build with different native code.
  runtimeVersion: { policy: 'sdkVersion' },
  updates: {
    url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
  },
  extra: {
    ...config.extra,
    eas: { projectId: EAS_PROJECT_ID },
  },
  plugins: [
    'expo-router',
    ['expo-sqlite', { useSQLCipher: true }],
    ['expo-secure-store', { faceIDPermission: 'Allow MariKira to use Face ID to unlock the app.' }],
    ['expo-local-authentication', { faceIDPermission: 'Allow MariKira to use Face ID to unlock the app.' }],
    'expo-localization',
    [
      '@sentry/react-native/expo',
      {
        // Upload of source maps only happens when these are set in the build environment.
        organization: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
      },
    ],
  ],
  experiments: { typedRoutes: false },
});
