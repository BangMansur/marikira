import type { CategorySeed } from './types';

/** Default categories shared by every preset (spec §4.4). */
export const BASE_EXPENSE: CategorySeed[] = [
  { key: 'food', kind: 'expense', icon: '🍜', color: '#E07A5F', bucket: 'want' },
  { key: 'groceries', kind: 'expense', icon: '🛒', color: '#81B29A', bucket: 'need' },
  { key: 'transport', kind: 'expense', icon: '🚌', color: '#3D85C6', bucket: 'need' },
  { key: 'fuel', kind: 'expense', icon: '⛽', color: '#F2A541', bucket: 'need' },
  { key: 'toll_parking', kind: 'expense', icon: '🅿️', color: '#6D597A', bucket: 'need' },
  { key: 'utilities', kind: 'expense', icon: '💡', color: '#F4D35E', bucket: 'need' },
  { key: 'phone_internet', kind: 'expense', icon: '📶', color: '#5FA8D3', bucket: 'need' },
  { key: 'housing', kind: 'expense', icon: '🏠', color: '#B56576', bucket: 'need' },
  { key: 'loans', kind: 'expense', icon: '🏦', color: '#355070', bucket: 'savings_debt' },
  { key: 'insurance', kind: 'expense', icon: '🛡️', color: '#2A9D8F', bucket: 'need' },
  { key: 'health', kind: 'expense', icon: '💊', color: '#E76F51', bucket: 'need' },
  { key: 'education', kind: 'expense', icon: '🎓', color: '#457B9D', bucket: 'need' },
  { key: 'shopping', kind: 'expense', icon: '🛍️', color: '#D81159', bucket: 'want' },
  { key: 'entertainment', kind: 'expense', icon: '🎬', color: '#8F2D56', bucket: 'want' },
  { key: 'subscriptions', kind: 'expense', icon: '🔁', color: '#7B2CBF', bucket: 'want' },
  { key: 'family', kind: 'expense', icon: '👨‍👩‍👧', color: '#FFB4A2', bucket: 'need' },
  { key: 'charity', kind: 'expense', icon: '🤲', color: '#52B788', bucket: 'want' },
  { key: 'personal_care', kind: 'expense', icon: '💇', color: '#CDB4DB', bucket: 'want' },
  { key: 'travel', kind: 'expense', icon: '✈️', color: '#118AB2', bucket: 'want' },
  { key: 'savings_investments', kind: 'expense', icon: '🌱', color: '#40916C', bucket: 'savings_debt' },
  { key: 'others', kind: 'expense', icon: '📦', color: '#8D99AE', bucket: 'want' },
];

export const BASE_INCOME: CategorySeed[] = [
  { key: 'salary', kind: 'income', icon: '💼', color: '#2D6A4F' },
  { key: 'bonus', kind: 'income', icon: '🎉', color: '#40916C' },
  { key: 'side_income', kind: 'income', icon: '🛠️', color: '#52B788' },
  { key: 'investment_returns', kind: 'income', icon: '📈', color: '#74C69D' },
  { key: 'gifts', kind: 'income', icon: '🎁', color: '#95D5B2' },
  { key: 'other_income', kind: 'income', icon: '💰', color: '#B7E4C7' },
];
