import { type Ctx, insertRow, nowMs, updateRow, ValidationError } from '@/db/helpers';
import { type LocalDate, todayLocal } from '@/core/dates';
import { assertSafeInt, divRound, type Minor } from '@/core/money';

export type AccountType = 'cash' | 'bank' | 'credit_card' | 'ewallet' | 'investment' | 'loan';

export const ACCOUNT_TYPES: AccountType[] = ['cash', 'bank', 'ewallet', 'credit_card', 'investment', 'loan'];

/** Liabilities carry negative balances when money is owed. */
export const LIABILITY_TYPES: AccountType[] = ['credit_card', 'loan'];

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  openingBalance: Minor;
  openingDate: LocalDate | null;
  institution: string | null;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  isArchived: boolean;
  includeInNetWorth: boolean;
  creditLimit: Minor | null;
  statementDay: number | null;
  dueDay: number | null;
}

export interface AccountWithBalance extends Account {
  balance: Minor;
  /** Credit cards: amount owed ÷ limit, in basis points. */
  utilisationBps: number | null;
}

interface Row {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  opening_balance_minor: number;
  opening_date: string | null;
  institution: string | null;
  icon: string | null;
  color: string | null;
  sort_order: number;
  is_archived: number;
  include_in_net_worth: number;
  credit_limit_minor: number | null;
  statement_day: number | null;
  due_day: number | null;
}

const map = (r: Row): Account => ({
  id: r.id,
  name: r.name,
  type: r.type,
  currency: r.currency,
  openingBalance: r.opening_balance_minor,
  openingDate: r.opening_date,
  institution: r.institution,
  icon: r.icon,
  color: r.color,
  sortOrder: r.sort_order,
  isArchived: r.is_archived === 1,
  includeInNetWorth: r.include_in_net_worth === 1,
  creditLimit: r.credit_limit_minor,
  statementDay: r.statement_day,
  dueDay: r.due_day,
});

/**
 * Balance = opening balance + effect of every live transaction on the account.
 * Computed, never stored, so it cannot drift; deleting a transaction updates it instantly.
 *   income, refund         → +amount
 *   expense                → −amount
 *   adjustment             → ±amount (signed)
 *   transfer (source)      → −amount
 *   transfer (destination) → +to_amount (or amount when same currency)
 */
const BALANCE_SQL = `
  SELECT a.*, a.opening_balance_minor + COALESCE((
    SELECT SUM(delta) FROM (
      SELECT CASE t.type
               WHEN 'income' THEN t.amount_minor
               WHEN 'refund' THEN t.amount_minor
               WHEN 'adjustment' THEN t.amount_minor
               ELSE -t.amount_minor END AS delta
        FROM transactions t WHERE t.account_id = a.id AND t.deleted_at IS NULL
      UNION ALL
      SELECT COALESCE(t.to_amount_minor, t.amount_minor)
        FROM transactions t WHERE t.to_account_id = a.id AND t.type = 'transfer' AND t.deleted_at IS NULL
    )), 0) AS balance
  FROM accounts a`;

function withBalance(r: Row & { balance: number }): AccountWithBalance {
  const a = map(r);
  let utilisationBps: number | null = null;
  if (a.type === 'credit_card' && a.creditLimit && a.creditLimit > 0) {
    const owed = Math.max(0, -r.balance);
    utilisationBps = divRound(owed * 10_000, a.creditLimit);
  }
  return { ...a, balance: r.balance, utilisationBps };
}

export async function listAccounts({ db, userId }: Ctx, opts: { includeArchived?: boolean } = {}): Promise<AccountWithBalance[]> {
  const rows = await db.all<Row & { balance: number }>(
    `${BALANCE_SQL} WHERE a.user_id = ? AND a.deleted_at IS NULL ${opts.includeArchived ? '' : 'AND a.is_archived = 0'}
     ORDER BY a.is_archived, a.sort_order, a.created_at`,
    [userId],
  );
  return rows.map(withBalance);
}

export async function getAccount({ db, userId }: Ctx, id: string): Promise<AccountWithBalance | null> {
  const r = await db.get<Row & { balance: number }>(`${BALANCE_SQL} WHERE a.id = ? AND a.user_id = ? AND a.deleted_at IS NULL`, [
    id,
    userId,
  ]);
  return r ? withBalance(r) : null;
}

export interface AccountInput {
  name: string;
  type: AccountType;
  currency: string;
  openingBalance: Minor;
  icon?: string | null;
  institution?: string | null;
  creditLimit?: Minor | null;
  statementDay?: number | null;
  dueDay?: number | null;
  includeInNetWorth?: boolean;
}

