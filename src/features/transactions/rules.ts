/**
 * Pure transaction rules: validation, merchant normalisation, category suggestion ranking.
 * Kept free of SQL so they are trivially unit-testable.
 */
import { isValidLocalDate, type LocalDate } from '@/core/dates';
import type { Minor } from '@/core/money';
import { ValidationError } from '@/db/helpers';

export type EntryType = 'expense' | 'income' | 'transfer' | 'refund';
export type TxType = EntryType | 'adjustment';

export interface SplitInput {
  categoryId: string;
  amount: Minor;
  note?: string | null;
}

export interface TransactionInput {
  type: EntryType;
  amount: Minor;
  accountId: string;
  toAccountId?: string | null;
  categoryId?: string | null;
  refundOfId?: string | null;
  occurredAt: number;
  localDate: LocalDate;
  merchantName?: string | null;
  note?: string | null;
  paymentMethod?: string | null;
  tags?: string[];
  splits?: SplitInput[];
}

export const MAX_NOTE = 500;
export const MAX_MERCHANT = 80;
/** RM10 million in sen — a sanity ceiling against fat-finger entries. */
export const MAX_AMOUNT: Minor = 1_000_000_000;

export function validateTransactionInput(i: TransactionInput): void {
  if (!Number.isSafeInteger(i.amount) || i.amount <= 0) throw new ValidationError('amount', 'positive');
  if (i.amount > MAX_AMOUNT) throw new ValidationError('amount', 'too_large');
  if (!i.accountId) throw new ValidationError('accountId', 'required');
  if (!isValidLocalDate(i.localDate)) throw new ValidationError('localDate', 'invalid');
  if (!Number.isSafeInteger(i.occurredAt)) throw new ValidationError('occurredAt', 'invalid');
  if ((i.note ?? '').length > MAX_NOTE) throw new ValidationError('note', 'too_long');
  if ((i.merchantName ?? '').length > MAX_MERCHANT) throw new ValidationError('merchantName', 'too_long');

  const splits = i.splits ?? [];
  switch (i.type) {
    case 'transfer':
      if (!i.toAccountId) throw new ValidationError('toAccountId', 'required');
      if (i.toAccountId === i.accountId) throw new ValidationError('toAccountId', 'same_account');
      if (i.categoryId) throw new ValidationError('categoryId', 'not_allowed');
      if (splits.length) throw new ValidationError('splits', 'not_allowed');
      break;
    case 'expense':
      if (splits.length) {
        if (splits.length < 2) throw new ValidationError('splits', 'min_two');
        let sum = 0;
        for (const s of splits) {
          if (!Number.isSafeInteger(s.amount) || s.amount <= 0) throw new ValidationError('splits', 'positive');
          if (!s.categoryId) throw new ValidationError('splits', 'category_required');
          sum += s.amount;
        }
        if (sum !== i.amount) throw new ValidationError('splits', 'sum_mismatch');
      } else if (!i.categoryId) {
        throw new ValidationError('categoryId', 'required');
      }
      if (i.toAccountId) throw new ValidationError('toAccountId', 'not_allowed');
      break;
    case 'income':
      if (!i.categoryId) throw new ValidationError('categoryId', 'required');
      if (splits.length) throw new ValidationError('splits', 'not_allowed');
      if (i.toAccountId) throw new ValidationError('toAccountId', 'not_allowed');
      break;
    case 'refund':
      if (!i.categoryId && !i.refundOfId) throw new ValidationError('categoryId', 'required');
      if (splits.length) throw new ValidationError('splits', 'not_allowed');
      if (i.toAccountId) throw new ValidationError('toAccountId', 'not_allowed');
      break;
    default:
      throw new ValidationError('type', 'invalid');
  }
}

/** "  Starbucks  KLCC!! " → "starbucks klcc" — used for merchant learning and matching. */
export function normalizeMerchant(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Clean user-entered tag names: trimmed, de-duplicated (case-insensitive), max 10. */
export function cleanTags(tags: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags ?? []) {
    const t = raw.trim().replace(/^#/, '').slice(0, 30);
    const k = t.toLowerCase();
    if (t && !seen.has(k)) {
      seen.add(k);
      out.push(t);
    }
  }
  return out.slice(0, 10);
}

/**
 * Rank category suggestions for quick entry:
 * 1) the merchant's learned category, 2) categories used around this time of day,
 * 3) most-used overall recently, 4) the user's category order.
 */
export function rankCategorySuggestions(args: {
  merchantCategoryId: string | null;
  byTimeOfDay: { categoryId: string; n: number }[];
  overall: { categoryId: string; n: number }[];
  ordered: string[];
  limit: number;
}): string[] {
  const valid = new Set(args.ordered);
  const out: string[] = [];
  const push = (id: string | null) => {
    if (id && valid.has(id) && !out.includes(id)) out.push(id);
  };
  push(args.merchantCategoryId);
  [...args.byTimeOfDay].sort((a, b) => b.n - a.n).forEach((r) => push(r.categoryId));
  [...args.overall].sort((a, b) => b.n - a.n).forEach((r) => push(r.categoryId));
  args.ordered.forEach(push);
  return out.slice(0, args.limit);
}
