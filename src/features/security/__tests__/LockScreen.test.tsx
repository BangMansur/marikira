import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { initI18n } from '@/i18n';
import { LockScreen } from '../LockGate';
import * as pinStore from '../pinStore';

jest.mock('../pinStore', () => ({
  getPinLength: jest.fn(async () => 4),
  checkPin: jest.fn(async (pin: string) => (pin === '2580' ? { ok: true } : { ok: false, lockedForMs: 0 })),
  authenticateBiometric: jest.fn(async () => false),
}));

const render = (ui: ReactElement) => rtlRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

const mocked = pinStore as jest.Mocked<typeof pinStore>;

beforeEach(() => {
  jest.clearAllMocks();
  initI18n('en');
});

async function typePin(pin: string) {
  for (const d of pin) await fireEvent.press(screen.getByTestId(`pin-${d}`));
}

describe('LockScreen', () => {
  it('prompts biometrics once, rejects a wrong PIN, unlocks with the right one', async () => {
    const onUnlock = jest.fn();
    await render(<LockScreen biometrics onUnlock={onUnlock} />);
    await waitFor(() => expect(mocked.getPinLength).toHaveBeenCalledTimes(1));
    expect(mocked.authenticateBiometric).toHaveBeenCalledTimes(1);

    await typePin('1111');
    expect(await screen.findByText('Wrong PIN')).toBeTruthy();
    expect(mocked.checkPin).toHaveBeenCalledTimes(1); // only checked once the full PIN is entered

    await typePin('2580');
    await waitFor(() => expect(onUnlock).toHaveBeenCalledTimes(1));
    expect(mocked.getPinLength).toHaveBeenCalledTimes(1);
    expect(mocked.authenticateBiometric).toHaveBeenCalledTimes(1);
  });

  it('shows the lockout message after too many attempts', async () => {
    mocked.checkPin.mockResolvedValueOnce({ ok: false, lockedForMs: 30_000 });
    await render(<LockScreen biometrics={false} onUnlock={jest.fn()} />);
    await waitFor(() => expect(mocked.getPinLength).toHaveBeenCalled());
    await typePin('1234');
    expect(await screen.findByText('Too many tries. Wait 30 seconds.')).toBeTruthy();
    expect(mocked.authenticateBiometric).not.toHaveBeenCalled();
  });
});
