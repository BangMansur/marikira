/**
 * Detox E2E. Requires native projects: run `npx expo prebuild` first (CNG), then
 *   npm run e2e:build:android && npm run e2e:test:android
 * Android emulator AVD name defaults to "Pixel_7_API_35" (override with DETOX_AVD).
 */
/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: { args: { $0: 'jest', config: 'e2e/jest.config.js' }, jest: { setupTimeout: 180000 } },
  apps: {
    'android.release': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/release/app-release.apk',
      testBinaryPath: 'android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk',
      build: 'cd android && ./gradlew assembleRelease assembleAndroidTest -DtestBuildType=release && cd ..',
    },
    'ios.release': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Release-iphonesimulator/MariKira.app',
      build:
        'xcodebuild -workspace ios/MariKira.xcworkspace -scheme MariKira -configuration Release -sdk iphonesimulator -derivedDataPath ios/build',
    },
  },
  devices: {
    emulator: { type: 'android.emulator', device: { avdName: process.env.DETOX_AVD || 'Pixel_7_API_35' } },
    simulator: { type: 'ios.simulator', device: { type: process.env.DETOX_IOS_DEVICE || 'iPhone 16' } },
  },
  configurations: {
    'android.emu.release': { device: 'emulator', app: 'android.release' },
    'ios.sim.release': { device: 'simulator', app: 'ios.release' },
  },
};
