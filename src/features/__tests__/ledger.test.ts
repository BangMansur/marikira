import { getPayCycle } from '@/core/dates';
import { migrate } from '@/db/migrations';
import { adjustBalance, getAccount, listAccounts, netWorth } from '@/features/accounts/accounts.repo';
import { cashFlow, dailyTotals, discretionarySpend, getDashboard, getCycleReport, spendingByCategory } from '@/features/reports/reports.repo';
import { DEFAULT_SETTINGS, getSettings, setSettings } from '@/features/settings/settings.repo';
import {
  deleteTransaction,
  getTransaction,
  listTransactions,
  restoreTransactions,
  updateTransaction,
} from '@/features/transactions/transactions.repo';
import { setup } from './fixtures';

const NOV = { from: '2026-11-01', to: '2026-11-30' };

describe('migrations & settings', () => {
  it('migrate is idempotent', async () => {
    const { ctx } = await setup();
    expect(await migrate(ctx.db)).toEqual({ from: 1, to: 1 });
  });

  it('settings round-trip with defaults', async () => {
    const { ctx } = await setup();
    expect(await getSettings(ctx)).toEqual(DEFAULT_SETTINGS);
    await setSettings(ctx, { payDay: 25, monthlyIncomeMinor: 400_000, hideBalances: true });
    await setSettings(ctx, { payDay: 28 });
    expect(await getSettings(ctx)).toMatchObject({ payDay: 28, monthlyIncomeMinor: 400_000, hideBalances: true });
  });

  it('every write is recorded in sync_log', async () => {
    const { ctx, add } = await setup();
    const id = await add({ type: 'expense', amount: 1000 });
    await deleteTransaction(ctx, id);
    const ops = await ctx.db.all<{ op: string }>("SELECT op FROM sync_log WHERE row_id = ? ORDER BY created_at, rowid", [id]);
    expect(ops.map((o) => o.op)).toEqual(['insert', 'delete']);
  });
});

describe('balances', () => {
  it('apply income, expense, transfer, refund and adjustment correctly', async () => {
    const { ctx, add, bank, wallet } = await setup();
    await add({ type: 'income', amount: 400_000 }); // +4000
    const lunch = await add({ type: 'expense', amount: 2_000 }); // −20
    await add({ type: 'transfer', amount: 50_000, toAccountId: wallet }); // −500 / +500
    await add({ type: 'refund', amount: 500, refundOfId: lunch }); // +5
    expect((await getAccount(ctx, bank))!.balance).toBe(100_000 + 400_000 - 2_000 - 50_000 + 500);
    expect((await getAccount(ctx, wallet))!.balance).toBe(50_000);

    const adjId = await adjustBalance(ctx, wallet, 48_000, 'Counted cash');
    expect(adjId).not.toBeNull();
    expect((await getAccount(ctx, wallet))!.balance).toBe(48_000);
    expect(await adjustBalance(ctx, wallet, 48_000, null)).toBeNull();

    // Adjustments never show up as income or spending.
    const flow = await cashFlow(ctx, NOV.from, NOV.to);
    expect(flow).toMatchObject({ moneyIn: 400_000, moneyOut: 1_500 });
  });

  it('credit card: purchase is an expense, paying the card is a transfer', async () => {
    const { ctx, add, card, bank } = await setup();
    await add({ type: 'expense', amount: 30_000, accountId: card, categoryId: (await setupCat(ctx, 'groceries')) });
    let c = (await getAccount(ctx, card))!;
    expect(c.balance).toBe(-30_000);
    expect(c.utilisationBps).toBe(600); // 300 / 5000 = 6%
    await add({ type: 'transfer', amount: 30_000, accountId: bank, toAccountId: card });
    c = (await getAccount(ctx, card))!;
    expect(c.balance).toBe(0);
    const flow = await cashFlow(ctx, NOV.from, NOV.to);
    expect(flow.moneyOut).toBe(30_000); // counted once, at purchase
  });

  it('net worth = assets − liabilities', async () => {
    const { ctx, add, card } = await setup();
    await add({ type: 'expense', amount: 10_000, accountId: card });
    expect(netWorth(await listAccounts(ctx))).toBe(100_000 - 10_000);
  });
});

async function setupCat(ctx: { db: import('@/db/adapter').SqlDb }, key: string) {
  return (await ctx.db.get<{ id: string }>('SELECT id FROM categories WHERE name_key = ?', [key]))!.id;
}

