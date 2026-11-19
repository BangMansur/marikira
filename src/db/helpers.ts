import { uuidv7 } from '@/core/id';
import type { SqlDb, SqlValue } from './adapter';

/** Repository context: one local user per device in Phase 1. */
export interface Ctx {
  db: SqlDb;
  userId: string;
}

export type SyncedTable =
  | 'users'
  | 'settings'
  | 'accounts'
  | 'categories'
  | 'merchants'
  | 'transactions'
  | 'transaction_splits'
  | 'tags'
  | 'transaction_tags'
  | 'exchange_rates';

let clock: () => number = () => Date.now();
/** Tests can freeze time. */
export function setClock(fn: () => number): void {
  clock = fn;
}
export function nowMs(): number {
  return clock();
}

/** Insert a row with the common columns filled in, and record it for sync. */
export async function insertRow(
  db: SqlDb,
  table: SyncedTable,
  values: Record<string, SqlValue>,
  id: string = uuidv7(),
): Promise<string> {
  const ts = nowMs();
  const row: Record<string, SqlValue> = { id, created_at: ts, updated_at: ts, sync_version: 0, ...values };
  const cols = Object.keys(row);
  await db.run(
    `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
    cols.map((c) => row[c]),
  );
  await logSync(db, table, id, 'insert');
  return id;
}

/** Update columns on a live row, bump sync_version, record for sync. Returns rows changed. */
export async function updateRow(db: SqlDb, table: SyncedTable, id: string, values: Record<string, SqlValue>): Promise<number> {
  const cols = Object.keys(values);
  const sets = [...cols.map((c) => `${c} = ?`), 'updated_at = ?', 'sync_version = sync_version + 1'];
  const r = await db.run(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`, [
    ...cols.map((c) => values[c]),
    nowMs(),
    id,
  ]);
  if (r.changes > 0) await logSync(db, table, id, 'update');
  return r.changes;
}

export async function softDeleteRow(db: SqlDb, table: SyncedTable, id: string): Promise<number> {
  const ts = nowMs();
  const r = await db.run(
    `UPDATE ${table} SET deleted_at = ?, updated_at = ?, sync_version = sync_version + 1 WHERE id = ? AND deleted_at IS NULL`,
    [ts, ts, id],
  );
  if (r.changes > 0) await logSync(db, table, id, 'delete');
  return r.changes;
}

export async function restoreRow(db: SqlDb, table: SyncedTable, id: string): Promise<number> {
  const r = await db.run(
    `UPDATE ${table} SET deleted_at = NULL, updated_at = ?, sync_version = sync_version + 1 WHERE id = ? AND deleted_at IS NOT NULL`,
    [nowMs(), id],
  );
  if (r.changes > 0) await logSync(db, table, id, 'update');
  return r.changes;
}

async function logSync(db: SqlDb, table: SyncedTable, rowId: string, op: 'insert' | 'update' | 'delete') {
  const ts = nowMs();
  await db.run(
    'INSERT INTO sync_log (id, created_at, updated_at, sync_version, table_name, row_id, op) VALUES (?,?,?,?,?,?,?)',
    [uuidv7(), ts, ts, 0, table, rowId, op],
  );
}

export function bool(v: number | null | undefined): boolean {
  return v === 1;
}

/** Build "?, ?, ?" for IN clauses. */
export function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(',');
}

export class ValidationError extends Error {
  constructor(
    public readonly field: string,
    public readonly code: string,
  ) {
    super(`${field}: ${code}`);
  }
}
