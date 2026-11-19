import { addDays, dayOfWeek, getPayCycle, localDateTimeToEpochMs, type LocalDate, parseLocalDate } from '@/core/dates';
import { createAccount } from '@/features/accounts/accounts.repo';
import { createTransaction } from '@/features/transactions/transactions.repo';
import type { TransactionInput } from '@/features/transactions/rules';
import { setSettings } from '@/features/settings/settings.repo';
import type { Ctx } from '../helpers';

/**
 * Realistic Malaysian demo data: a salaried worker paid on the 25th,
 * ~3 months of daily spending, bills, transfers to e-wallet, a credit card
 * and its payment, and a refund. Deterministic for a given `today`.
 */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DemoResult {
  accounts: number;
  transactions: number;
}

export async function loadDemoData(ctx: Ctx, today: LocalDate, opts: { months?: number } = {}): Promise<DemoResult> {
  const months = opts.months ?? 3;
  const rand = mulberry32(parseLocalDate(today).d * 7919 + months);
  /** Random sen amount between lo and hi ringgit, rounded to 10 sen. */
  const rm = (lo: number, hi: number) => (Math.floor(lo * 10 + rand() * (hi - lo) * 10) * 10) as number;
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];

  return ctx.db.transaction(async (db) => {
    const c: Ctx = { db, userId: ctx.userId };
    const cats = await db.all<{ id: string; name_key: string }>(
      'SELECT id, name_key FROM categories WHERE user_id = ? AND name_key IS NOT NULL AND deleted_at IS NULL',
      [ctx.userId],
    );
    const cat = (key: string) => {
      const found = cats.find((x) => x.name_key === key);
      if (!found) throw new Error(`Demo data needs category ${key}`);
      return found.id;
    };

    const bank = await createAccount(c, { name: 'Maybank Savings', type: 'bank', currency: 'MYR', openingBalance: 320_000, icon: '🏦' });
    const cash = await createAccount(c, { name: 'Cash', type: 'cash', currency: 'MYR', openingBalance: 15_000, icon: '💵' });
    const tng = await createAccount(c, { name: 'TNG eWallet', type: 'ewallet', currency: 'MYR', openingBalance: 4_000, icon: '📱' });
    const card = await createAccount(c, {
      name: 'Visa Card',
      type: 'credit_card',
      currency: 'MYR',
      openingBalance: 0,
      icon: '💳',
      creditLimit: 800_000,
      statementDay: 15,
      dueDay: 5,
    });

    const start = getPayCycle(addDays(today, -months * 31), 25).start;
    let count = 0;
    const add = async (localDate: LocalDate, hour: number, i: Omit<TransactionInput, 'localDate' | 'occurredAt'>) => {
      const at = new Date(2000, 0, 1, hour, Math.floor(rand() * 60));
      await createTransaction(c, { ...i, localDate, occurredAt: localDateTimeToEpochMs(localDate, at) });
      count++;
    };
    let lastFoodId: string | null = null;

    for (let d = start; d <= today; d = addDays(d, 1)) {
      const { d: dom } = parseLocalDate(d);
      const dow = dayOfWeek(d);
      const weekend = dow === 0 || dow === 6;

      // Income & fixed bills
      if (dom === 25) await add(d, 9, { type: 'income', amount: 450_000, accountId: bank, categoryId: cat('salary'), merchantName: 'Syarikat Maju Sdn Bhd' });
      if (dom === 1) await add(d, 10, { type: 'expense', amount: 120_000, accountId: bank, categoryId: cat('housing'), note: 'Sewa rumah' });
      if (dom === 3) await add(d, 10, { type: 'expense', amount: 15_000, accountId: bank, categoryId: cat('ptptn'), merchantName: 'PTPTN' });
      if (dom === 5) await add(d, 10, { type: 'expense', amount: 65_000, accountId: bank, categoryId: cat('car_loan'), merchantName: 'Public Bank Hire Purchase' });
      if (dom === 7) await add(d, 20, { type: 'expense', amount: rm(95, 160), accountId: bank, categoryId: cat('utilities'), merchantName: 'TNB' });
      if (dom === 8) await add(d, 20, { type: 'expense', amount: 12_900, accountId: bank, categoryId: cat('phone_internet'), merchantName: 'Unifi' });
      if (dom === 12) await add(d, 21, { type: 'expense', amount: 5_490, accountId: card, categoryId: cat('subscriptions'), merchantName: 'Netflix' });
      if (dom === 14) await add(d, 21, { type: 'expense', amount: 1_690, accountId: card, categoryId: cat('subscriptions'), merchantName: 'Spotify' });
      if (dom === 26) await add(d, 9, { type: 'transfer', amount: 40_000, accountId: bank, toAccountId: tng, note: 'Top up TNG' });
      if (dom === 6) {
        // Pay off last month's card spending: a transfer, not an expense.
        await add(d, 12, { type: 'transfer', amount: rm(150, 300), accountId: bank, toAccountId: card, note: 'Card payment' });
      }
      if (dom === 27) await add(d, 13, { type: 'transfer', amount: 30_000, accountId: bank, toAccountId: cash, note: 'ATM' });

      // Daily food
      const meals = weekend ? 2 : 1 + (rand() < 0.6 ? 1 : 0);
      for (let m = 0; m < meals; m++) {
        const lunch = m === 0;
        const id = await createTransaction(c, {
          type: 'expense',
          amount: weekend ? rm(15, 60) : rm(7, 22),
          accountId: rand() < 0.5 ? tng : cash,
          categoryId: cat('food'),
          merchantName: pick(['Nasi Kandar Pelita', 'Mamak Ali', 'Kopitiam Ah Seng', 'McDonald’s', 'Gerai Nasi Lemak', 'ZUS Coffee']),
          localDate: d,
          occurredAt: localDateTimeToEpochMs(d, new Date(2000, 0, 1, lunch ? 13 : 19, Math.floor(rand() * 60))),
        });
        count++;
        lastFoodId = id;
      }
      if (dow === 6) await add(d, 11, { type: 'expense', amount: rm(80, 220), accountId: card, categoryId: cat('groceries'), merchantName: pick(['Lotus’s', 'Mydin', 'AEON', 'Jaya Grocer']) });
      if (dow === 1 || dow === 4) await add(d, 8, { type: 'expense', amount: rm(50, 80), accountId: card, categoryId: cat('fuel'), merchantName: pick(['Petronas', 'Shell']) });
      if (!weekend && rand() < 0.5) await add(d, 8, { type: 'expense', amount: rm(2, 9), accountId: tng, categoryId: cat('toll_parking'), merchantName: 'PLUS Toll' });
      if (rand() < 0.08) await add(d, 15, { type: 'expense', amount: rm(40, 250), accountId: card, categoryId: cat('shopping'), merchantName: pick(['Shopee', 'Lazada', 'Uniqlo', 'Mr DIY']), tags: ['online'] });
      if (weekend && rand() < 0.3) await add(d, 20, { type: 'expense', amount: rm(20, 60), accountId: card, categoryId: cat('entertainment'), merchantName: 'GSC Cinemas' });
      if (rand() < 0.05) await add(d, 11, { type: 'expense', amount: rm(30, 120), accountId: cash, categoryId: cat('health'), merchantName: 'Klinik Kesihatan', tags: ['tax-relief'] });
      if (dom === 15) await add(d, 18, { type: 'expense', amount: 20_000, accountId: bank, categoryId: cat('family'), note: 'Duit untuk mak' });
      if (dom === 20) await add(d, 18, { type: 'expense', amount: 5_000, accountId: tng, categoryId: cat('charity'), note: 'Infaq masjid' });
      if (dom === 18 && rand() < 0.7) await add(d, 22, { type: 'income', amount: rm(150, 400), accountId: tng, categoryId: cat('side_income'), merchantName: 'Grab Food delivery' });
    }

    // A refund against a recent shopping-like purchase: reduces Food spending, not income.
    if (lastFoodId) {
      await createTransaction(c, {
        type: 'refund',
        amount: 500,
        accountId: tng,
        refundOfId: lastFoodId,
        localDate: today,
        occurredAt: localDateTimeToEpochMs(today, new Date(2000, 0, 1, 8, 0)),
        note: 'Wrong order refund',
      });
      count++;
    }

    await setSettings(c, { payDay: 25, monthlyIncomeMinor: 450_000, savingsTargetMinor: 45_000 });
    return { accounts: 4, transactions: count };
  });
}