describe('report rules', () => {
  it('acceptance: a RM500 transfer from Bank to E-wallet does not change Money OUT', async () => {
    const { ctx, add, wallet } = await setup();
    await add({ type: 'expense', amount: 9_000 });
    const before = await cashFlow(ctx, NOV.from, NOV.to);
    await add({ type: 'transfer', amount: 50_000, toAccountId: wallet });
    const after = await cashFlow(ctx, NOV.from, NOV.to);
    expect(after.moneyOut).toBe(before.moneyOut);
    expect(after.moneyIn).toBe(before.moneyIn);
    expect(await spendingByCategory(ctx, NOV.from, NOV.to)).toHaveLength(1);
  });

  it('refunds reduce the original category, and are not income', async () => {
    const { ctx, add, cat } = await setup();
    const shoes = await add({ type: 'expense', amount: 20_000, categoryId: cat('shopping') });
    await add({ type: 'expense', amount: 5_000, categoryId: cat('food') });
    await add({ type: 'refund', amount: 8_000, refundOfId: shoes });
    const flow = await cashFlow(ctx, NOV.from, NOV.to);
    expect(flow).toMatchObject({ moneyIn: 0, moneyOut: 17_000 });
    const cats = await spendingByCategory(ctx, NOV.from, NOV.to);
    expect(cats.map((c) => [c.categoryId, c.total])).toEqual([
      [cat('shopping'), 12_000],
      [cat('food'), 5_000],
    ]);
    expect((await getTransaction(ctx, shoes))!.refundedAmount).toBe(8_000);
  });

  it('refunds cannot exceed the original', async () => {
    const { add } = await setup();
    const t = await add({ type: 'expense', amount: 1_000 });
    await add({ type: 'refund', amount: 600, refundOfId: t });
    await expect(add({ type: 'refund', amount: 500, refundOfId: t })).rejects.toThrow('amount: exceeds_original');
  });

  it('split transactions report under each split category', async () => {
    const { ctx, add, cat } = await setup();
    await add({
      type: 'expense',
      amount: 15_000,
      categoryId: null,
      splits: [
        { categoryId: cat('groceries'), amount: 12_000 },
        { categoryId: cat('personal_care'), amount: 3_000 },
      ],
    });
    const cats = await spendingByCategory(ctx, NOV.from, NOV.to);
    expect(cats.map((c) => [c.categoryId, c.total, c.shareBps])).toEqual([
      [cat('groceries'), 12_000, 8000],
      [cat('personal_care'), 3_000, 2000],
    ]);
    expect((await cashFlow(ctx, NOV.from, NOV.to)).moneyOut).toBe(15_000);
    // Filtering by a split's category finds the parent transaction.
    expect(await listTransactions(ctx, { categoryIds: [cat('personal_care')] })).toHaveLength(1);
  });

  it('split amounts must add up to the total', async () => {
    const { add, cat } = await setup();
    await expect(
      add({
        type: 'expense',
        amount: 15_000,
        categoryId: null,
        splits: [
          { categoryId: cat('groceries'), amount: 12_000 },
          { categoryId: cat('food'), amount: 2_999 },
        ],
      }),
    ).rejects.toThrow('splits: sum_mismatch');
  });

  it('sub-categories roll up into their parent', async () => {
    const { ctx, add, cat } = await setup();
    await add({ type: 'expense', amount: 15_000, categoryId: cat('ptptn') });
    await add({ type: 'expense', amount: 65_000, categoryId: cat('car_loan') });
    const cats = await spendingByCategory(ctx, NOV.from, NOV.to);
    expect(cats).toHaveLength(1);
    expect(cats[0]).toMatchObject({ categoryId: cat('loans'), total: 80_000 });
  });

  it('commitment payments are excluded from discretionary spending (no double counting)', async () => {
    const { ctx, add, cat } = await setup();
    await add({ type: 'expense', amount: 9_000, localDate: '2026-11-05' });
    const loan = await add({ type: 'expense', amount: 150_000, categoryId: cat('loans'), localDate: '2026-11-05' });
    await ctx.db.run("UPDATE transactions SET commitment_payment_id = 'cp-1' WHERE id = ?", [loan]);
    await add({ type: 'expense', amount: 1_000, localDate: '2026-11-11' });
    const cycle = getPayCycle('2026-11-11', 1);
    expect(await discretionarySpend(ctx, cycle, '2026-11-11')).toEqual({ beforeToday: 9_000, today: 1_000 });
    // ...but it is still real spending in Money OUT.
    expect((await cashFlow(ctx, NOV.from, NOV.to)).moneyOut).toBe(160_000);
  });

  it('daily totals are zero-filled', async () => {
    const { ctx, add } = await setup();
    await add({ type: 'expense', amount: 1_000, localDate: '2026-11-02' });
    const days = await dailyTotals(ctx, '2026-11-01', '2026-11-03');
    expect(days).toEqual([
      { date: '2026-11-01', out: 0, in: 0 },
      { date: '2026-11-02', out: 1_000, in: 0 },
      { date: '2026-11-03', out: 0, in: 0 },
    ]);
  });
});

