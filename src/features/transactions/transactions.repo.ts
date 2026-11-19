import type { SqlDb, SqlValue } from '@/db/adapter';
import { type Ctx, insertRow, nowMs, placeholders, restoreRow, softDeleteRow, updateRow, ValidationError } from '@/db/helpers';
import type { LocalDate } from '@/core/dates';
import type { Minor } from '@/core/money';
import {
  cleanTags,
  normalizeMerchant,
  rankCategorySuggestions,
  type TransactionInput,
  type TxType,
  validateTransactionInput,
} from './rules';

export interface TransactionListItem {
  id: string;
  type: TxType;
  amount: Minor;
  baseAmount: Minor;
  currency: string;
  localDate: LocalDate;
  occurredAt: number;
  accountId: string;
  accountName: string;
  toAccountId: string | null;
  toAccountName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryNameKey: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  merchantName: string | null;
  note: string | null;
  splitCount: number;
}

export interface TransactionDetail extends TransactionListItem {
  paymentMethod: string | null;
  refundOfId: string | null;
  commitmentPaymentId: string | null;
  tags: string[];
  splits: { id: string; categoryId: string; amount: Minor; note: string | null }[];
  /** Sum of live refunds recorded against this transaction. */
  refundedAmount: Minor;
}

const LIST_SELECT = `
  SELECT t.id, t.type, t.amount_minor AS amount, t.base_amount_minor AS baseAmount, t.currency,
         t.local_date AS localDate, t.occurred_at AS occurredAt,
         t.account_id AS accountId, a.name AS accountName,
         t.to_account_id AS toAccountId, ta.name AS toAccountName,
         t.category_id AS categoryId, c.name AS categoryName, c.name_key AS categoryNameKey,
         c.icon AS categoryIcon, c.color AS categoryColor,
         m.name AS merchantName, t.note,
         (SELECT count(*) FROM transaction_splits s WHERE s.transaction_id = t.id AND s.deleted_at IS NULL) AS splitCount
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    LEFT JOIN accounts ta ON ta.id = t.to_account_id
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN merchants m ON m.id = t.merchant_id`;

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

async function assertAccount(db: SqlDb, userId: string, id: string) {
  const a = await db.get<{ currency: string; is_archived: number }>(
    'SELECT currency, is_archived FROM accounts WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    [id, userId],
  );
  if (!a) throw new ValidationError('accountId', 'not_found');
  return a;
}

async function assertCategory(db: SqlDb, userId: string, id: string, kind: 'expense' | 'income', field = 'categoryId') {
  const c = await db.get<{ kind: string }>('SELECT kind FROM categories WHERE id = ? AND user_id = ? AND deleted_at IS NULL', [
    id,
    userId,
  ]);
  if (!c) throw new ValidationError(field, 'not_found');
  if (c.kind !== kind) throw new ValidationError(field, 'wrong_kind');
}

/** Upsert the merchant and learn its category from what the user chose (corrections win). */
async function learnMerchant(db: SqlDb, userId: string, name: string | null | undefined, categoryId: string | null) {
  const display = (name ?? '').trim();
  if (!display) return null;
  const normalized = normalizeMerchant(display);
  if (!normalized) return null;
  const existing = await db.get<{ id: string }>(
    'SELECT id FROM merchants WHERE user_id = ? AND normalized_name = ? AND deleted_at IS NULL',
    [userId, normalized],
  );
  const ts = nowMs();
  if (existing) {
    await updateRow(db, 'merchants', existing.id, {
      name: display,
      ...(categoryId ? { default_category_id: categoryId } : {}),
      last_used_at: ts,
    });
    await db.run('UPDATE merchants SET use_count = use_count + 1 WHERE id = ?', [existing.id]);
    return existing.id;
  }
  return insertRow(db, 'merchants', {
    user_id: userId,
    name: display,
    normalized_name: normalized,
    default_category_id: categoryId,
    use_count: 1,
    last_used_at: ts,
  });
}

