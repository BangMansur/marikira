/**
 * better-sqlite3 implementation of SqlDb for Jest (Node only — never bundled in the app,
 * because nothing under src/app or src/features imports it outside __tests__).
 */
import Database from 'better-sqlite3';
import type { SqlDb, SqlParams } from './adapter';
import { migrate } from './migrations';

class NodeSqlDb implements SqlDb {
  private depth = 0;
  constructor(private readonly db: Database.Database) {}

  async run(sql: string, params: SqlParams = []) {
    const r = this.db.prepare(sql).run(...params);
    return { changes: r.changes };
  }
  async all<T>(sql: string, params: SqlParams = []) {
    return this.db.prepare(sql).all(...params) as T[];
  }
  async get<T>(sql: string, params: SqlParams = []) {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }
  async exec(sql: string) {
    this.db.exec(sql);
  }
  async transaction<T>(fn: (tx: SqlDb) => Promise<T>): Promise<T> {
    if (this.depth > 0) return fn(this);
    this.depth++;
    this.db.exec('BEGIN');
    try {
      const result = await fn(this);
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    } finally {
      this.depth--;
    }
  }
}

export async function createTestDb(): Promise<SqlDb> {
  const db = new NodeSqlDb(new Database(':memory:'));
  await migrate(db);
  return db;
}
