import { BASE_EXPENSE, BASE_INCOME } from './categories';
import { MY_PRESET } from './my';
import type { LocalePreset } from './types';

export const GENERIC_PRESET: LocalePreset = {
  id: 'GENERIC',
  currency: 'USD',
  suggestedPayDay: 1,
  language: 'en',
  categories: [...BASE_EXPENSE, ...BASE_INCOME],
  accountSuggestions: [
    { nameKey: 'cash', type: 'cash', icon: '💵' },
    { nameKey: 'bank', type: 'bank', icon: '🏦' },
    { nameKey: 'ewallet', type: 'ewallet', icon: '📱' },
    { nameKey: 'credit_card', type: 'credit_card', icon: '💳' },
  ],
};

export const PRESETS: Record<LocalePreset['id'], LocalePreset> = { MY: MY_PRESET, GENERIC: GENERIC_PRESET };

export function getPreset(id: LocalePreset['id']): LocalePreset {
  return PRESETS[id];
}

export * from './types';