async function writeTags(db: SqlDb, userId: string, txId: string, tags: string[]) {
  for (const name of cleanTags(tags)) {
    const tag = await db.get<{ id: string }>(
      'SELECT id FROM tags WHERE user_id = ? AND name = ? COLLATE NOCASE AND deleted_at IS NULL',
      [userId, name],
    );
    const tagId = tag?.id ?? (await insertRow(db, 'tags', { user_id: userId, name }));
    // UNIQUE (transaction_id, tag_id): revive a soft-deleted link instead of inserting a duplicate.
    const link = await db.get<{ id: string; deleted_at: number | null }>(
      'SELECT id, deleted_at FROM transaction_tags WHERE transaction_id = ? AND tag_id = ?',
      [txId, tagId],
    );
    if (!link) await insertRow(db, 'transaction_tags', { transaction_id: txId, tag_id: tagId });
    else if (link.deleted_at != null) await restoreRow(db, 'transaction_tags', link.id);
  }
}

async function writeSplits(db: SqlDb, txId: string, input: TransactionInput) {
  for (const s of input.splits ?? []) {
    await insertRow(db, 'transaction_splits', {
      transaction_id: txId,
      category_id: s.categoryId,
      amount_minor: s.amount,
      base_amount_minor: s.amount,
      note: s.note ?? null,
    });
  }
}

/** Validates against the DB and returns the columns to persist. */
async function prepare(db: SqlDb, userId: string, input: TransactionInput, editingId?: string) {
  validateTransactionInput(input);
  const acc = await assertAccount(db, userId, input.accountId);
  let categoryId = input.categoryId ?? null;

  if (input.type === 'transfer') {
    const to = await assertAccount(db, userId, input.toAccountId!);
    if (to.currency !== acc.currency) throw new ValidationError('toAccountId', 'currency_mismatch');
  }
  if (input.type === 'refund' && input.refundOfId) {
    const orig = await db.get<{ type: string; category_id: string | null; amount_minor: number }>(
      'SELECT type, category_id, amount_minor FROM transactions WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
      [input.refundOfId, userId],
    );
    if (!orig || orig.type !== 'expense') throw new ValidationError('refundOfId', 'not_found');
    const prior = await db.get<{ s: number | null }>(
      "SELECT SUM(amount_minor) AS s FROM transactions WHERE refund_of_id = ? AND type = 'refund' AND deleted_at IS NULL AND id <> ?",
      [input.refundOfId, editingId ?? ''],
    );
    if (input.amount + (prior?.s ?? 0) > orig.amount_minor) throw new ValidationError('amount', 'exceeds_original');
    // A linked refund always reduces the original's category, whatever was passed in.
    categoryId = orig.category_id;
    if (!categoryId) {
      // Original was split: refund the first split's category.
      const split = await db.get<{ category_id: string }>(
        'SELECT category_id FROM transaction_splits WHERE transaction_id = ? AND deleted_at IS NULL ORDER BY amount_minor DESC LIMIT 1',
        [input.refundOfId],
      );
      categoryId = split?.category_id ?? null;
    }
  }
  if (categoryId) {
    const kind = input.type === 'income' ? 'income' : 'expense';
    await assertCategory(db, userId, categoryId, kind);
  }
  for (const s of input.splits ?? []) await assertCategory(db, userId, s.categoryId, 'expense', 'splits');

  const learnedCategory = input.type === 'expense' || input.type === 'income' ? categoryId : null;
  const merchantId = input.type === 'transfer' ? null : await learnMerchant(db, userId, input.merchantName, learnedCategory);

  const cols: Record<string, SqlValue> = {
    type: input.type,
    amount_minor: input.amount,
    currency: acc.currency,
    // Phase 1: one currency per user, so base == amount. Phase 5 adds FX conversion here.
    base_amount_minor: input.amount,
    fx_rate_e8: null,
    account_id: input.accountId,
    to_account_id: input.type === 'transfer' ? input.toAccountId! : null,
    to_amount_minor: null,
    category_id: input.splits?.length ? null : categoryId,
    refund_of_id: input.type === 'refund' ? (input.refundOfId ?? null) : null,
    merchant_id: merchantId,
    note: input.note?.trim() || null,
    payment_method: input.paymentMethod ?? null,
    occurred_at: input.occurredAt,
    local_date: input.localDate,
  };
  return cols;
}

