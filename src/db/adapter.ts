/**
 * Minimal async SQL interface shared by the app (expo-sqlite + SQLCipher)
 * and the tests (better-sqlite3 in memory). Repositories depend only on this,
 * so every query is exercised against a real SQLite engine in Jest.
 */
export type SqlValue = string | number | null;
export type SqlParams = readonly SqlValue[];

export interface SqlDb {
  run(sql: string, params?: SqlParams): Promise<{ changes: number }>;
  all<T>(sql: string, params?: SqlParams): Promise<T[]>;
  get<T>(sql: string, params?: SqlParams): Promise<T | undefined>;
  exec(sql: string): Promise<void>;
  /** Runs `fn` atomically. Nested calls reuse the outer transaction. */
  transaction<T>(fn: (tx: SqlDb) => Promise<T>): Promise<T>;
}
