/**
 * Reproduces the Expo Go startup failure ("Can't open your data") and proves the fix.
 *
 * Runs the REAL startup path: openAppDatabase('expo-go-test') → ExpoSqlDb (the expo-sqlite
 * adapter, incl. withExclusiveTransactionAsync) → migrations → PRAGMAs → seeding. The
 * expo-sqlite module is replaced by a shim over a real SQLite engine (better-sqlite3), and
 * `globalThis.crypto` is removed to match Hermes, which has no Web Crypto global.
 */
import { randomFillSync } from 'crypto';
import Database from 'better-sqlite3';
import { resetRandomSource, setRandomSource, uuidv7 } from '@/core/id';
import { bootstrapDatabase } from '@/db/seed/bootstrap';
import { createTestDb } from '@/db/testDb';
import { loadDemoData } from '@/db/seed/demo';
import { getDashboard } from '@/features/reports/reports.repo';
import { getSettings } from '@/features/settings/settings.repo';
import { EncryptionUnavailableError, openAppDatabase, TEST_DB_NAME } from '../expoDb';

// ---- expo-sqlite shim over a real SQLite engine --------------------------------------
type Params = (string | number | null)[];
const mockOpened: { name: string; statements: string[] }[] = [];

jest.mock('expo-sqlite', () => {
  const BetterSqlite = jest.requireActual('better-sqlite3') as typeof Database;
  // Like expo-sqlite: statements that return no rows (e.g. an unknown PRAGMA) give null / [].
  const reader = (db: Database.Database, sql: string, params: Params, all: boolean) => {
    const stmt = db.prepare(sql);
    if (!stmt.reader) {
      stmt.run(...params);
      return all ? [] : null;
    }
    return all ? stmt.all(...params) : (stmt.get(...params) ?? null);
  };
  function wrap(db: Database.Database, log: string[]) {
    const api = {
      execAsync: async (sql: string) => {
        log.push(sql);
        db.exec(sql);
      },
      runAsync: async (sql: string, params: Params = []) => {
        log.push(sql);
        const r = db.prepare(sql).run(...params);
        return { changes: r.changes, lastInsertRowId: Number(r.lastInsertRowid) };
      },
      getAllAsync: async (sql: string, params: Params = []) => {
        log.push(sql);
        return reader(db, sql, params, true);
      },
      getFirstAsync: async (sql: string, params: Params = []) => {
        log.push(sql);
        return reader(db, sql, params, false);
      },
      closeAsync: async () => db.close(),
      withExclusiveTransactionAsync: async (task: (txn: unknown) => Promise<void>) => {
        db.exec('BEGIN EXCLUSIVE');
        try {
          await task(api);
          db.exec('COMMIT');
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
      },
    };
    return api;
  }
  return {
    openDatabaseAsync: async (name: string) => {
      const entry = { name, statements: [] as string[] };
      mockOpened.push(entry);
      return wrap(new BetterSqlite(':memory:'), entry.statements);
    },
    deleteDatabaseAsync: async () => undefined,
  };
});

// expo-crypto (bundled in Expo Go) backed by Node's CSPRNG.
const mockCryptoCalls = { n: 0 };
jest.mock('expo-crypto', () => ({
  getRandomValues: (b: Uint8Array) => {
    mockCryptoCalls.n++;
    return (jest.requireActual('crypto') as typeof import('crypto')).randomFillSync(b);
  },
  getRandomBytes: (n: number) => (jest.requireActual('crypto') as typeof import('crypto')).randomFillSync(new Uint8Array(n)),
}));
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

// ---- simulate Hermes: no Web Crypto global, no random source installed --------------
const realCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
beforeEach(() => {
  mockOpened.length = 0;
  mockCryptoCalls.n = 0;
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
  resetRandomSource();
});
afterEach(() => {
  if (realCrypto) Object.defineProperty(globalThis, 'crypto', realCrypto);
  setRandomSource((b) => randomFillSync(b)); // restore the Jest setup default
});

describe('root cause: no random source in React Native', () => {
  it('reproduces the device failure: bootstrap throws on the first insert', async () => {
    const db = await createTestDb(); // bypasses openAppDatabase, like the old app did
    await expect(bootstrapDatabase(db, (k) => k)).rejects.toThrow('No secure random source configured');
    expect(() => uuidv7()).toThrow('No secure random source configured');
  });
});

describe('Expo Go startup (test mode), end to end', () => {
  it('opens, migrates, seeds and loads demo data with expo-crypto as the random source', async () => {
    const db = await openAppDatabase('expo-go-test');
    const ctx = await bootstrapDatabase(db, (k) => k);

    expect(mockCryptoCalls.n).toBeGreaterThan(0); // ids come from expo-crypto
    expect(mockOpened.map((o) => o.name)).toEqual([TEST_DB_NAME]);
    const sql = mockOpened[0].statements;
    // Test mode never runs the SQLCipher key step or check.
    expect(sql.some((s) => /PRAGMA key|cipher_version/i.test(s))).toBe(false);
    // The PRAGMAs it does run are supported by expo-sqlite's SQLite and actually took effect.
    expect(await db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
    expect(await db.get<{ user_version: number }>('PRAGMA user_version')).toEqual({ user_version: 1 });

    const cats = await db.get<{ n: number }>('SELECT count(*) AS n FROM categories');
    expect(cats!.n).toBeGreaterThan(20);
    const demo = await loadDemoData(ctx, '2026-11-19');
    expect(demo.transactions).toBeGreaterThan(250);
    const d = await getDashboard(ctx, await getSettings(ctx), '2026-11-19');
    expect(d.flow.moneyIn).toBeGreaterThan(0);
  });

  it('can be opened again (restart) without re-running migrations', async () => {
    const db = await openAppDatabase('expo-go-test');
    await bootstrapDatabase(db, (k) => k);
    await expect(bootstrapDatabase(db, (k) => k)).resolves.toBeTruthy();
  });

  it('real SQLite without SQLCipher is detected in encrypted mode (no silent plaintext)', async () => {
    await expect(openAppDatabase('encrypted')).rejects.toBeInstanceOf(EncryptionUnavailableError);
  });
});
