import { createCategory, listCategories, removeCategory, resetDefaultCategories, setCategoryHidden } from '@/features/categories/categories.repo';
import { GENERIC_PRESET } from '@/presets';
import { cleanTags, normalizeMerchant, rankCategorySuggestions, validateTransactionInput } from '@/features/transactions/rules';
import { findMerchantCategory, lastUsedAccountId, listTransactions, searchMerchants, suggestCategories } from '@/features/transactions/transactions.repo';
import { setup } from './fixtures';

describe('rules', () => {
  it('normalizes merchants', () => {
    expect(normalizeMerchant('  Starbucks  KLCC!! ')).toBe('starbucks klcc');
    expect(normalizeMerchant('McDonald’s')).toBe('mcdonald s');
    expect(normalizeMerchant('Café Déjà')).toBe('cafe deja');
    expect(normalizeMerchant('!!!')).toBe('');
  });

  it('cleans tags', () => {
    expect(cleanTags([' a ', 'A', '#b', '', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('ranks suggestions: merchant > time of day > overall > order', () => {
    expect(
      rankCategorySuggestions({
        merchantCategoryId: 'groc',
        byTimeOfDay: [
          { categoryId: 'food', n: 3 },
          { categoryId: 'fuel', n: 5 },
        ],
        overall: [{ categoryId: 'shop', n: 9 }],
        ordered: ['food', 'groc', 'fuel', 'shop', 'other'],
        limit: 4,
      }),
    ).toEqual(['groc', 'fuel', 'food', 'shop']);
  });

  it('ignores hidden/unknown categories in suggestions', () => {
    expect(
      rankCategorySuggestions({ merchantCategoryId: 'gone', byTimeOfDay: [], overall: [], ordered: ['a', 'b'], limit: 5 }),
    ).toEqual(['a', 'b']);
  });

  it.each([
    [{ amount: 0 }, 'amount: positive'],
    [{ amount: 1.5 }, 'amount: positive'],
    [{ amount: 2_000_000_000 }, 'amount: too_large'],
    [{ localDate: '2026-02-30' }, 'localDate: invalid'],
    [{ categoryId: null }, 'categoryId: required'],
    [{ type: 'transfer', categoryId: null, toAccountId: 'acc' }, 'toAccountId: same_account'],
    [{ type: 'transfer', categoryId: null }, 'toAccountId: required'],
    [{ type: 'transfer', toAccountId: 'other' }, 'categoryId: not_allowed'],
  ] as const)('validation %#', (patch, msg) => {
    expect(() =>
      validateTransactionInput({
        type: 'expense',
        amount: 100,
        accountId: 'acc',
        categoryId: 'c',
        localDate: '2026-11-10',
        occurredAt: 0,
        ...(patch as object),
      }),
    ).toThrow(msg);
  });
});

describe('merchant learning & smart defaults', () => {
  it('learns merchant → category from the latest choice (corrections win)', async () => {
    const { ctx, add, cat } = await setup();
    await add({ type: 'expense', amount: 1_000, merchantName: 'Lotus’s', categoryId: cat('food') });
    expect(await findMerchantCategory(ctx, 'lotus s')).toBe(cat('food'));
    await add({ type: 'expense', amount: 9_000, merchantName: "LOTUS'S", categoryId: cat('groceries') });
    expect(await findMerchantCategory(ctx, 'Lotus’s')).toBe(cat('groceries'));
    expect(await searchMerchants(ctx, 'lot')).toEqual(["LOTUS'S"]);
  });

  it('suggests the merchant’s category first, then time-of-day habits', async () => {
    const { ctx, add, cat } = await setup();
    const at = (h: number) => new Date(2026, 10, 10, h, 15).getTime();
    for (let i = 0; i < 3; i++) await add({ type: 'expense', amount: 500, categoryId: cat('food'), occurredAt: at(13) });
    await add({ type: 'expense', amount: 500, categoryId: cat('fuel'), occurredAt: at(8) });
    await add({ type: 'expense', amount: 500, merchantName: 'Shell', categoryId: cat('fuel'), occurredAt: at(8) });
    const now = new Date(2026, 10, 11).getTime();
    const lunch = await suggestCategories(ctx, { kind: 'expense', hour: 13, now });
    expect(lunch[0]).toBe(cat('food'));
    const shell = await suggestCategories(ctx, { kind: 'expense', hour: 13, now, merchantName: 'shell' });
    expect(shell.slice(0, 2)).toEqual([cat('fuel'), cat('food')]);
  });

  it('defaults to the last used account', async () => {
    const { ctx, add, wallet } = await setup();
    expect(await lastUsedAccountId(ctx)).toBeNull();
    await add({ type: 'expense', amount: 500, accountId: wallet });
    expect(await lastUsedAccountId(ctx)).toBe(wallet);
  });
});

describe('search & filter', () => {
  it('filters by text, type, account, amount range, tags; sorts', async () => {
    const { ctx, add, wallet, cat } = await setup();
    await add({ type: 'expense', amount: 1_250, merchantName: 'Mamak Ali', note: 'teh tarik', localDate: '2026-11-01' });
    await add({ type: 'expense', amount: 8_000, accountId: wallet, categoryId: cat('groceries'), tags: ['family'], localDate: '2026-11-02' });
    await add({ type: 'income', amount: 400_000, localDate: '2026-11-03' });
    await add({ type: 'expense', amount: 300, note: '50%_off', localDate: '2026-11-04' });

    expect((await listTransactions(ctx, { text: 'mamak' })).map((t) => t.amount)).toEqual([1_250]);
    expect((await listTransactions(ctx, { text: 'TEH' })).map((t) => t.amount)).toEqual([1_250]);
    expect((await listTransactions(ctx, { text: '%_' })).map((t) => t.amount)).toEqual([300]);
    expect((await listTransactions(ctx, { types: ['income'] })).map((t) => t.amount)).toEqual([400_000]);
    expect((await listTransactions(ctx, { accountIds: [wallet] })).map((t) => t.amount)).toEqual([8_000]);
    expect((await listTransactions(ctx, { minAmount: 1_000, maxAmount: 10_000 })).map((t) => t.amount)).toEqual([8_000, 1_250]);
    expect((await listTransactions(ctx, { tagNames: ['FAMILY'] })).map((t) => t.amount)).toEqual([8_000]);
    expect((await listTransactions(ctx, { from: '2026-11-02', to: '2026-11-03' })).length).toBe(2);
    expect((await listTransactions(ctx, { sort: 'amount_desc', limit: 2 })).map((t) => t.amount)).toEqual([400_000, 8_000]);
    expect((await listTransactions(ctx, { sort: 'date_asc', limit: 1, offset: 1 })).map((t) => t.localDate)).toEqual(['2026-11-02']);
    expect((await listTransactions(ctx, { categoryIds: [cat('groceries')] })).map((t) => t.amount)).toEqual([8_000]);
  });
});

describe('categories', () => {
  it('seeds MY defaults with buckets and sub-categories', async () => {
    const { ctx } = await setup();
    const exp = await listCategories(ctx, { kind: 'expense' });
    expect(exp.find((c) => c.nameKey === 'ptptn')?.parentId).toBe(exp.find((c) => c.nameKey === 'loans')?.id);
    expect(exp.every((c) => c.bucket)).toBe(true);
    const inc = await listCategories(ctx, { kind: 'income' });
    expect(inc.every((c) => c.bucket === null)).toBe(true);
  });

  it('built-ins are hidden not deleted; unused custom ones are deleted', async () => {
    const { ctx, add, cat } = await setup();
    expect(await removeCategory(ctx, cat('travel'))).toBe('hidden');
    const custom = await createCategory(ctx, { name: 'Kucing', kind: 'expense', icon: '🐈', color: '#000', bucket: 'want' });
    expect(await removeCategory(ctx, custom)).toBe('deleted');
    const used = await createCategory(ctx, { name: 'Hobby', kind: 'expense', icon: '🎨', color: '#000', bucket: 'want' });
    await add({ type: 'expense', amount: 100, categoryId: used });
    expect(await removeCategory(ctx, used)).toBe('hidden');
    await setCategoryHidden(ctx, used, false);
    expect((await listCategories(ctx)).some((c) => c.id === used)).toBe(true);
  });
});

describe('preset switching', () => {
  it('re-seeds categories for another preset only while there is no history', async () => {
    const { ctx, add } = await setup();
    expect(await resetDefaultCategories(ctx, GENERIC_PRESET.categories, (k) => k)).toBe(true);
    const keys = (await listCategories(ctx)).map((c) => c.nameKey);
    expect(keys).not.toContain('ptptn');
    expect(keys).toContain('food');
    const food = (await listCategories(ctx)).find((c) => c.nameKey === 'food')!.id;
    await add({ type: 'expense', amount: 100, categoryId: food });
    expect(await resetDefaultCategories(ctx, GENERIC_PRESET.categories, (k) => k)).toBe(false);
  });
});
