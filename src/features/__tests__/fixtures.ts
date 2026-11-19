import { createTestDb } from '@/db/testDb';
import type { Ctx } from '@/db/helpers';
import { bootstrapDatabase } from '@/db/seed/bootstrap';
import { createAccount } from '@/features/accounts/accounts.repo';
import { createTransaction } from '@/features/transactions/transactions.repo';
import type { TransactionInput } from '@/features/transactions/rules';

export interface Fixture {
  ctx: Ctx;
  cat: (key: string) => string;
  bank: string;
  wallet: string;
  card: string;
  add: (i: Partial<TransactionInput> & Pick<TransactionInput, 'type' | 'amount'>) => Promise<string>;
}

export async function setup(): Promise<Fixture> {
  const db = await createTestDb();
  const ctx = await bootstrapDatabase(db, (k) => k);
  const cats = await db.all<{ id: string; name_key: string }>('SELECT id, name_key FROM categories');
  const cat = (key: string) => cats.find((c) => c.name_key === key)!.id;
  const bank = await createAccount(ctx, { name: 'Bank', type: 'bank', currency: 'MYR', openingBalance: 100_000 });
  const wallet = await createAccount(ctx, { name: 'TNG', type: 'ewallet', currency: 'MYR', openingBalance: 0 });
  const card = await createAccount(ctx, { name: 'Card', type: 'credit_card', currency: 'MYR', openingBalance: 0, creditLimit: 500_000 });
  const add: Fixture['add'] = (i) =>
    createTransaction(ctx, {
      accountId: bank,
      localDate: '2026-11-10',
      occurredAt: new Date(2026, 10, 10, 12, 0).getTime(),
      categoryId: i.type === 'income' ? cat('salary') : i.type === 'expense' ? cat('food') : null,
      ...i,
    });
  return { ctx, cat, bank, wallet, card, add };
}
