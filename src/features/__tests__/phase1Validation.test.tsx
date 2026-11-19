/**
 * Phase 1 validation: automated acceptance checks against the REAL app.
 *
 * - The whole app is rendered through expo-router's in-memory router: root layout, DB gate,
 *   lock gate, tabs, modals and real screens. Nothing in src/ is mocked.
 * - Native modules are shimmed with real implementations (src/test/nativeShims.ts):
 *   expo-sqlite → a real SQLite engine, secure store → in-memory keystore, crypto → Node CSPRNG.
 * - Runs the production path: encrypted mode with a simulated SQLCipher build.
 * - Assertions are delta-based on what the user SEES: read the value on screen, act, assert the
 *   exact change in sen.
 * - Today is frozen at 2026-11-19 12:00 local. Pay day 25 (MY preset) → cycle 25 Oct – 24 Nov,
 *   6 days left including today.
 */
import { renderRouter, screen, fireEvent, waitFor, act } from 'expo-router/testing-library';
import { router } from 'expo-router';
import { Alert } from 'react-native';
import en from '@/i18n/en.json';
import ms from '@/i18n/ms.json';
import i18n, { initI18n } from '@/i18n';
import { queryClient } from '@/stores/queryClient';
import { useSession } from '@/stores/session';
import { useSnackbar } from '@/stores/snackbar';
import { resetNativeShims, secureStoreContents, sqliteState } from '@/test/nativeShims';

/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories must use require */
jest.mock('expo-sqlite', () => require('@/test/nativeShims').expoSqliteShim());
jest.mock('expo-secure-store', () => require('@/test/nativeShims').secureStoreShim());
jest.mock('expo-crypto', () => require('@/test/nativeShims').expoCryptoShim());
/* eslint-enable @typescript-eslint/no-require-imports */
// Production runtime (not Expo Go): encrypted path, biometrics allowed, no test banner.
jest.mock('@/runtime', () => ({ getRuntimeMode: () => 'encrypted', isExpoGoTestMode: () => false }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: Object.assign(() => null, { glyphMap: {} }) }));

jest.setTimeout(60_000);

const NOW = new Date(2026, 10, 19, 12, 0, 0); // Thu 19 Nov 2026, local time
const DAYS_LEFT = 6; // 19..24 Nov inclusive (cycle 25 Oct – 24 Nov)

beforeEach(() => {
  // Freeze only the clock; real timers keep React and the router running normally.
  jest.useFakeTimers({
    now: NOW,
    doNotFake: [
      'nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout',
      'clearTimeout', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame',
      'requestIdleCallback', 'cancelIdleCallback', 'hrtime', 'performance',
    ],
  });
  resetNativeShims();
  sqliteState.sqlcipher = true;
  useSession.getState().reset();
  useSnackbar.getState().dismiss();
  initI18n('en');
});

