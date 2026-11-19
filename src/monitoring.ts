import * as Sentry from '@sentry/react-native';

/**
 * Crash reporting with no financial data:
 * - Disabled unless EXPO_PUBLIC_SENTRY_DSN is set at build time.
 * - No PII, no breadcrumbs of console/UI text, no request bodies.
 * - Any number that looks like money or an amount is redacted before sending.
 */
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

const MONEY = /(RM|\$|€|£|¥)\s?[\d,]+(\.\d+)?|\b\d{1,3}(,\d{3})+(\.\d+)?\b|\b\d+\.\d{2}\b/g;

export function scrub(text: string): string {
  return text.replace(MONEY, '[redacted]');
}

export function initMonitoring(): void {
  if (!DSN) return;
  Sentry.init({
    dsn: DSN,
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    maxBreadcrumbs: 20,
    beforeBreadcrumb: (b) => (b.category === 'console' || b.category?.startsWith('ui.') ? null : b),
    beforeSend: (event) => {
      if (event.message) event.message = scrub(event.message);
      for (const ex of event.exception?.values ?? []) {
        if (ex.value) ex.value = scrub(ex.value);
      }
      delete event.user;
      delete event.request;
      delete event.extra;
      return event;
    },
  });
}