export async function createTransaction(ctx: Ctx, input: TransactionInput): Promise<string> {
  return ctx.db.transaction(async (db) => {
    const cols = await prepare(db, ctx.userId, input);
    const id = await insertRow(db, 'transactions', { user_id: ctx.userId, ...cols });
    await writeSplits(db, id, input);
    await writeTags(db, ctx.userId, id, input.tags ?? []);
    return id;
  });
}

export async function updateTransaction(ctx: Ctx, id: string, input: TransactionInput): Promise<void> {
  await ctx.db.transaction(async (db) => {
    const existing = await db.get<{ type: string }>(
      'SELECT type FROM transactions WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
      [id, ctx.userId],
    );
    if (!existing) throw new ValidationError('id', 'not_found');
    if (existing.type === 'adjustment') throw new ValidationError('type', 'adjustment_readonly');
    const cols = await prepare(db, ctx.userId, input, id);
    await updateRow(db, 'transactions', id, cols);
    await softDeleteChildren(db, id);
    await writeSplits(db, id, input);
    await writeTags(db, ctx.userId, id, input.tags ?? []);
  });
}

async function softDeleteChildren(db: SqlDb, txId: string) {
  const splits = await db.all<{ id: string }>('SELECT id FROM transaction_splits WHERE transaction_id = ? AND deleted_at IS NULL', [txId]);
  for (const s of splits) await softDeleteRow(db, 'transaction_splits', s.id);
  const tags = await db.all<{ id: string }>('SELECT id FROM transaction_tags WHERE transaction_id = ? AND deleted_at IS NULL', [txId]);
  for (const t of tags) await softDeleteRow(db, 'transaction_tags', t.id);
}

/**
 * Soft-deletes a transaction (and its splits). Refunds recorded against it are deleted too,
 * so balances and reports stay consistent. Returns the ids deleted, for undo.
 */
export async function deleteTransaction(ctx: Ctx, id: string): Promise<string[]> {
  return ctx.db.transaction(async (db) => {
    const t = await db.get<{ id: string }>('SELECT id FROM transactions WHERE id = ? AND user_id = ? AND deleted_at IS NULL', [
      id,
      ctx.userId,
    ]);
    if (!t) return [];
    const refunds = await db.all<{ id: string }>(
      'SELECT id FROM transactions WHERE refund_of_id = ? AND deleted_at IS NULL',
      [id],
    );
    const ids = [id, ...refunds.map((r) => r.id)];
    for (const tid of ids) {
      await softDeleteRow(db, 'transactions', tid);
      const splits = await db.all<{ id: string }>(
        'SELECT id FROM transaction_splits WHERE transaction_id = ? AND deleted_at IS NULL',
        [tid],
      );
      for (const s of splits) await softDeleteRow(db, 'transaction_splits', s.id);
    }
    return ids;
  });
}