function validate(input: AccountInput) {
  if (!input.name.trim()) throw new ValidationError('name', 'required');
  if (input.name.trim().length > 40) throw new ValidationError('name', 'too_long');
  if (!ACCOUNT_TYPES.includes(input.type)) throw new ValidationError('type', 'invalid');
  assertSafeInt(input.openingBalance, 'openingBalance');
  if (input.creditLimit != null && (!Number.isSafeInteger(input.creditLimit) || input.creditLimit < 0)) {
    throw new ValidationError('creditLimit', 'invalid');
  }
  for (const f of ['statementDay', 'dueDay'] as const) {
    const v = input[f];
    if (v != null && (!Number.isInteger(v) || v < 1 || v > 31)) throw new ValidationError(f, 'invalid');
  }
}

export async function createAccount(ctx: Ctx, input: AccountInput): Promise<string> {
  validate(input);
  return ctx.db.transaction(async (db) => {
    const max = await db.get<{ m: number | null }>('SELECT max(sort_order) AS m FROM accounts WHERE user_id = ?', [ctx.userId]);
    return insertRow(db, 'accounts', {
      user_id: ctx.userId,
      name: input.name.trim(),
      type: input.type,
      currency: input.currency,
      opening_balance_minor: input.openingBalance,
      opening_date: todayLocal(new Date(nowMs())),
      institution: input.institution ?? null,
      icon: input.icon ?? null,
      sort_order: (max?.m ?? -1) + 1,
      include_in_net_worth: input.includeInNetWorth === false ? 0 : 1,
      credit_limit_minor: input.type === 'credit_card' ? (input.creditLimit ?? null) : null,
      statement_day: input.type === 'credit_card' ? (input.statementDay ?? null) : null,
      due_day: input.type === 'credit_card' ? (input.dueDay ?? null) : null,
    });
  });
}

/** Opening balance is not editable after creation — use adjustBalance so the change is logged. */
export async function updateAccount(ctx: Ctx, id: string, input: Omit<AccountInput, 'openingBalance' | 'currency'>): Promise<void> {
  validate({ ...input, openingBalance: 0, currency: 'MYR' });
  await updateRow(ctx.db, 'accounts', id, {
    name: input.name.trim(),
    type: input.type,
    icon: input.icon ?? null,
    institution: input.institution ?? null,
    include_in_net_worth: input.includeInNetWorth === false ? 0 : 1,
    credit_limit_minor: input.type === 'credit_card' ? (input.creditLimit ?? null) : null,
    statement_day: input.type === 'credit_card' ? (input.statementDay ?? null) : null,
    due_day: input.type === 'credit_card' ? (input.dueDay ?? null) : null,
  });
}

export async function setAccountArchived(ctx: Ctx, id: string, archived: boolean): Promise<void> {
  await updateRow(ctx.db, 'accounts', id, { is_archived: archived ? 1 : 0 });
}

/**
 * Set the real-world balance. Records an `adjustment` transaction for the difference,
 * which is the audit log, and is excluded from income/expense reports.
 * Returns the adjustment transaction id, or null if nothing changed.
 */
export async function adjustBalance(ctx: Ctx, accountId: string, newBalance: Minor, note: string | null): Promise<string | null> {
  assertSafeInt(newBalance, 'newBalance');
  return ctx.db.transaction(async (db) => {
    const acc = await getAccount({ db, userId: ctx.userId }, accountId);
    if (!acc) throw new ValidationError('accountId', 'not_found');
    const delta = newBalance - acc.balance;
    if (delta === 0) return null;
    const ts = nowMs();
    return insertRow(db, 'transactions', {
      user_id: ctx.userId,
      type: 'adjustment',
      amount_minor: delta,
      currency: acc.currency,
      base_amount_minor: delta,
      account_id: accountId,
      note,
      occurred_at: ts,
      local_date: todayLocal(new Date(ts)),
    });
  });
}

export async function reorderAccounts(ctx: Ctx, orderedIds: string[]): Promise<void> {
  await ctx.db.transaction(async (db) => {
    for (let i = 0; i < orderedIds.length; i++) await updateRow(db, 'accounts', orderedIds[i], { sort_order: i });
  });
}

/** Assets − liabilities across accounts flagged for net worth (same currency in Phase 1). */
export function netWorth(accounts: AccountWithBalance[]): Minor {
  return accounts.filter((a) => a.includeInNetWorth).reduce((s, a) => s + a.balance, 0);
}
