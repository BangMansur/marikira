import { QueryClient } from '@tanstack/react-query';

/** The app-wide React Query cache (SQLite is the source of truth; this only caches reads). */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, networkMode: 'always' }, mutations: { networkMode: 'always' } },
});
