import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { describeError, diagnosticsEnabled, reportStartupError } from '@/diagnostics';
import { DbErrorScreen } from '@/features/startup/DbErrorScreen';
import { initI18n } from '@/i18n';

const mockMode = { value: 'expo-go-test' as 'expo-go-test' | 'encrypted' };
jest.mock('@/runtime', () => ({
  getRuntimeMode: () => mockMode.value,
  isExpoGoTestMode: () => mockMode.value === 'expo-go-test',
}));

function sqliteError() {
  const e = new Error('Call to function NativeDatabase.execAsync has been rejected');
  (e as Error & { code: string }).code = 'ERR_INTERNAL_SQLITE_ERROR';
  return e;
}

const renderScreen = (error: unknown) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })}>
      <DbErrorScreen kind="other" error={error} onRetry={jest.fn()} onReset={jest.fn()} />
    </QueryClientProvider>,
  );

let errorSpy: jest.SpyInstance;
beforeEach(() => {
  initI18n('en');
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => errorSpy.mockRestore());

describe('diagnostics gating', () => {
  it.each([
    ['expo-go-test', true, true],
    ['expo-go-test', false, false], // a production-like JS bundle in Expo Go
    ['encrypted', true, false], // dev build
    ['encrypted', false, false], // production build
  ] as const)('mode %s, __DEV__=%s → %s', (mode, dev, expected) => {
    expect(diagnosticsEnabled(mode, dev)).toBe(expected);
  });

  it('describes errors including the native error code and stack', () => {
    const d = describeError(sqliteError());
    expect(d).toMatchObject({ name: 'Error', code: 'ERR_INTERNAL_SQLITE_ERROR' });
    expect(d.stack).toContain('NativeDatabase.execAsync');
    expect(describeError('boom')).toEqual({ name: 'string', message: 'boom', code: null, stack: null });
  });

  it('console.errors only when enabled', () => {
    reportStartupError(sqliteError(), false);
    expect(errorSpy).not.toHaveBeenCalled();
    reportStartupError(sqliteError(), true);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain('ERR_INTERNAL_SQLITE_ERROR');
  });
});

describe('DbErrorScreen', () => {
  it('Expo Go test mode + __DEV__: shows message, code and stack as selectable text', async () => {
    mockMode.value = 'expo-go-test';
    await renderScreen(sqliteError());
    expect(screen.getByTestId('db-error-details')).toBeTruthy();
    const message = screen.getByTestId('db-error-message');
    expect(message).toHaveTextContent('Error: Call to function NativeDatabase.execAsync has been rejected');
    expect(message.props.selectable).toBe(true);
    expect(screen.getByTestId('db-error-code')).toHaveTextContent('Error code: ERR_INTERNAL_SQLITE_ERROR');
    expect(screen.getByTestId('db-error-stack').props.selectable).toBe(true);
    expect(screen.getByTestId('db-error-stack')).toHaveTextContent(/NativeDatabase/);
  });

  it('dev and production builds: no details on screen', async () => {
    mockMode.value = 'encrypted';
    await renderScreen(sqliteError());
    expect(screen.getByText("Can't open your data")).toBeTruthy();
    expect(screen.queryByTestId('db-error-details')).toBeNull();
    expect(screen.queryByText(/ERR_INTERNAL_SQLITE_ERROR/)).toBeNull();
  });
});
