import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/stores/session';
import { type AppSettings, DEFAULT_SETTINGS, getSettings, setSettings } from './settings.repo';

export const settingsKey = ['settings'] as const;

export function useSettings() {
  const ctx = useSession((s) => s.ctx);
  return useQuery({
    queryKey: settingsKey,
    queryFn: () => getSettings(ctx!),
    enabled: !!ctx,
    staleTime: Infinity,
  });
}

/** Read one setting with a safe default (works before the DB is ready). */
export function useSettingsValue<K extends keyof AppSettings>(key: K): AppSettings[K] {
  const { data } = useSettings();
  return (data ?? DEFAULT_SETTINGS)[key];
}

export function useUpdateSettings() {
  const ctx = useSession((s) => s.ctx);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<AppSettings>) => setSettings(ctx!, patch),
    onMutate: async (patch) => {
      // Optimistic: toggles like "hide balances" and theme apply instantly.
      await qc.cancelQueries({ queryKey: settingsKey });
      const prev = qc.getQueryData<AppSettings>(settingsKey);
      if (prev) qc.setQueryData(settingsKey, { ...prev, ...patch });
      return { prev };
    },
    onError: (_e, _p, c) => {
      if (c?.prev) qc.setQueryData(settingsKey, c.prev);
    },
    // Pay day, income etc. change every derived figure.
    onSettled: () => qc.invalidateQueries(),
  });
}
