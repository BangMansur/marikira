import { BASE_EXPENSE, BASE_INCOME } from './categories';
import type { CategorySeed, LocalePreset } from './types';

/**
 * Malaysia preset: MYR, local loan/savings schemes as sub-categories, and
 * LHDN tax-relief candidate codes (used by the Phase 5 year-end summary;
 * the codes only flag *possibly* eligible spending — they are not tax advice).
 */
const withMalaysia = (c: CategorySeed): CategorySeed => {
  switch (c.key) {
    case 'loans':
      return {
        ...c,
        children: [
          { key: 'ptptn', icon: '🎓', color: '#355070', bucket: 'savings_debt' },
          { key: 'car_loan', icon: '🚗', color: '#355070', bucket: 'savings_debt' },
          { key: 'housing_loan', icon: '🏡', color: '#355070', bucket: 'savings_debt' },
          { key: 'credit_card_interest', icon: '💳', color: '#355070', bucket: 'savings_debt' },
        ],
      };
    case 'savings_investments':
      return {
        ...c,
        children: [
          { key: 'epf', icon: '🧓', color: '#40916C', bucket: 'savings_debt', taxReliefCode: 'MY_EPF' },
          { key: 'asb', icon: '📊', color: '#40916C', bucket: 'savings_debt' },
          { key: 'tabung_haji', icon: '🕋', color: '#40916C', bucket: 'savings_debt' },
          { key: 'prs', icon: '🏛️', color: '#40916C', bucket: 'savings_debt', taxReliefCode: 'MY_PRS' },
        ],
      };
    case 'insurance':
      return {
        ...c,
        taxReliefCode: 'MY_INSURANCE',
        children: [{ key: 'socso', icon: '🦺', color: '#2A9D8F', bucket: 'need', taxReliefCode: 'MY_SOCSO' }],
      };
    case 'health':
      return { ...c, taxReliefCode: 'MY_MEDICAL' };
    case 'education':
      return { ...c, taxReliefCode: 'MY_EDUCATION' };
    case 'phone_internet':
      return { ...c, taxReliefCode: 'MY_LIFESTYLE' };
    case 'charity':
      return { ...c, taxReliefCode: 'MY_ZAKAT_DONATION' };
    default:
      return c;
  }
};

export const MY_PRESET: LocalePreset = {
  id: 'MY',
  currency: 'MYR',
  suggestedPayDay: 25,
  language: 'en',
  categories: [...BASE_EXPENSE.map(withMalaysia), ...BASE_INCOME],
  accountSuggestions: [
    { nameKey: 'cash', type: 'cash', icon: '💵' },
    { nameKey: 'bank', type: 'bank', icon: '🏦' },
    { nameKey: 'tng', type: 'ewallet', icon: '📱' },
    { nameKey: 'duitnow', type: 'ewallet', icon: '📲' },
    { nameKey: 'credit_card', type: 'credit_card', icon: '💳' },
  ],
};
