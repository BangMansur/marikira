import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import ms from './ms.json';

const i18n = createInstance();

export const resources = { en: { translation: en }, ms: { translation: ms } } as const;
export type LanguageCode = keyof typeof resources;

/** Device language → app language (Malay devices start in Bahasa Melayu). */
export function pickLanguage(deviceLanguageCodes: (string | null | undefined)[]): LanguageCode {
  for (const code of deviceLanguageCodes) {
    if (code?.toLowerCase().startsWith('ms')) return 'ms';
    if (code?.toLowerCase().startsWith('en')) return 'en';
  }
  return 'en';
}

let initialised = false;

export function initI18n(language: LanguageCode): typeof i18n {
  if (!initialised) {
    initialised = true;
    void i18n.use(initReactI18next).init({
      resources,
      lng: language,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      // Resources are bundled, so initialise synchronously: the first render (and plural rules)
      // must never see raw keys.
      initAsync: false,
      returnNull: false,
    });
  } else if (i18n.language !== language) {
    void i18n.changeLanguage(language);
  }
  return i18n;
}

/** English names for seeding default categories (display uses the translated key anyway). */
export function englishCategoryName(key: string): string {
  return (en.categories as Record<string, string>)[key] ?? key;
}

export default i18n;
