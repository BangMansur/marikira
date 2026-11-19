import { addDays, getPayCycle } from '@/core/dates';
import { uuidv7 } from '@/core/id';
import { createTestDb } from '@/db/testDb';
import { bootstrapDatabase } from '@/db/seed/bootstrap';
import { loadDemoData } from '@/db/seed/demo';
import { listAccounts } from '@/features/accounts/accounts.repo';
import { getCycleReport, getDashboard } from '@/features/reports/reports.repo';
import { getSettings } from '@/features/settings/settings.repo';
import { listTransactions } from '@/features/transactions/transactions.repo';

describe('demo data', () => {
  it('loads ~3 months of realistic, internally consistent data', async () => {
    const ctx = await bootstrapDatabase(await createTestDb(), (k) => k);
    const today = '2026-11-19';
    const r = await loadDemoData(ctx, today);
    expect(r.accounts).toBe(4);
    expect(r.transactions).toBeGreaterThan(250);
    const settings = await getSettings(ctx);
    expect(settings.payDay).toBe(25);
    const d = await getDashboard(ctx, settings, today);
    expect(d.flow.moneyIn).toBeGreaterThanOrEqual(450_000);
    expect(d.flow.moneyOut).toBeGreaterThan(0);
    expect(d.topCategories.length).toBe(5);
    const accounts = await listAccounts(ctx);
    expect(accounts.find((a) => a.type === 'credit_card')!.balance).toBeLessThanOrEqual(0);
    // Earliest transaction sits about three cycles back.
    const oldest = await listTransactions(ctx, { sort: 'date_asc', limit: 1 });
    expect(oldest[0].localDate <= addDays(today, -85)).toBe(true);
  });
});

describe('performance (spec §10: reports for 10k transactions < 1s)', () => {
  it('dashboard + cycle report over 10,000 transactions', async () => {
    const db = await createTestDb();
    const ctx = await bootstrapDatabase(db, (k) => k);
    const { id: catId } = (await db.get<{ id: string }>("SELECT id FROM categories WHERE name_key = 'food'"))!;
    const now = Date.now();
    const acc = uuidv7();
    await db.run(
      "INSERT INTO accounts (id, created_at, updated_at, user_id, name, type, currency) VALUES (?, ?, ?, ?, 'Bank', 'bank', 'MYR')",
      [acc, now, now, ctx.userId],
    );
    await db.transaction(async (tx) => {
      for (let i = 0; i < 10_000; i++) {
        const day = addDays('2026-11-19', -(i % 365));
        await tx.run(
          `INSERT INTO transactions (id, created_at, updated_at, user_id, type, amount_minor, currency, base_amount_minor,
             account_id, category_id, occurred_at, local_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [uuidv7(), now, now, ctx.userId, i % 50 === 0 ? 'income' : 'expense', 1_000 + (i % 977), 'MYR', 1_000 + (i % 977), acc, catId, now, day],
        );
      }
    });
    const settings = await getSettings(ctx);
    const t0 = performance.now();
    await getDashboard(ctx, settings, '2026-11-19');
    await getCycleReport(ctx, 1, '2026-11-19');
    await listAccounts(ctx);
    await listTransactions(ctx, { text: 'x', limit: 50 });
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(1000);
    expect(getPayCycle('2026-11-19', 1).lengthDays).toBe(30);
  });
});