afterEach(() => {
  queryClient.clear();
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------

const press = (testID: string) => fireEvent.press(screen.getByTestId(testID));
const pressText = (text: string | RegExp) => fireEvent.press(screen.getAllByText(text)[0]);

function textOf(el: { props: { children?: unknown } }): string {
  const c = el.props.children;
  if (typeof c === 'string' || typeof c === 'number') return String(c);
  if (Array.isArray(c)) return c.filter((x) => typeof x === 'string' || typeof x === 'number').join('');
  return '';
}

/** "RM1,234.50" / "-RM60.00" / "+RM4.00" → signed sen, using integer arithmetic only. */
function sen(text: string): number {
  const m = /^([+-])?RM([\d,]+)\.(\d{2})$/.exec(text.trim());
  if (!m) throw new Error(`Not a money string: "${text}"`);
  const v = Number(m[2].replace(/,/g, '')) * 100 + Number(m[3]);
  return m[1] === '-' ? -v : v;
}
const read = (testID: string) => sen(textOf(screen.getByTestId(testID)));

/** Snapshot of the dashboard figures a user sees. */
function dashboard() {
  return {
    moneyIn: read('money-in'),
    moneyOut: read('money-out'),
    spentToday: read('spent-today'),
    safePerDay: read('safe-per-day'),
    leftToday: read('left-today'),
  };
}
type Dash = ReturnType<typeof dashboard>;
/** Baseline snapshot, taken only once the dashboard shows fresh data. */
async function freshDashboard(): Promise<Dash> {
  await fresh(['dashboard']);
  return dashboard();
}
const delta = (a: Dash, b: Dash) =>
  Object.fromEntries(Object.keys(a).map((k) => [k, b[k as keyof Dash] - a[k as keyof Dash]])) as Dash;

async function launch() {
  const r = await renderRouter('./src/app', { initialUrl: '/' });
  await screen.findAllByTestId(/^onboarding(-test-mode)?$/, {}, { timeout: 10_000 });
  return r;
}

/** Production onboarding: English, Malaysia, RM4,000 income, pay day 25, Cash + Bank, Simple. */
async function onboard(opts: { income?: string } = {}) {
  await press('onboarding-next');
  await fireEvent.changeText(screen.getByTestId('onboarding-income'), opts.income ?? '4000');
  await press('onboarding-next');
  await press('onboarding-next');
  await press('onboarding-next');
  await screen.findByTestId('home', {}, { timeout: 10_000 });
  await screen.findByTestId('safe-per-day');
}

async function onboardWithDemo() {
  await press('onboarding-demo');
  await screen.findByTestId('home', {}, { timeout: 15_000 });
  await screen.findByTestId('money-out', {}, { timeout: 10_000 });
}

type AddOpts = {
  type?: 'expense' | 'income' | 'transfer';
  keys: string;
  cat?: string;
  from?: number;
  to?: number;
  daysBack?: number;
};

/** Quick-add through the real sheet: amount → category → (accounts, date) → Save. */
async function addTx(o: AddOpts) {
  await press('fab-add');
  await screen.findByTestId('add-transaction');
  await screen.findByTestId('key-1');
  if (o.type && o.type !== 'expense') await press(`type-${o.type}`);
  for (const ch of o.keys) await press(`key-${ch === '.' ? 'dot' : ch}`);
  if (o.cat) {
    await screen.findByTestId('cat-all');
    if (!screen.queryByTestId(`cat-${o.cat}`)) await press('cat-all');
    await press(`cat-${o.cat}`);
  }
  if (o.from != null) await press(`account-${o.from}`);
  if (o.to != null) await press(`to-account-${o.to}`);
  if (o.daysBack) {
    await pressText('More details');
    for (let i = 0; i < o.daysBack; i++) await pressText('‹');
  }
  await press('save-transaction');
  await waitFor(() => expect(screen.queryByTestId('add-transaction')).toBeNull());
  await fresh();
}

/** Query families each screen reads: the barrier insists these are mounted AND fresh. */
type Needs = ('dashboard' | 'accounts' | 'report')[];

/**
 * Freshness barrier. Waits until:
 *  1. every query in `needs` is being observed by a mounted screen (so we don't vacuously pass
 *     while a screen is still re-attaching after a sheet closes), and
 *  2. every observed query has been refetched since the last ledger change (none invalidated,
 *     none in flight).
 * Without this, an "unchanged" (delta 0) assertion could pass by reading stale values.
 */
async function fresh(needs: Needs = []) {
  await waitFor(
    () => {
      const observed = queryClient.getQueryCache().findAll().filter((q) => q.getObserversCount() > 0);
      for (const n of needs) expect(observed.map((q) => q.queryKey[0])).toContain(n);
      const pending = observed
        .filter((q) => q.state.isInvalidated || q.state.fetchStatus !== 'idle' || q.state.data === undefined)
        .map((q) => JSON.stringify(q.queryKey[0]));
      expect(pending).toEqual([]);
    },
    { timeout: 5_000 },
  );
  // 3. The screen has re-rendered with that fresh data (rendering can lag the cache by a commit).
  if (needs.includes('dashboard')) {
    await waitFor(
      () => {
        const q = queryClient.getQueryCache().findAll().find((x) => x.queryKey[0] === 'dashboard' && x.getObserversCount() > 0);
        const d = q?.state.data as { flow: { moneyIn: number; moneyOut: number }; spentToday: number } | undefined;
        expect(d).toBeDefined();
        expect({ in: read('money-in'), out: read('money-out'), today: read('spent-today') }).toEqual({
          in: d!.flow.moneyIn,
          out: d!.flow.moneyOut,
          today: d!.spentToday,
        });
      },
      { timeout: 5_000 },
    );
  }
}

/** Assert only once the screen shows fresh data (default: the Home dashboard). */
async function settled(fn: () => void, needs: Needs = ['dashboard']) {
  await fresh(needs);
  await waitFor(fn, { timeout: 5_000 });
}

/** Pop pushed screens (details, sheets) so the tab bar is mounted, then switch tab. */
async function goTab(name: 'home' | 'transactions' | 'plan' | 'reports') {
  for (let i = 0; i < 5 && !screen.queryByTestId(`tab-${name}`); i++) await act(async () => router.back());
  await press(`tab-${name}`);
  if (name === 'home') await screen.findByTestId('money-out');
  await fresh();
}

// ---------------------------------------------------------------------------------------
// 1. Ledger effects
// ---------------------------------------------------------------------------------------

describe('Phase 1 validation: ledger effects (delta-based, on screen)', () => {
  it('an expense increases Money OUT and today’s spend by exactly the amount', async () => {
    await launch();
    await onboard();
    const before = await freshDashboard();
    await addTx({ keys: '25.40', cat: 'food' });
    await settled(() => expect(delta(before, dashboard())).toMatchObject({ moneyOut: 2540, spentToday: 2540, moneyIn: 0 }));
    // The daily safe amount is fixed for the day; only "left today" moves.
    expect(delta(before, dashboard())).toMatchObject({ safePerDay: 0, leftToday: -2540 });
  });

  it('a RM500 transfer leaves Money IN/OUT unchanged and moves both balances by RM500', async () => {
    await launch();
    await onboard();
    await goTab('plan');
    await screen.findByTestId('account-balance-Bank account');
    await fresh(['accounts']);
    const bank0 = read('account-balance-Bank account');
    const cash0 = read('account-balance-Cash');
    await goTab('home');
    const before = await freshDashboard();
    // From Bank (account-1) to Cash (the only other account → to-account-0).
    await addTx({ type: 'transfer', keys: '500', from: 1, to: 0 });
    await settled(() => expect(delta(before, dashboard())).toEqual({ moneyIn: 0, moneyOut: 0, spentToday: 0, safePerDay: 0, leftToday: 0 }));
    await goTab('plan');
    await settled(() => {
      expect(read('account-balance-Bank account') - bank0).toBe(-50_000);
      expect(read('account-balance-Cash') - cash0).toBe(50_000);
    }, ['accounts']);
  });

  it('income increases Money IN only', async () => {
    await launch();
    await onboard();
    const before = await freshDashboard();
    await addTx({ type: 'income', keys: '150', cat: 'salary' });
    await settled(() => expect(delta(before, dashboard())).toMatchObject({ moneyIn: 15_000, moneyOut: 0, spentToday: 0 }));
  });

  it('a refund reduces Money OUT and its category, is not income, and cannot exceed the original', async () => {
    await launch();
    await onboard();
    await addTx({ keys: '80', cat: 'shopping' });
    await goTab('reports');
    await settled(() => expect(read('report-amt-shopping')).toBe(8_000), ['report']);
    await goTab('home');
    const before = await freshDashboard();

    // Open the expense and record a RM30 refund (prefilled with the full RM80; replace it).
    await goTab('transactions');
    await fireEvent.press(await screen.findByLabelText(/^Shopping, RM80\.00\./)); // the original expense row
    await screen.findByTestId('detail-refund');
    await press('detail-refund');
    await screen.findByTestId('add-transaction');
    expect(textOf(screen.getByTestId('amount-display'))).toBe('RM80.00');
    await fireEvent(screen.getByTestId('key-back'), 'longPress');
    for (const k of '30') await press(`key-${k}`);
    await press('save-transaction');
    await waitFor(() => expect(screen.queryByTestId('add-transaction')).toBeNull());
    await screen.findByText('RM30.00 refunded'); // back on the expense's detail screen

    await goTab('home');
    await settled(() => expect(delta(before, dashboard())).toMatchObject({ moneyOut: -3_000, moneyIn: 0, spentToday: -3_000 }));
    await goTab('reports');
    await settled(() => expect(read('report-amt-shopping')).toBe(5_000), ['report']);
    expect(read('report-money-in')).toBe(0);

    // A second refund of RM60 exceeds the RM50 left: rejected, nothing changes.
    await goTab('transactions');
    await fireEvent.press(await screen.findByLabelText(/^Shopping, RM80\.00\./)); // the original expense row
    await press('detail-refund');
    await screen.findByTestId('add-transaction');
    expect(textOf(screen.getByTestId('amount-display'))).toBe('RM50.00'); // remaining refundable
    await fireEvent(screen.getByTestId('key-back'), 'longPress');
    for (const k of '60') await press(`key-${k}`);
    await press('save-transaction');
    expect(await screen.findByText("Refund can't be more than the original")).toBeTruthy();
    await act(async () => router.back());
    await goTab('home');
    await settled(() => expect(delta(before, dashboard())).toMatchObject({ moneyOut: -3_000, moneyIn: 0 }));
  });

  it('delete updates totals instantly and Undo restores them exactly', async () => {
    await launch();
    await onboard();
    await addTx({ keys: '42.10', cat: 'transport' });
    await settled(() => expect(read('money-out')).toBe(4_210));
    const withTx = await freshDashboard();

    await goTab('transactions');
    await fireEvent.press(await screen.findByLabelText(/^Transport, RM42\.10\./));
    await screen.findByTestId('detail-delete');
    await press('detail-delete');
    await goTab('home');
    await settled(() => expect(delta(withTx, dashboard())).toMatchObject({ moneyOut: -4_210, spentToday: -4_210, leftToday: 4_210 }));

    await press('snackbar-action'); // Undo (the snackbar stays up for 5 s across screens)
    await settled(() => expect(delta(withTx, dashboard())).toEqual({ moneyIn: 0, moneyOut: 0, spentToday: 0, safePerDay: 0, leftToday: 0 }));
  });

  it('expenses dated last cycle are excluded from this cycle', async () => {
    await launch();
    await onboard();
    const before = await freshDashboard();
    // 26 days back from 19 Nov = 24 Oct, the last day of the previous cycle.
    await addTx({ keys: '77.77', cat: 'food', daysBack: 26 });
    await settled(() => expect(delta(before, dashboard())).toEqual({ moneyIn: 0, moneyOut: 0, spentToday: 0, safePerDay: 0, leftToday: 0 }));
    // ...but it is recorded, and counted in the previous cycle's report.
    await goTab('reports');
    expect(await screen.findByText('No data for this cycle')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Previous cycle'));
    await settled(() => expect(read('report-money-out')).toBe(7_777), ['report']);
  });
});

// ---------------------------------------------------------------------------------------
// 2. Entry, maths and display rules
// ---------------------------------------------------------------------------------------

describe('Phase 1 validation: entry and maths', () => {
  it('keypad 12.50+8 shows and saves exactly RM20.50', async () => {
    await launch();
    await onboard();
    const before = await freshDashboard();
    await press('fab-add');
    await screen.findByTestId('key-1');
    for (const k of ['1', '2', 'dot', '5', '0', '+', '8']) await press(`key-${k}`);
    expect(textOf(screen.getByTestId('amount-expression'))).toBe('12.50+8');
    expect(textOf(screen.getByTestId('amount-display'))).toBe('RM20.50');
    await press('cat-food');
    await press('save-transaction');
    await waitFor(() => expect(screen.queryByTestId('add-transaction')).toBeNull());
    await settled(() => expect(delta(before, dashboard()).moneyOut).toBe(2_050));
  });

  it('category percentages total exactly 100% (three equal categories → 34/33/33)', async () => {
    await launch();
    await onboard();
    for (const cat of ['food', 'groceries', 'transport']) await addTx({ keys: '10', cat });
    await goTab('reports');
    await settled(() => expect(screen.getByTestId('report-pct-food')).toBeTruthy(), ['report']);
    const pcts = ['food', 'groceries', 'transport'].map((k) => Number(textOf(screen.getByTestId(`report-pct-${k}`)).replace('%', '')));
    expect(pcts.reduce((a, b) => a + b, 0)).toBe(100);
    expect([...pcts].sort()).toEqual([33, 33, 34]);
  });

  it('category percentages total exactly 100% on 3 months of demo data', async () => {
    await launch();
    await onboardWithDemo();
    await goTab('reports');
    await screen.findByTestId('report-money-out', {}, { timeout: 10_000 });
    const pctEls = screen.getAllByTestId(/^report-pct-/);
    expect(pctEls.length).toBeGreaterThan(3);
    expect(pctEls.map((e) => Number(textOf(e).replace('%', ''))).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('safe-to-spend and "left today" match the formula to the sen', async () => {
    await launch();
    await onboard({ income: '4000' });
    // Spent before today (18 Nov, inside the cycle) and today.
    await addTx({ keys: '123.45', cat: 'groceries', daysBack: 1 });
    await addTx({ keys: '20.50', cat: 'food' });

    // Independent re-computation: (income − commitments − savings − spent before today) ÷ days left incl. today,
    // banker's rounding to the sen. Simple method → savings target 0; commitments arrive in Phase 2.
    const income = 400_000, commitments = 0, savings = 0, before = 12_345, today = 2_050;
    const pool = income - commitments - savings - before; // 387,655 sen
    const q = Math.floor(pool / DAYS_LEFT), r = pool - q * DAYS_LEFT;
    const perDay = 2 * r > DAYS_LEFT || (2 * r === DAYS_LEFT && q % 2 === 1) ? q + 1 : q; // 64,609 sen
    await settled(() => {
      expect(read('safe-per-day')).toBe(perDay);
      expect(read('left-today')).toBe(perDay - today);
    });
    expect(textOf(screen.getByTestId('safe-per-day'))).toBe('RM646.09');
    expect(textOf(screen.getByTestId('left-today'))).toBe('RM625.59');
    expect(screen.getByText('6 days left until pay day')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------------------
// 3. Privacy, language, data deletion
// ---------------------------------------------------------------------------------------

/** Every visible string and accessibility string in the rendered tree. */
function renderedStrings(): string[] {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (n == null) return;
    if (typeof n === 'string') return void out.push(n);
    if (Array.isArray(n)) return n.forEach(walk);
    const node = n as { type?: string; props?: Record<string, unknown>; children?: unknown };
    const p = node.props ?? {};
    for (const k of ['accessibilityLabel', 'accessibilityHint', 'placeholder']) if (typeof p[k] === 'string') out.push(p[k] as string);
    if (node.type === 'Text' && Array.isArray(node.children)) {
      const joined = node.children.filter((c) => typeof c === 'string').join('');
      if (joined) out.push(joined);
    }
    walk(node.children);
  };
  walk(screen.toJSON());
  return out;
}

const REAL_AMOUNT = /RM\s?\d/;

describe('Phase 1 validation: privacy', () => {
  it('Hide balances masks every amount on every screen (incl. accessibility labels and toasts)', async () => {
    await launch();
    await onboardWithDemo();
    await press('toggle-hide-balances');
    await settled(() => expect(textOf(screen.getByTestId('money-out'))).toBe('RM••••'));

    const leaks: string[] = [];
    const check = (where: string) => {
      for (const s of renderedStrings()) if (REAL_AMOUNT.test(s)) leaks.push(`${where}: ${s}`);
    };

    check('home');
    await goTab('transactions');
    await screen.findAllByTestId(/^tx-row-/, {}, { timeout: 10_000 });
    check('transactions');
    await fireEvent.press(screen.getAllByTestId(/^tx-row-/)[0]);
    await screen.findByTestId('tx-detail');
    check('transaction detail');
    await act(async () => router.back());
    await goTab('plan');
    await screen.findByTestId('net-worth');
    check('plan');
    await fireEvent.press(screen.getByTestId('account-row-Visa Card'));
    await screen.findByTestId('account-detail');
    await screen.findAllByTestId(/^tx-row-/);
    check('account detail');
    await act(async () => router.back());
    await goTab('reports');
    await screen.findByTestId('report-money-out');
    check('reports');
    await goTab('home');
    await addTx({ keys: '9.90', cat: 'food' });
    expect(await screen.findByText('Saved RM•••• ✓')).toBeTruthy();
    check('home after saving');

    expect(leaks).toEqual([]);
  });

  it('Delete all data erases the DB and its key and returns to onboarding', async () => {
    const r = await launch();
    await onboardWithDemo();
    const oldKey = secureStoreContents.get('marikira.db.key.v1');
    expect(oldKey).toMatch(/^[0-9a-f]{64}$/);
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      void buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });

    await press('open-settings');
    await screen.findByTestId('settings');
    await press('delete-all');

    await screen.findByTestId('onboarding', {}, { timeout: 10_000 });
    expect(r.getPathname()).toBe('/onboarding');
    expect(sqliteState.deleted).toContain('marikira.db');
    // A fresh database with a fresh key: no old data can come back.
    expect(secureStoreContents.get('marikira.db.key.v1')).not.toBe(oldKey);
    const ctx = useSession.getState().ctx!;
    expect(await ctx.db.get<{ n: number }>('SELECT count(*) AS n FROM transactions')).toEqual({ n: 0 });
    expect(await ctx.db.get<{ n: number }>('SELECT count(*) AS n FROM accounts')).toEqual({ n: 0 });
  });
});

// ---------------------------------------------------------------------------------------
// 4. Bahasa Melayu
// ---------------------------------------------------------------------------------------

type Tree = { [k: string]: string | string[] | Tree };
function leaves(obj: Tree, prefix = ''): [string, string | string[]][] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && !Array.isArray(v) ? leaves(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v] as [string, string | string[]]],
  );
}
const PLURAL = /_(zero|one|few|many|other)$/;

/**
 * Strings that are deliberately the same in English and Malay (brand names, acronyms, loanwords,
 * pure formatting). Anything else identical in both files counts as untranslated.
 */
const SAME_IN_BOTH = new Set([
  'paymentMethods.duitnow', // DuitNow
  'tx.minAmount', // "Min ({{symbol}})"
  'tx.transferTitle', // "{{from}} → {{to}}"
  'accounts.types.bank', // Bank
  'categories.ptptn',
  'categories.asb',
  'categories.tabung_haji',
  'categories.prs',
  'categories.bonus', // Bonus
  'onboarding.malaysia', // Malaysia
  'onboarding.accountNames.tng', // Touch 'n Go eWallet
  'onboarding.methods.50_30_20.title', // 50/30/20
  'settings.themes.system', // Auto
]);

describe('Phase 1 validation: Bahasa Melayu', () => {
  it('every i18n key resolves to a real Malay string (no fallback, no raw keys, no leftover {{vars}})', () => {
    const problems: string[] = [];
    const msOwn = new Map(leaves(ms as Tree));
    // Untranslated: identical to English and not on the allowlist (arrays: every element identical).
    for (const [key, enValue] of leaves(en as Tree)) {
      const msValue = msOwn.get(key);
      if (msValue !== undefined && JSON.stringify(msValue) === JSON.stringify(enValue) && !SAME_IN_BOTH.has(key)) {
        problems.push(`untranslated: ${key} = ${JSON.stringify(enValue)}`);
      }
    }
    for (const [key, enValue] of leaves(en as Tree)) {
      const base = key.replace(PLURAL, '');
      const vars = Object.fromEntries([...JSON.stringify(enValue).matchAll(/{{(\w+)}}/g)].map((m) => [m[1], 'X']));
      for (const count of PLURAL.test(key) ? [1, 5] : [undefined]) {
        const own = PLURAL.test(key) ? msOwn.get(`${base}_other`) : msOwn.get(key);
        if (own == null || own === '' || (Array.isArray(own) && own.length !== (enValue as string[]).length)) {
          problems.push(`missing in ms: ${key}`);
          continue;
        }
        const out = i18n.t(base, { lng: 'ms', fallbackLng: false, returnObjects: true, ...vars, ...(count != null ? { count } : {}) });
        const str = Array.isArray(out) ? out.join(' ') : String(out);
        if (str === base || str.includes('{{')) problems.push(`bad render: ${key} → ${str}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('every screen renders fully in BM: no raw keys, no English UI text', async () => {
    // Every English UI string except those deliberately identical in Malay.
    const englishOnly = new Set(
      leaves(en as Tree)
        .filter(([k, v]) => typeof v === 'string' && v.length > 3 && !v.includes('{{') && !SAME_IN_BOTH.has(k))
        .map(([, v]) => v as string),
    );
    const RAW_KEY = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_]+)+$/;
    const problems = new Set<string>();
    const check = (where: string) => {
      for (const s of renderedStrings()) {
        const t = s.replace(/^⚠️ /, '').trim();
        if (RAW_KEY.test(t)) problems.add(`${where}: raw key "${t}"`);
        if (englishOnly.has(t)) problems.add(`${where}: English "${t}"`);
      }
    };

    await launch();
    // Onboarding in BM, step by step.
    await pressText('Bahasa Melayu');
    await screen.findByText('Langkah 1 daripada 4');
    for (let step = 1; step <= 4; step++) {
      check(`onboarding step ${step}`);
      if (step === 2) await fireEvent.changeText(screen.getByTestId('onboarding-income'), '3500');
      await press('onboarding-next');
    }
    await screen.findByTestId('home', {}, { timeout: 10_000 });
    await screen.findByTestId('safe-per-day');

    await addTx({ keys: '12.50', cat: 'food' });
    await addTx({ type: 'income', keys: '200', cat: 'salary' });
    await addTx({ type: 'transfer', keys: '50', from: 1, to: 0 });
    check('home');

    await press('fab-add');
    await screen.findByTestId('key-1');
    await pressText('Butiran lanjut');
    check('add sheet');
    await act(async () => router.back());

    await goTab('transactions');
    await screen.findAllByTestId(/^tx-row-/);
    await fireEvent.press(screen.getByLabelText('Penapis'));
    check('transactions + filters');
    await pressText('Makanan & Minuman');
    await screen.findByTestId('tx-detail');
    check('transaction detail');
    await act(async () => router.back());

    await goTab('plan');
    await screen.findByTestId('net-worth');
    check('plan');
    await fireEvent.press(screen.getByTestId('account-row-Tunai'));
    await screen.findByTestId('account-detail');
    check('account detail');
    await act(async () => router.back());
    await press('add-account');
    await screen.findByTestId('account-edit');
    check('account edit');
    await act(async () => router.back());
    await press('manage-categories');
    await screen.findByTestId('categories');
    check('categories');
    await press('add-category');
    await screen.findByTestId('category-edit');
    check('category edit');
    await act(async () => router.back());
    await act(async () => router.back());

    await goTab('reports');
    await screen.findByTestId('report-money-out');
    check('reports');

    await goTab('home');
    await press('open-settings');
    await screen.findByTestId('settings');
    check('settings');
    await press('open-security');
    await screen.findByTestId('security');
    check('security');

    expect([...problems]).toEqual([]);
  });
});
