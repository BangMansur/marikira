import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, dayOfWeek, type LocalDate, parseLocalDate } from '@/core/dates';

/** Locale-aware short date labels from translated month/day names (no Intl dependency on Hermes). */
export function useDateLabels() {
  const { t } = useTranslation();
  const months = t('dates.monthsShort', { returnObjects: true }) as string[];
  const days = t('dates.daysShort', { returnObjects: true }) as string[];

  const short = useCallback(
    (d: LocalDate) => {
      const { d: day, m } = parseLocalDate(d);
      return `${day} ${months[m - 1]}`;
    },
    [months],
  );

  const relative = useCallback(
    (d: LocalDate, today: LocalDate) => {
      if (d === today) return t('dates.today');
      if (d === addDays(today, -1)) return t('dates.yesterday');
      return `${days[dayOfWeek(d)]}, ${short(d)}`;
    },
    [days, short, t],
  );

  const range = useCallback((a: LocalDate, b: LocalDate) => `${short(a)} – ${short(b)}`, [short]);

  return { short, relative, range };
}

export function timeLabel(epochMs: number): string {
  const d = new Date(epochMs);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
