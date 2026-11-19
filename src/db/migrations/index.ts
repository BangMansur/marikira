import type { SqlDb } from '../adapter';
import { migration001 } from './001_init';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/** Append-only. Never edit a shipped migration; add a new one. */
export const MIGRATIONS: readonly Migration[] = [{ version: 1, name: 'init', sql: migration001 }];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/**
 * Applies pending migrations in order, each atomically, tracking progress in
 * PRAGMA user_version. Safe to call on every launch.
 */
export async function migrate(db: SqlDb): Promise<{ from: number; to: number }> {
  await db.exec('PRAGMA foreign_keys = ON;');
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  const from = row?.user_version ?? 0;
  if (from > LATEST_VERSION) {
    throw new Error(`Database version ${from} is newer than this app (${LATEST_VERSION}). Please update MariKira.`);
  }
  for (const m of MIGRATIONS) {
    if (m.version <= from) continue;
    await db.transaction(async (tx) => {
      await tx.exec(m.sql);
      await tx.exec(`PRAGMA user_version = ${m.version};`);
    });
  }
  return { from, to: LATEST_VERSION };
}
