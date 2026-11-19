import fs from 'fs';
import path from 'path';
import en from '../en.json';
import ms from '../ms.json';
import { BASE_EXPENSE, BASE_INCOME } from '@/presets/categories';
import { MY_PRESET } from '@/presets/my';
import { pickLanguage } from '..';

type Tree = { [k: string]: string | string[] | Tree };

function flatten(obj: Tree, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && !Array.isArray(v) ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

const PLURAL = /_(zero|one|few|many|other)$/; // '_two' omitted: neither language uses it, and keys like min_two exist
const base = (k: string) => k.replace(PLURAL, '');
const enKeys = new Set(flatten(en as Tree).map(base));
const msKeys = new Set(flatten(ms as Tree).map(base));

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sourceFiles(p);
    return /\.(tsx?|ts)$/.test(e.name) ? [p] : [];
  });
}

describe('translations', () => {
  it('English and Malay have exactly the same keys', () => {
    expect([...enKeys].filter((k) => !msKeys.has(k))).toEqual([]);
    expect([...msKeys].filter((k) => !enKeys.has(k))).toEqual([]);
  });

  it('every static t("…") key used in the code exists', () => {
    const missing: string[] = [];
    for (const file of sourceFiles(path.join(__dirname, '..', '..'))) {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) {
        if (!enKeys.has(m[1])) missing.push(`${path.basename(file)}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('dynamic key families are complete', () => {
    const families: Record<string, string[]> = {
      'accounts.types': ['cash', 'bank', 'ewallet', 'credit_card', 'investment', 'loan'],
      buckets: ['need', 'want', 'savings_debt', 'needHint', 'wantHint', 'savings_debtHint'],
      'tx.types': ['expense', 'income', 'transfer', 'refund', 'adjustment'],
      'tx.filter': ['all', 'out', 'in', 'transfer'],
      'tx.periods': ['cycle', 'last', 'all'],
      'tx.sorts': ['date_desc', 'date_asc', 'amount_desc', 'amount_asc'],
      paymentMethods: ['cash', 'card', 'duitnow', 'ewallet', 'online_banking'],
      'settings.themes': ['system', 'light', 'dark'],
      'security.timeouts': ['0', '60', '300', '900'],
      'onboarding.accountNames': MY_PRESET.accountSuggestions.map((a) => a.nameKey).concat(['ewallet']),
      'errors.validation': [
        'positive', 'too_large', 'invalid', 'required', 'same_account', 'not_allowed', 'min_two',
        'category_required', 'sum_mismatch', 'not_found', 'wrong_kind', 'exceeds_original',
        'currency_mismatch', 'too_long', 'adjustment_readonly',
      ],
      categories: [...BASE_EXPENSE, ...BASE_INCOME, ...MY_PRESET.categories].flatMap((c) => [c.key, ...(c.children ?? []).map((x) => x.key)]),
    };
    for (const m of ['simple', '50_30_20', 'zero_based']) families[`onboarding.methods.${m}`] = ['title', 'body'];
    const missing = Object.entries(families).flatMap(([prefix, keys]) => keys.map((k) => `${prefix}.${k}`).filter((k) => !enKeys.has(k)));
    expect(missing).toEqual([]);
  });

  it('picks Malay for Malay devices', () => {
    expect(pickLanguage(['ms'])).toBe('ms');
    expect(pickLanguage(['zh', 'en'])).toBe('en');
    expect(pickLanguage([null])).toBe('en');
  });
});
