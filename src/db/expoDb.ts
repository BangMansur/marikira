import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
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

export async function openAppDatabase(): Promise<SqlDb> {
  const key = await getOrCreateKey();
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  // Raw 256-bit key (no KDF) — must be the first statement on the connection.
  await db.execAsync(`PRAGMA key = "x'${key}'";`);
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
export async function destroyAppDatabase(current?: SqlDb): Promise<void> {
  if (current instanceof ExpoSqlDb) {
    try {
      await current.close();
    } catch {
      // already closed — we delete the file regardless
    }
  }
  try {
    await SQLite.deleteDatabaseAsync(DB_NAME);
  } catch {
    // file may not exist yet
  }
  await SecureStore.deleteItemAsync(KEY_NAME);
}
