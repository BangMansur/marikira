/**
 * Currency metadata. `exponent` is the number of minor-unit digits
 * (ISO 4217): MYR 2 (sen), JPY 0, KWD 3.
 * All money in MariKira is stored as an integer count of minor units.
 */
export interface CurrencyInfo {
  code: string;
  exponent: number;
  symbol: string;
  name: string;
}

export const CURRENCIES: Record<string, CurrencyInfo> = {
  MYR: { code: 'MYR', exponent: 2, symbol: 'RM', name: 'Malaysian Ringgit' },
  SGD: { code: 'SGD', exponent: 2, symbol: 'S$', name: 'Singapore Dollar' },
  BND: { code: 'BND', exponent: 2, symbol: 'B$', name: 'Brunei Dollar' },
  IDR: { code: 'IDR', exponent: 2, symbol: 'Rp', name: 'Indonesian Rupiah' },
  THB: { code: 'THB', exponent: 2, symbol: '฿', name: 'Thai Baht' },
  PHP: { code: 'PHP', exponent: 2, symbol: '₱', name: 'Philippine Peso' },
  VND: { code: 'VND', exponent: 0, symbol: '₫', name: 'Vietnamese Dong' },
  USD: { code: 'USD', exponent: 2, symbol: 'US$', name: 'US Dollar' },
  EUR: { code: 'EUR', exponent: 2, symbol: '€', name: 'Euro' },
  GBP: { code: 'GBP', exponent: 2, symbol: '£', name: 'British Pound' },
  AUD: { code: 'AUD', exponent: 2, symbol: 'A$', name: 'Australian Dollar' },
  CNY: { code: 'CNY', exponent: 2, symbol: '¥', name: 'Chinese Yuan' },
  JPY: { code: 'JPY', exponent: 0, symbol: '¥', name: 'Japanese Yen' },
  KRW: { code: 'KRW', exponent: 0, symbol: '₩', name: 'South Korean Won' },
  INR: { code: 'INR', exponent: 2, symbol: '₹', name: 'Indian Rupee' },
  SAR: { code: 'SAR', exponent: 2, symbol: 'SR', name: 'Saudi Riyal' },
  AED: { code: 'AED', exponent: 2, symbol: 'AED', name: 'UAE Dirham' },
  KWD: { code: 'KWD', exponent: 3, symbol: 'KD', name: 'Kuwaiti Dinar' },
};

export const DEFAULT_CURRENCY = 'MYR';

export function getCurrency(code: string): CurrencyInfo {
  const c = CURRENCIES[code];
  if (!c) throw new Error(`Unsupported currency: ${code}`);
  return c;
}

export function pow10(exp: number): number {
  let r = 1;
  for (let i = 0; i < exp; i++) r *= 10;
  return r;
}
