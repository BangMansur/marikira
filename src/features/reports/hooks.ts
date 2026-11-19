import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { type LocalDate, todayLocal } from '@/core/dates';
import { useSettings } from '@/features/settings/hooks';
import { useCtx } from '@/stores/session';
import { getCycleReport, getDashboard } from './reports.repo';

/** Today's local date; refreshes when the app returns to the foreground (e.g. after midnight). */
export function useToday(): LocalDate {
  const [today, setToday] = useState(() => todayLocal());
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setToday(todayLocal());
    });
    const msToMidnight = (() => {
      const n = new Date();
      return new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1).getTime() - n.getTime() + 1000;
    })();
    const timer = setTimeout(() => setToday(todayLocal()), msToMidnight);
    return () => {
      sub.remove();
      clearTimeout(timer);
    };
  }, [today]);
  return today;
}

export function useDashboard() {
  const ctx = useCtx();
  const today = useToday();
  const { data: settings } = useSettings();
  return useQuery({
    queryKey: ['dashboard', today, settings],
    queryFn: () => getDashboard(ctx, settings!, today),
    enabled: !!settings,
    placeholderData: (prev) => prev,
  });
}

export function useCycleReport(offset: number) {
  const ctx = useCtx();
  const today = useToday();
  const { data: settings } = useSettings();
  return useQuery({
    queryKey: ['report', today, settings?.payDay, offset],
    queryFn: () => getCycleReport(ctx, settings!.payDay, today, offset),
    enabled: !!settings,
    placeholderData: (prev) => prev,
  });
}
