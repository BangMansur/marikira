/**
 * EAS Update + Expo Go compatibility guardrails.
 * - The project is linked to the right EAS project and owner.
 * - Updates are served from that project's URL with an Expo Go-compatible runtime.
 * - The preview build profile publishes to the `preview` channel.
 * - Every native dependency stays on the version Expo SDK 58 (and its Expo Go) bundles.
 */
import fs from 'fs';
import path from 'path';
import semver from 'semver';
import appConfig, { EAS_PROJECT_ID } from '../../../app.config';

const root = path.join(__dirname, '..', '..', '..');
const cfg = appConfig({ config: {}, projectRoot: root, staticConfigPath: null, packageJsonPath: null });
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));

describe('EAS Update configuration', () => {
  it('links the EAS project and owner', () => {
    expect(EAS_PROJECT_ID).toBe('80c1111d-0672-4a86-bef5-c09186a466aa');
    expect(cfg.owner).toBe('bangmansur');
    expect(cfg.extra?.eas?.projectId).toBe(EAS_PROJECT_ID);
  });

  it('serves updates from the project URL', () => {
    expect(cfg.updates?.url).toBe('https://u.expo.dev/80c1111d-0672-4a86-bef5-c09186a466aa');
  });

  it('uses the sdkVersion runtime policy (exposdk:<sdk>), which Expo Go accepts', () => {
    expect(cfg.runtimeVersion).toEqual({ policy: 'sdkVersion' });
    // No platform override may switch Android or iOS to a different runtime.
    expect(cfg.ios?.runtimeVersion).toBeUndefined();
    expect(cfg.android?.runtimeVersion).toBeUndefined();
  });

  it('publishes preview builds to the preview channel', () => {
    const eas = readJson('eas.json');
    expect(eas.build.preview.channel).toBe('preview');
  });

  it('keeps SQLCipher on for native builds', () => {
    const sqlite = (cfg.plugins ?? []).find((p) => Array.isArray(p) && p[0] === 'expo-sqlite') as [string, { useSQLCipher: boolean }];
    expect(sqlite[1].useSQLCipher).toBe(true);
  });
});

describe('Expo SDK 58 / Expo Go native module versions', () => {
  it('every dependency Expo bundles matches the SDK 58 version (expo-updates included)', () => {
    const pkg = readJson('package.json');
    const bundled: Record<string, string> = readJson('node_modules/expo/bundledNativeModules.json');
    expect(readJson('node_modules/expo/package.json').version).toMatch(/^58\./);
    expect(pkg.dependencies['expo-updates']).toBeDefined();
    const mismatches = Object.keys(pkg.dependencies)
      .filter((name) => bundled[name])
      .map((name) => [name, readJson(`node_modules/${name}/package.json`).version as string, bundled[name]] as const)
      .filter(([, installed, wanted]) => !semver.satisfies(installed, wanted))
      .map(([name, installed, wanted]) => `${name}@${installed} (SDK 58 wants ${wanted})`);
    expect(mismatches).toEqual([]);
  });
});
