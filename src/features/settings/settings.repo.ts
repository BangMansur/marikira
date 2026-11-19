import type { SqlDb } from '@/db/adapter';
import { type Ctx, insertRow, updateRow } from '@/db/helpers';

export type BudgetMethod = 'simple' | '50_30_20' | 'zero_based';
export type ThemePref = 'system' | 'light' | 'dark';
export type Language = 'en' | 'ms';
export type PresetId = 'MY' | 'GENERIC';

export interface AppSettings {
  currency: string;
  presetId: PresetId;
  payDay: number;
  monthlyIncomeMinor: number;
  savingsTargetMinor: number;
  budgetMethod: BudgetMethod;
  theme: ThemePref;
  language: Language;
  hideBalances: boolean;
  lockEnabled: boolean;
  biometricsEnabled: boolean;
  autoLockSeconds: number;
  onboardingDone: boolean;
  lastAccountId: string | null;
  reminderTime: string | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  currency: 'MYR',
  presetId: 'MY',
  payDay: 1,
  monthlyIncomeMinor: 0,
  savingsTargetMinor: 0,
  budgetMethod: 'simple',
  theme: 'system',
  language: 'en',
  hideBalances: false,
  lockEnabled: false,
  biometricsEnabled: false,
  autoLockSeconds: 60,
  onboardingDone: false,
  lastAccountId: null,
  reminderTime: null,
};

type Key = keyof AppSettings;

/** Returns the single local user, creating it on first launch. */
export async function ensureUser(db: SqlDb): Promise<string> {
  const row = await db.get<{ id: string }>('SELECT id FROM users WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1');
  if (row) return row.id;
  return insertRow(db, 'users', { default_currency: 'MYR', country_code: 'MY' });
}

export async function getSettings({ db, userId }: Ctx): Promise<AppSettings> {
  const rows = await db.all<{ key: string; value: string }>(
    'SELECT key, value FROM settings WHERE user_id = ? AND deleted_at IS NULL',
    [userId],
  );
  const s: AppSettings = { ...DEFAULT_SETTINGS };
  for (const { key, value } of rows) {
    if (key in DEFAULT_SETTINGS) {
      try {
        (s as unknown as Record<string, unknown>)[key] = JSON.parse(value);
      } catch {
        // corrupt value → keep default
      }
    }
  }
  return s;
}

export async function setSettings(ctx: Ctx, patch: Partial<AppSettings>): Promise<void> {
  await ctx.db.transaction(async (db) => {
    for (const key of Object.keys(patch) as Key[]) {
      const value = JSON.stringify(patch[key] ?? null);
      const existing = await db.get<{ id: string }>(
        'SELECT id FROM settings WHERE user_id = ? AND key = ? AND deleted_at IS NULL',
        [ctx.userId, key],
      );
      if (existing) await updateRow(db, 'settings', existing.id, { value });
      else await insertRow(db, 'settings', { user_id: ctx.userId, key, value });
    }
    if (patch.currency || patch.presetId) {
      const s = await getSettings({ db, userId: ctx.userId });
      await updateRow(db, 'users', ctx.userId, {
        default_currency: s.currency,
        country_code: s.presetId === 'MY' ? 'MY' : 'XX',
      });
    }
  });
}
