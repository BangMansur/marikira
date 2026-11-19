/**
 * Proves the encryption guarantees:
 * 1. Only Expo Go ('storeClient') selects unencrypted test mode. Dev builds ('bare'),
 *    store/preview builds ('standalone') and any unknown value always use SQLCipher.
 * 2. In encrypted mode, the key is set before anything else, and the app refuses to open
 *    if SQLCipher isn't really compiled in (plain SQLite silently ignores PRAGMA key).
 * 3. The native build config enables SQLCipher for every build profile.
 */
import appConfig from '../../../app.config';
import { DatabaseKeyError, EncryptionUnavailableError, openAppDatabase, TEST_DB_NAME } from '../expoDb';
import { getRuntimeMode, resolveRuntimeMode } from '@/runtime';

// ---- native module mocks -------------------------------------------------------------
const mockConstants = { executionEnvironment: 'standalone' as string | undefined };
jest.mock('expo-constants', () => ({
  __esModule: true,
  get default() {
    return mockConstants;
  },
}));

const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockStore.delete(k)),
}));

jest.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => new Uint8Array(n).fill(0xab) }));

interface FakeDb {
  name: string;
  statements: string[];
  closed: boolean;
}
const mockSqlite = { cipherVersion: '4.6.1 community' as string | null, opened: [] as FakeDb[], keyMatches: true };
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async (name: string) => {
    const db: FakeDb = { name, statements: [], closed: false };
    mockSqlite.opened.push(db);
    return {
      execAsync: async (sql: string) => void db.statements.push(sql),
      getFirstAsync: async (sql: string) => {
        db.statements.push(sql);
        if (sql === 'PRAGMA cipher_version') return mockSqlite.cipherVersion ? { cipher_version: mockSqlite.cipherVersion } : null;
        if (sql.includes('sqlite_master') && !mockSqlite.keyMatches) throw new Error('file is not a database');
        return { n: 0 };
      },
      closeAsync: async () => {
        db.closed = true;
      },
    };
  }),
  deleteDatabaseAsync: jest.fn(),
}));

const SecureStore = jest.requireMock('expo-secure-store') as { getItemAsync: jest.Mock; setItemAsync: jest.Mock };

beforeEach(() => {
  mockStore.clear();
  mockSqlite.opened = [];
  mockSqlite.cipherVersion = '4.6.1 community';
  mockSqlite.keyMatches = true;
  jest.clearAllMocks();
});

// ---- 1. mode resolution -------------------------------------------------------------
describe('runtime mode', () => {
  it('only Expo Go selects unencrypted test mode', () => {
    expect(resolveRuntimeMode('storeClient')).toBe('expo-go-test');
  });

  it.each([
    ['bare', 'development build'],
    ['standalone', 'preview / production build'],
    [undefined, 'missing value'],
    [null, 'null value'],
    ['', 'empty value'],
    ['StoreClient', 'different casing'],
    ['something-new', 'unknown future value'],
  ])('%p (%s) → encrypted (fail closed)', (env, _why) => {
    expect(resolveRuntimeMode(env)).toBe('encrypted');
  });

  it('reads Constants.executionEnvironment', () => {
    mockConstants.executionEnvironment = 'storeClient';
    expect(getRuntimeMode()).toBe('expo-go-test');
    mockConstants.executionEnvironment = 'bare';
    expect(getRuntimeMode()).toBe('encrypted');
  });
});

// ---- 2. opening the database --------------------------------------------------------
describe.each([
  ['bare', 'development build'],
  ['standalone', 'production build'],
])('%s (%s) always opens with SQLCipher', (env) => {
  beforeEach(() => {
    mockConstants.executionEnvironment = env;
  });

  it('sets a 256-bit key as the very first statement, then verifies SQLCipher', async () => {
    await openAppDatabase();
    expect(mockSqlite.opened).toHaveLength(1);
    const db = mockSqlite.opened[0];
    expect(db.name).toBe('marikira.db');
    expect(db.statements[0]).toMatch(/^PRAGMA key = "x'[0-9a-f]{64}'";$/);
    expect(db.statements[1]).toBe('PRAGMA cipher_version');
    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1); // key generated and kept in the keystore
  });

  it('refuses to open if the build lacks SQLCipher (never falls back to plaintext)', async () => {
    mockSqlite.cipherVersion = null;
    await expect(openAppDatabase()).rejects.toBeInstanceOf(EncryptionUnavailableError);
    const db = mockSqlite.opened[0];
    expect(db.closed).toBe(true);
    expect(db.statements).not.toContain('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  });

  it('reports a wrong key distinctly', async () => {
    mockSqlite.keyMatches = false;
    await expect(openAppDatabase()).rejects.toBeInstanceOf(DatabaseKeyError);
  });
});

describe('Expo Go test mode', () => {
  it('uses a separate plain file, sets no key and touches no keystore', async () => {
    mockConstants.executionEnvironment = 'storeClient';
    await openAppDatabase();
    const db = mockSqlite.opened[0];
    expect(db.name).toBe(TEST_DB_NAME);
    expect(db.name).not.toBe('marikira.db');
    expect(db.statements.some((s) => s.includes('PRAGMA key'))).toBe(false);
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });
});

// ---- 3. native build configuration ---------------------------------------------------
describe('app.config.ts', () => {
  const sqlitePlugin = () => {
    const cfg = appConfig({ config: {}, projectRoot: process.cwd(), staticConfigPath: null, packageJsonPath: null });
    const entry = (cfg.plugins ?? []).find((p) => (Array.isArray(p) ? p[0] : p) === 'expo-sqlite');
    return entry as [string, { useSQLCipher?: boolean; ios?: { useSQLCipher?: boolean }; android?: { useSQLCipher?: boolean } }];
  };

  it.each(['development', 'preview', 'production', undefined])('EAS profile %p compiles SQLCipher in', (profile) => {
    const prev = process.env.EAS_BUILD_PROFILE;
    if (profile) process.env.EAS_BUILD_PROFILE = profile;
    else delete process.env.EAS_BUILD_PROFILE;
    try {
      const [, opts] = sqlitePlugin();
      expect(opts.useSQLCipher).toBe(true);
      // No per-platform override may switch it off.
      expect(opts.ios?.useSQLCipher).not.toBe(false);
      expect(opts.android?.useSQLCipher).not.toBe(false);
    } finally {
      if (prev === undefined) delete process.env.EAS_BUILD_PROFILE;
      else process.env.EAS_BUILD_PROFILE = prev;
    }
  });
});
