import { by, device, element, expect, waitFor } from 'detox';

/**
 * Phase 1 E2E: fresh install → onboarding → quick-add an expense with the calculator →
 * dashboard reflects it → a transfer does not change Money OUT → delete + undo.
 */
const tap = (id: string) => element(by.id(id)).tap();

describe('Phase 1: first run and daily logging', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true, delete: true });
  });

  it('completes onboarding in four steps', async () => {
    await waitFor(element(by.id('onboarding'))).toBeVisible().withTimeout(20000);
    await tap('onboarding-next'); // language / country / currency (defaults: English, Malaysia, MYR)
    await element(by.id('onboarding-income')).typeText('4000');
    await tap('onboarding-next'); // pay day defaults to 25
    await tap('onboarding-next'); // accounts: Cash + Bank pre-selected
    await tap('onboarding-method-50_30_20');
    await tap('onboarding-next'); // finish
    await waitFor(element(by.id('home'))).toBeVisible().withTimeout(10000);
    await expect(element(by.id('home-empty'))).toBeVisible();
  });

  it('logs RM12.50 + RM8 as one food expense in 3 taps after the amount', async () => {
    await tap('fab-add');
    for (const k of ['1', '2', 'dot', '5', '0', '+', '8']) await tap(`key-${k}`);
    await expect(element(by.id('amount-display'))).toHaveText('RM20.50');
    await tap('cat-food');
    await tap('save-transaction');
    await waitFor(element(by.id('spent-today'))).toHaveText('RM20.50').withTimeout(5000);
    await expect(element(by.id('money-out'))).toHaveText('RM20.50');
  });

  it('a RM500 transfer between own accounts leaves Money OUT unchanged', async () => {
    await tap('fab-add');
    await tap('type-transfer');
    for (const k of ['5', '0', '0']) await tap(`key-${k}`);
    await tap('account-1'); // from Bank
    await tap('to-account-0'); // to Cash
    await tap('save-transaction');
    await waitFor(element(by.id('money-out'))).toHaveText('RM20.50').withTimeout(5000);
  });

  it('deletes a transaction and undoes it', async () => {
    await tap('tab-transactions');
    await element(by.text('Food & Drinks')).atIndex(0).tap();
    await tap('detail-delete');
    await tap('tab-home');
    await waitFor(element(by.id('money-out'))).toHaveText('RM0.00').withTimeout(5000);
    await tap('snackbar-action');
    await waitFor(element(by.id('money-out'))).toHaveText('RM20.50').withTimeout(5000);
  });
});