/** Undo for deleteTransaction. */
export async function restoreTransactions(ctx: Ctx, ids: string[]): Promise<void> {
  await ctx.db.transaction(async (db) => {
    for (const id of ids) {
      const t = await db.get<{ deleted_at: number | null }>('SELECT deleted_at FROM transactions WHERE id = ? AND user_id = ?', [
        id,
        ctx.userId,
      ]);
      if (!t?.deleted_at) continue;
      const splits = await db.all<{ id: string }>(
        'SELECT id FROM transaction_splits WHERE transaction_id = ? AND deleted_at = ?',
        [id, t.deleted_at],
      );
      await restoreRow(db, 'transactions', id);
      for (const s of splits) await restoreRow(db, 'transaction_splits', s.id);
    }
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getTransaction({ db, userId }: Ctx, id: string): Promise<TransactionDetail | null> {
  const row = await db.get<TransactionListItem & { paymentMethod: string | null; refundOfId: string | null; commitmentPaymentId: string | null }>(
    `${LIST_SELECT.replace(
      'm.name AS merchantName, t.note,',
      'm.name AS merchantName, t.note, t.payment_method AS paymentMethod, t.refund_of_id AS refundOfId, t.commitment_payment_id AS commitmentPaymentId,',
    )}
     WHERE t.id = ? AND t.user_id = ? AND t.deleted_at IS NULL`,
    [id, userId],
  );
  if (!row) return null;
  const tags = await db.all<{ name: string }>(
    `SELECT g.name FROM transaction_tags tt JOIN tags g ON g.id = tt.tag_id
      WHERE tt.transaction_id = ? AND tt.deleted_at IS NULL ORDER BY g.name`,
    [id],
  );
  const splits = await db.all<{ id: string; categoryId: string; amount: number; note: string | null }>(
    `SELECT id, category_id AS categoryId, amount_minor AS amount, note FROM transaction_splits
      WHERE transaction_id = ? AND deleted_at IS NULL ORDER BY amount_minor DESC`,
    [id],
  );
  const refunded = await db.get<{ s: number | null }>(
    "SELECT SUM(amount_minor) AS s FROM transactions WHERE refund_of_id = ? AND type = 'refund' AND deleted_at IS NULL",
    [id],
  );
  return { ...row, tags: tags.map((t) => t.name), splits, refundedAmount: refunded?.s ?? 0 };
}

export type SortOrder = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';

export interface TransactionFilter {
  from?: LocalDate;
  to?: LocalDate;
  types?: TxType[];
  /** Matches the category, its sub-categories, and split lines. */
  categoryIds?: string[];
  accountIds?: string[];
  minAmount?: Minor;
  maxAmount?: Minor;
  tagNames?: string[];
  text?: string;
  /** Only spending that counts toward safe-to-spend (excludes commitment payments). */
  discretionaryOnly?: boolean;
  sort?: SortOrder;
  limit?: number;
  offset?: number;
}

const ORDER: Record<SortOrder, string> = {
  date_desc: 't.local_date DESC, t.occurred_at DESC, t.id DESC',
  date_asc: 't.local_date ASC, t.occurred_at ASC, t.id ASC',
  amount_desc: 't.base_amount_minor DESC, t.local_date DESC',
  amount_asc: 't.base_amount_minor ASC, t.local_date DESC',
};

export async function listTransactions({ db, userId }: Ctx, f: TransactionFilter = {}): Promise<TransactionListItem[]> {
  const where: string[] = ['t.user_id = ?', 't.deleted_at IS NULL'];
  const params: SqlValue[] = [userId];
  if (f.from) {
    where.push('t.local_date >= ?');
    params.push(f.from);
  }
  if (f.to) {
    where.push('t.local_date <= ?');
    params.push(f.to);
  }
  if (f.types?.length) {
    where.push(`t.type IN (${placeholders(f.types.length)})`);
    params.push(...f.types);
  }
  if (f.accountIds?.length) {
    const p = placeholders(f.accountIds.length);
    where.push(`(t.account_id IN (${p}) OR t.to_account_id IN (${p}))`);
    params.push(...f.accountIds, ...f.accountIds);
  }
  if (f.categoryIds?.length) {
    const children = await db.all<{ id: string }>(
      `SELECT id FROM categories WHERE parent_id IN (${placeholders(f.categoryIds.length)}) AND deleted_at IS NULL`,
      f.categoryIds,
    );
    const ids = [...new Set([...f.categoryIds, ...children.map((c) => c.id)])];
    const p = placeholders(ids.length);
    where.push(
      `(t.category_id IN (${p}) OR EXISTS (SELECT 1 FROM transaction_splits s WHERE s.transaction_id = t.id AND s.deleted_at IS NULL AND s.category_id IN (${p})))`,
    );
    params.push(...ids, ...ids);
  }
  if (f.minAmount != null) {
    where.push('t.base_amount_minor >= ?');
    params.push(f.minAmount);
  }
  if (f.maxAmount != null) {
    where.push('t.base_amount_minor <= ?');
    params.push(f.maxAmount);
  }
  if (f.tagNames?.length) {
    where.push(
      `EXISTS (SELECT 1 FROM transaction_tags tt JOIN tags g ON g.id = tt.tag_id
                WHERE tt.transaction_id = t.id AND tt.deleted_at IS NULL AND g.name COLLATE NOCASE IN (${placeholders(f.tagNames.length)}))`,
    );
    params.push(...f.tagNames);
  }
  if (f.discretionaryOnly) where.push('t.commitment_payment_id IS NULL');
  const text = f.text?.trim();
  if (text) {
    const like = `%${text.replace(/[\\%_]/g, (ch) => '\\' + ch)}%`;
    where.push(
      `(t.note LIKE ? ESCAPE '\\' OR m.name LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\' OR a.name LIKE ? ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM transaction_tags tt JOIN tags g ON g.id = tt.tag_id WHERE tt.transaction_id = t.id AND tt.deleted_at IS NULL AND g.name LIKE ? ESCAPE '\\'))`,
    );
    params.push(like, like, like, like, like);
  }
  params.push(f.limit ?? 50, f.offset ?? 0);
  return db.all<TransactionListItem>(
    `${LIST_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${ORDER[f.sort ?? 'date_desc']} LIMIT ? OFFSET ?`,
    params,
  );
}

/** Smart default: the account used most recently for a new entry. */
export async function lastUsedAccountId({ db, userId }: Ctx): Promise<string | null> {
  const r = await db.get<{ account_id: string }>(
    `SELECT t.account_id FROM transactions t JOIN accounts a ON a.id = t.account_id
      WHERE t.user_id = ? AND t.deleted_at IS NULL AND t.type <> 'adjustment' AND a.is_archived = 0 AND a.deleted_at IS NULL
      ORDER BY t.created_at DESC LIMIT 1`,
    [userId],
  );
  return r?.account_id ?? null;
}

export async function findMerchantCategory({ db, userId }: Ctx, merchantName: string): Promise<string | null> {
  const normalized = normalizeMerchant(merchantName);
  if (!normalized) return null;
  const r = await db.get<{ default_category_id: string | null }>(
    'SELECT default_category_id FROM merchants WHERE user_id = ? AND normalized_name = ? AND deleted_at IS NULL',
    [userId, normalized],
  );
  return r?.default_category_id ?? null;
}

export async function searchMerchants({ db, userId }: Ctx, prefix: string, limit = 5): Promise<string[]> {
  const n = normalizeMerchant(prefix);
  if (!n) return [];
  const rows = await db.all<{ name: string }>(
    `SELECT name FROM merchants WHERE user_id = ? AND deleted_at IS NULL AND normalized_name LIKE ?
      ORDER BY use_count DESC, last_used_at DESC LIMIT ?`,
    [userId, `${n.replace(/[%_]/g, '')}%`, limit],
  );
  return rows.map((r) => r.name);
}

/** Ranked category ids for the quick-add sheet. */
export async function suggestCategories(
  ctx: Ctx,
  args: { kind: 'expense' | 'income'; hour: number; merchantName?: string | null; now?: number; limit?: number },
): Promise<string[]> {
  const { db, userId } = ctx;
  const since = (args.now ?? nowMs()) - 90 * 86_400_000;
  const type = args.kind === 'income' ? 'income' : 'expense';
  const ordered = await db.all<{ id: string }>(
    'SELECT id FROM categories WHERE user_id = ? AND kind = ? AND is_hidden = 0 AND deleted_at IS NULL ORDER BY sort_order, name',
    [userId, args.kind],
  );
  const hours = [-1, 0, 1].map((d) => String((((args.hour + d) % 24) + 24) % 24).padStart(2, '0'));
  const byTimeOfDay = await db.all<{ categoryId: string; n: number }>(
    `SELECT category_id AS categoryId, count(*) AS n FROM transactions
      WHERE user_id = ? AND type = ? AND deleted_at IS NULL AND category_id IS NOT NULL AND occurred_at >= ?
        AND strftime('%H', occurred_at / 1000, 'unixepoch', 'localtime') IN (?, ?, ?)
      GROUP BY category_id`,
    [userId, type, since, ...hours],
  );
  const overall = await db.all<{ categoryId: string; n: number }>(
    `SELECT category_id AS categoryId, count(*) AS n FROM transactions
      WHERE user_id = ? AND type = ? AND deleted_at IS NULL AND category_id IS NOT NULL AND occurred_at >= ?
      GROUP BY category_id`,
    [userId, type, since],
  );
  const merchantCategoryId = args.merchantName ? await findMerchantCategory(ctx, args.merchantName) : null;
  return rankCategorySuggestions({
    merchantCategoryId,
    byTimeOfDay,
    overall,
    ordered: ordered.map((o) => o.id),
    limit: args.limit ?? 8,
  });
}
