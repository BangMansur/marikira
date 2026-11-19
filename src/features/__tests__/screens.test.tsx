import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { todayLocal } from '@/core/dates';
import { loadDemoData } from '@/db/seed/demo';
import { createAccount, listAccounts } from '@/features/accounts/accounts.repo';
import { HomeScreen } from '@/features/dashboard/HomeScreen';
import { cashFlow } from '@/features/reports/reports.repo';
import { setSettings } from '@/features/settings/settings.repo';
import { AddTransactionScreen } from '@/features/transactions/AddTransactionScreen';
import { TransactionDetailScreen } from '@/features/transactions/TransactionDetailScreen';
import { createTransaction, listTransactions } from '@/features/transactions/transactions.repo';
import { makeCtx, renderWithApp } from '@/test/renderApp';
import { resetRouter, routerCalls, setParams } from '@/test/mockRouter';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories must use require
jest.mock('expo-router', () => require('@/test/mockRouter').routerMock);
jest.mock('@expo/vector-icons', () => ({ Ionicons: Object.assign(() => null, { glyphMap: {} }) }));

beforeEach(() => resetRouter());

async function ctxWithAccounts() {
  const ctx = await makeCtx();
  await createAccount(ctx, { name: 'Bank', type: 'bank', currency: 'MYR', openingBalance: 100_000 });
  await createAccount(ctx, { name: 'TNG', type: 'ewallet', currency: 'MYR', openingBalance: 0 });
  await setSettings(ctx, { onboardingDone: true, monthlyIncomeMinor: 300_000, payDay: 1 });
  return ctx;
}

const press = (id: string) => fireEvent.press(screen.getByTestId(id));
async function pressAll(ids: string[]) {
  for (const id of ids) await press(id);
}

describe('Home dashboard', () => {
  it('teaches on an empty ledger', async () => {
    const ctx = await ctxWithAccounts();
    await renderWithApp(<HomeScreen />, ctx);
    expect(await screen.findByText('Jom, start tracking!')).toBeTruthy();
    expect(screen.getByText('Safe to spend today')).toBeTruthy();
  });

  it('asks for income when none is set, instead of a meaningless figure', async () => {
    const ctx = await makeCtx();
    await renderWithApp(<HomeScreen />, ctx);
    expect(await screen.findByText(/Add your monthly income/)).toBeTruthy();
  });

  it('renders demo data: totals, top categories and recent transactions', async () => {
    const ctx = await makeCtx();
    await loadDemoData(ctx, todayLocal());
    await renderWithApp(<HomeScreen />, ctx);
    expect(await screen.findByText('Where it went')).toBeTruthy();
    expect(screen.getByTestId('money-in')).toBeTruthy();
    expect(screen.getByText('Recent')).toBeTruthy();
  });

  it('hides balances when the privacy toggle is on', async () => {
    const ctx = await ctxWithAccounts();
    await setSettings(ctx, { hideBalances: true });
    await renderWithApp(<HomeScreen />, ctx);
    await waitFor(() => expect(screen.getByTestId('safe-per-day')).toHaveTextContent('RM••••'));
    // Tapping the eye reveals them again.
    await press('toggle-hide-balances');
    await waitFor(() => expect(screen.getByTestId('safe-per-day')).toHaveTextContent(/^RM\d/));
  });
});

describe('Quick add (≤ 3 taps after typing the amount)', () => {
  it('amount with calculator → category → save', async () => {
    const ctx = await ctxWithAccounts();
    await renderWithApp(<AddTransactionScreen />, ctx);
    await screen.findByTestId('cat-food');
    await pressAll(['1', '2', 'dot', '5', '0', '+', '8'].map((k) => `key-${k}`));
    expect(screen.getByTestId('amount-display')).toHaveTextContent('RM20.50');
    expect(screen.getByTestId('amount-expression')).toHaveTextContent('12.50+8');
    await press('cat-food');
    await press('save-transaction');
    await waitFor(() => expect(routerCalls.back).toBe(1));
    const [tx] = await listTransactions(ctx);
    expect(tx).toMatchObject({ type: 'expense', amount: 2050, categoryNameKey: 'food', accountName: 'Bank' });
    expect(await screen.findByText('Saved RM20.50 ✓')).toBeTruthy();
  });

  it('save stays disabled until a category is chosen', async () => {
    const ctx = await ctxWithAccounts();
    await renderWithApp(<AddTransactionScreen />, ctx);
    await screen.findByTestId('cat-food');
    await press('key-5');
    expect(screen.getByTestId('save-transaction')).toBeDisabled();
    await press('cat-food');
    expect(screen.getByTestId('save-transaction')).toBeEnabled();
  });

  it('acceptance: a RM500 transfer Bank → e-wallet does not change Money OUT', async () => {
    const ctx = await ctxWithAccounts();
    const before = await cashFlow(ctx, '2000-01-01', '2100-01-01');
    await renderWithApp(<AddTransactionScreen />, ctx);
    await screen.findByTestId('type-transfer');
    await press('type-transfer');
    await pressAll(['key-5', 'key-0', 'key-0']);
    await press('account-0');
    await press('to-account-0');
    await press('save-transaction');
    await waitFor(() => expect(routerCalls.back).toBe(1));
    const after = await cashFlow(ctx, '2000-01-01', '2100-01-01');
    expect(after.moneyOut).toBe(before.moneyOut);
    const accounts = await listAccounts(ctx);
    expect(accounts.map((a) => a.balance)).toEqual([50_000, 50_000]);
  });
});

describe('Delete with undo', () => {
  it('deletes from the detail screen and restores via the snackbar', async () => {
    const ctx = await ctxWithAccounts();
    const [bank] = await listAccounts(ctx);
    const food = (await ctx.db.get<{ id: string }>("SELECT id FROM categories WHERE name_key = 'food'"))!.id;
    const id = await createTransaction(ctx, {
      type: 'expense',
      amount: 1_500,
      accountId: bank.id,
      categoryId: food,
      localDate: todayLocal(),
      occurredAt: Date.now(),
      merchantName: 'Mamak Ali',
    });
    setParams({ id });
    await renderWithApp(<TransactionDetailScreen />, ctx);
    await screen.findAllByText('Mamak Ali');
    await press('detail-delete');
    await waitFor(() => expect(routerCalls.back).toBe(1));
    expect(await listTransactions(ctx)).toHaveLength(0);
    expect((await listAccounts(ctx))[0].balance).toBe(100_000);
    await press('snackbar-action');
    await waitFor(async () => expect(await listTransactions(ctx)).toHaveLength(1));
    expect((await listAccounts(ctx))[0].balance).toBe(98_500);
  });
});
