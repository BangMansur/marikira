/**
 * Test harness: renders real screens with real repositories on an in-memory SQLite DB
 * (better-sqlite3), real React Query and real i18n. Only native modules are mocked.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Ctx } from '@/db/helpers';
import { bootstrapDatabase } from '@/db/seed/bootstrap';
import { createTestDb } from '@/db/testDb';
import { englishCategoryName, initI18n } from '@/i18n';
import { useSession } from '@/stores/session';
import { SnackbarHost } from '@/ui/feedback';

export async function makeCtx(): Promise<Ctx> {
  return bootstrapDatabase(await createTestDb(), englishCategoryName);
}

export async function renderWithApp(ui: ReactElement, ctx: Ctx) {
  initI18n('en');
  useSession.setState({ status: 'ready', ctx, locked: false });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  const utils = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={qc}>
        {ui}
        <SnackbarHost />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  return { ...utils, qc };
}
