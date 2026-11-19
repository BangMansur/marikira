/**
 * Native-module shims for full-app tests. Each one is backed by something real:
 * - expo-sqlite → a real SQLite engine (better-sqlite3, in memory), mimicking expo-sqlite's API
 *   (null/[] for statements that return no rows; exclusive transactions).
 * - expo-secure-store → an in-memory keystore.
 * - expo-crypto → Node's CSPRNG.
 *
 * Usage (jest.mock factories are hoisted, so require inside them):
 *   jest.mock('expo-sqlite', () => require('@/test/nativeShims').expoSqliteShim());
 */
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories need lazy require */
type Params = (string | number | null)[];
type BetterDb = import('better-sqlite3').Database;

export const sqliteState: {
  opened: { name: string; statements: string[]; db: BetterDb }[];
  deleted: string[];
  /** Simulate a SQLCipher build: answer PRAGMA cipher_version (the key PRAGMA is a no-op here). */
  sqlcipher: boolean;
} = { opened: [], deleted: [], sqlcipher: false };

/** Files persist across open/close (like a device), until deleteDatabaseAsync. */
const files = new Map<string, BetterDb>();

export function resetNativeShims(): void {
  for (const db of files.values()) if (db.open) db.close();
  files.clear();
  sqliteState.opened = [];
  sqliteState.deleted = [];
  sqliteState.sqlcipher = false;
  secureStore.clear();
}

function reader(db: BetterDb, sql: string, params: Params, all: boolean) {
  if (sqliteState.sqlcipher && /^PRAGMA cipher_version$/i.test(sql.trim())) {
    const row = { cipher_version: '4.6.1 community (test shim)' };
    return all ? [row] : row;
  }
  const stmt = db.prepare(sql);
  if (!stmt.reader) {
    stmt.run(...params);
    return all ? [] : null;
  }
  return all ? stmt.all(...params) : (stmt.get(...params) ?? null);
}

export function expoSqliteShim() {
  const Database = require('better-sqlite3') as typeof import('better-sqlite3');
  const wrap = (db: BetterDb, log: string[]) => {
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
      closeAsync: async () => undefined, // keep the in-memory "file"; deleteDatabaseAsync drops it
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
  };
  return {
    openDatabaseAsync: async (name: string) => {
      let db = files.get(name);
      if (!db || !db.open) {
        db = new Database(':memory:');
        files.set(name, db);
      }
      const entry = { name, statements: [] as string[], db };
      sqliteState.opened.push(entry);
      return wrap(db, entry.statements);
    },
    deleteDatabaseAsync: async (name: string) => {
      sqliteState.deleted.push(name);
      const db = files.get(name);
      if (db?.open) db.close();
      files.delete(name);
    },
  };
}

const secureStore = new Map<string, string>();
export function secureStoreShim() {
  return {
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 2,
    getItemAsync: async (k: string) => secureStore.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => void secureStore.set(k, v),
    deleteItemAsync: async (k: string) => void secureStore.delete(k),
  };
}
export const secureStoreContents = secureStore;

export function expoCryptoShim() {
  const { randomFillSync } = require('crypto') as typeof import('crypto');
  return {
    getRandomValues: <T extends Uint8Array>(b: T) => randomFillSync(b),
    getRandomBytes: (n: number) => randomFillSync(new Uint8Array(n)),
  };
}
