import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { getRuntimeMode, type RuntimeMode } from '@/runtime';
import type { SqlDb, SqlParams } from './adapter';

/**
 * On-device database: expo-sqlite compiled with SQLCipher (see app.config.ts plugin
 * option `useSQLCipher: true`). The 256-bit key is random per install and lives only
 * in the OS keystore/keychain via expo-secure-store; it never touches JS storage or logs.
 */
const DB_NAME = 'marikira.db';
const KEY_NAME = 'marikira.db.key.v1';

type Executor = Pick<SQLite.SQLiteDatabase, 'runAsync' | 'getAllAsync' | 'getFirstAsync' | 'execAsync'>;

class ExpoSqlDb implements SqlDb {
  /** Serialises write transactions: expo-sqlite rejects concurrent writers with "database is locked". */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly exec_: Executor,
    private readonly root: SQLite.SQLiteDatabase | null,
  ) {}

  async run(sql: string, params: SqlParams = []) {
    if (this.root) return this.transaction((tx) => tx.run(sql, params));
    const r = await this.exec_.runAsync(sql, params as SQLite.SQLiteBindValue[]);
    return { changes: r.changes };
  }
  async all<T>(sql: string, params: SqlParams = []) {
    return this.exec_.getAllAsync<T>(sql, params as SQLite.SQLiteBindValue[]);
  }
  async get<T>(sql: string, params: SqlParams = []) {
    const r = await this.exec_.getFirstAsync<T>(sql, params as SQLite.SQLiteBindValue[]);
    return r ?? undefined;
  }
  async exec(sql: string) {
    await this.exec_.execAsync(sql);
  }
  async close(): Promise<void> {
    await this.queue;
    await this.root?.closeAsync();
  }
  async transaction<T>(fn: (tx: SqlDb) => Promise<T>): Promise<T> {
    if (!this.root) return fn(this); // already inside a transaction
    const root = this.root;
    const job = this.queue.then(async () => {
      let result!: T;
      await root.withExclusiveTransactionAsync(async (txn) => {
        result = await fn(new ExpoSqlDb(txn, null));
      });
      return result;
    });
    this.queue = job.catch(() => undefined);
    return job;
  }
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function getOrCreateKey(): Promise<string> {
  const opts = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
  let key = await SecureStore.getItemAsync(KEY_NAME, opts);
  if (!key) {
    key = toHex(Crypto.getRandomBytes(32));
    await SecureStore.setItemAsync(KEY_NAME, key, opts);
  }
  return key;
}

export class DatabaseKeyError extends Error {}

/** The native build has no SQLCipher. Opening is refused rather than storing plaintext. */
export class EncryptionUnavailableError extends Error {}

/** Expo Go test mode uses its own unencrypted file, so it never touches a real encrypted DB. */
export const TEST_DB_NAME = 'marikira-expogo-test.db';

export function databaseNameFor(mode: RuntimeMode): string {
  return mode === 'expo-go-test' ? TEST_DB_NAME : DB_NAME;
}

/**
 * Opens the app database for the current runtime mode.
 * - encrypted (every dev/preview/production build): SQLCipher key, then proof that SQLCipher is
 *   really compiled in. Plain SQLite silently ignores `PRAGMA key`, so without this check a
 *   misconfigured build would write plaintext with no error. Fail closed.
 * - expo-go-test (Expo Go only): plain expo-sqlite, no key, separate file.
 */
export async function openAppDatabase(mode: RuntimeMode = getRuntimeMode()): Promise<SqlDb> {
  if (mode === 'expo-go-test') {
    const db = await SQLite.openDatabaseAsync(TEST_DB_NAME);
    await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    return new ExpoSqlDb(db, db);
  }

  const key = await getOrCreateKey();
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  // Raw 256-bit key (no KDF): must be the first statement on the connection.
  await db.execAsync(`PRAGMA key = "x'${key}'";`);
  const cipher = await db.getFirstAsync<{ cipher_version?: string | null }>('PRAGMA cipher_version');
  if (!cipher?.cipher_version) {
    await db.closeAsync();
    throw new EncryptionUnavailableError('SQLCipher is not available in this build; refusing to open an unencrypted database.');
  }
  try {
    // Fails with "file is not a database" if the key does not match the file.
    await db.getFirstAsync('SELECT count(*) AS n FROM sqlite_master');
  } catch (e) {
    await db.closeAsync();
    throw new DatabaseKeyError(e instanceof Error ? e.message : 'Unable to unlock database');
  }
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  return new ExpoSqlDb(db, db);
}

/** PDPA/GDPR "delete everything": removes the DB file and its key. */
export async function destroyAppDatabase(current?: SqlDb, mode: RuntimeMode = getRuntimeMode()): Promise<void> {
  if (current instanceof ExpoSqlDb) {
    try {
      await current.close();
    } catch {
      // already closed — we delete the file regardless
    }
  }
  try {
    await SQLite.deleteDatabaseAsync(databaseNameFor(mode));
  } catch {
    // file may not exist yet
  }
  if (mode === 'encrypted') await SecureStore.deleteItemAsync(KEY_NAME);
}