describe('dashboard', () => {
  it('acceptance: safe-to-spend RM60 with "left today", from real transactions', async () => {
    const { ctx, add } = await setup();
    // Commitments arrive in Phase 2 (0 here); the RM1,500 case is covered by the pure safeToSpend tests.
    await setSettings(ctx, { payDay: 1, monthlyIncomeMinor: 400_000, savingsTargetMinor: 40_000 });
    await add({ type: 'expense', amount: 90_000, localDate: '2026-11-04' });
    await add({ type: 'transfer', amount: 50_000, toAccountId: (await listAccounts(ctx))[1].id, localDate: '2026-11-05' });
    await add({ type: 'expense', amount: 3_800, localDate: '2026-11-11' });
    const d = await getDashboard(ctx, await getSettings(ctx), '2026-11-11');
    // (4000 − 0 − 400 − 900) ÷ 20 days = RM135.00; transfer ignored; RM38 spent today.
    expect(d.safe).toMatchObject({ status: 'ok', perDay: 13_500, leftToday: 9_700, daysLeft: 20 });
    expect(d.spentToday).toBe(3_800);
    expect(d.flow.moneyOut).toBe(93_800);
    expect(d.topCategories[0]).toMatchObject({ total: 93_800, shareBps: 10_000 });
  });

  it('pay-day cycle: income received counts if larger than the configured figure', async () => {
    const { ctx, add } = await setup();
    await setSettings(ctx, { payDay: 25, monthlyIncomeMinor: 0 });
    await add({ type: 'income', amount: 300_000, localDate: '2026-10-25' });
    const d = await getDashboard(ctx, await getSettings(ctx), '2026-11-19');
    expect(d.cycle).toMatchObject({ start: '2026-10-25', end: '2026-11-24' });
    expect(d.safe).toMatchObject({ status: 'ok', daysLeft: 6, perDay: 50_000 });
  });

  it('acceptance: deleting a transaction updates balances, reports and dashboard instantly; undo restores', async () => {
    const { ctx, add, bank, cat } = await setup();
    await setSettings(ctx, { monthlyIncomeMinor: 300_000 });
    const t = await add({ type: 'expense', amount: 25_000, categoryId: cat('shopping'), localDate: '2026-11-10' });
    const refund = await add({ type: 'refund', amount: 5_000, refundOfId: t, localDate: '2026-11-10' });
    const before = await getDashboard(ctx, await getSettings(ctx), '2026-11-11');
    expect(before.flow.moneyOut).toBe(20_000);

    const deleted = await deleteTransaction(ctx, t);
    expect(deleted).toEqual([t, refund]); // refunds go with their original
    expect((await getAccount(ctx, bank))!.balance).toBe(100_000);
    const after = await getDashboard(ctx, await getSettings(ctx), '2026-11-11');
    expect(after.flow.moneyOut).toBe(0);
    expect(after.topCategories).toEqual([]);
    expect(await listTransactions(ctx)).toHaveLength(0);

    await restoreTransactions(ctx, deleted);
    expect((await getAccount(ctx, bank))!.balance).toBe(100_000 - 20_000);
    expect((await getDashboard(ctx, await getSettings(ctx), '2026-11-11')).flow.moneyOut).toBe(20_000);
  });

  it('cycle report compares with the previous cycle', async () => {
    const { ctx, add, cat } = await setup();
    await add({ type: 'expense', amount: 10_000, categoryId: cat('food'), localDate: '2026-10-10' });
    await add({ type: 'expense', amount: 13_200, categoryId: cat('food'), localDate: '2026-11-10' });
    const r = await getCycleReport(ctx, 1, '2026-11-19');
    expect(r.moneyOutChangeBps).toBe(3200);
    expect(r.categories[0]).toMatchObject({ total: 13_200, previous: 10_000, changeBps: 3200 });
    expect(r.daily).toHaveLength(30);
    const prev = await getCycleReport(ctx, 1, '2026-11-19', -1);
    expect(prev.cycle.start).toBe('2026-10-01');
  });
});

describe('editing', () => {
  it('update replaces fields, splits and tags', async () => {
    const { ctx, add, cat } = await setup();
    const id = await add({ type: 'expense', amount: 1_000, tags: ['work', 'Work', ' #claimable '] });
    expect((await getTransaction(ctx, id))!.tags).toEqual(['claimable', 'work']);
    await updateTransaction(ctx, id, {
      type: 'expense',
      amount: 2_000,
      accountId: (await listAccounts(ctx))[0].id,
      categoryId: cat('transport'),
      localDate: '2026-11-12',
      occurredAt: Date.now(),
      tags: ['work'],
    });
    const t = (await getTransaction(ctx, id))!;
    expect(t).toMatchObject({ amount: 2_000, categoryId: cat('transport'), localDate: '2026-11-12', tags: ['work'] });
  });

  it('rejects wrong-kind categories and archived/missing accounts', async () => {
    const { add, cat } = await setup();
    await expect(add({ type: 'income', amount: 100, categoryId: cat('food') })).rejects.toThrow('categoryId: wrong_kind');
    await expect(add({ type: 'expense', amount: 100, accountId: 'nope' })).rejects.toThrow('accountId: not_found');
  });
});
