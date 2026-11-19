export type Bucket = 'need' | 'want' | 'savings_debt';

export interface CategorySeed {
  /** Stable key; also the i18n key under `categories.*`. */
  key: string;
  kind: 'expense' | 'income';
  icon: string;
  color: string;
  bucket?: Bucket;
  taxReliefCode?: string;
  children?: Omit<CategorySeed, 'children' | 'kind'>[];
}

export interface AccountSuggestion {
  nameKey: string;
  type: 'cash' | 'bank' | 'credit_card' | 'ewallet' | 'investment' | 'loan';
  icon: string;
}

export interface LocalePreset {
  id: 'MY' | 'GENERIC';
  currency: string;
  suggestedPayDay: number;
  language: 'en' | 'ms';
  categories: CategorySeed[];
  accountSuggestions: AccountSuggestion[];
}
