import { screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { OnboardingScreen } from '@/features/onboarding/OnboardingScreen';
import { LockGate } from '@/features/security/LockGate';
import { setSettings } from '@/features/settings/settings.repo';
import { makeCtx, renderWithApp } from '@/test/renderApp';
import { TestModeBanner } from '@/ui/TestModeBanner';
import * as pinStore from '@/features/security/pinStore';

const mockMode = { testMode: true };
jest.mock('@/runtime', () => ({
  isExpoGoTestMode: () => mockMode.testMode,
  getRuntimeMode: () => (mockMode.testMode ? 'expo-go-test' : 'encrypted'),
}));
jest.mock('@/features/security/pinStore', () => ({
  getPinLength: jest.fn(async () => 4),
  checkPin: jest.fn(async () => ({ ok: false, lockedForMs: 0 })),
  authenticateBiometric: jest.fn(async () => true),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories must use require
jest.mock('expo-router', () => require('@/test/mockRouter').routerMock);

beforeEach(() => jest.clearAllMocks());

describe('Expo Go test mode', () => {
  it('shows the permanent banner in test mode only', async () => {
    const ctx = await makeCtx();
    mockMode.testMode = true;
    await renderWithApp(<TestModeBanner />, ctx);
    expect(screen.getByTestId('test-mode-banner')).toHaveTextContent('⚠️ Test mode: not encrypted, demo data only');
  });

  it('shows no banner in real builds', async () => {
    const ctx = await makeCtx();
    mockMode.testMode = false;
    await renderWithApp(<TestModeBanner />, ctx);
    expect(screen.queryByTestId('test-mode-banner')).toBeNull();
  });

  it('onboarding offers demo data only, without the real setup steps', async () => {
    const ctx = await makeCtx();
    mockMode.testMode = true;
    await renderWithApp(<OnboardingScreen />, ctx);
    expect(screen.getByTestId('onboarding-test-mode')).toBeTruthy();
    expect(screen.getByTestId('onboarding-demo')).toBeTruthy();
    expect(screen.queryByTestId('onboarding-income')).toBeNull();
    expect(screen.queryByTestId('onboarding-next')).toBeNull();
  });

  it('the lock is PIN-only: no biometric prompt even if it was enabled', async () => {
    const ctx = await makeCtx();
    mockMode.testMode = true;
    await setSettings(ctx, { lockEnabled: true, biometricsEnabled: true });
    await renderWithApp(
      <LockGate>
        <Text>secret balances</Text>
      </LockGate>,
      ctx,
    );
    expect(await screen.findByTestId('lock-screen')).toBeTruthy();
    await waitFor(() => expect(pinStore.getPinLength).toHaveBeenCalled());
    expect(pinStore.authenticateBiometric).not.toHaveBeenCalled();
    expect(screen.queryByText('secret balances')).toBeNull();
  });

  it('real builds still offer biometrics', async () => {
    const ctx = await makeCtx();
    mockMode.testMode = false;
    await setSettings(ctx, { lockEnabled: true, biometricsEnabled: true });
    await renderWithApp(
      <LockGate>
        <Text>secret balances</Text>
      </LockGate>,
      ctx,
    );
    await waitFor(() => expect(pinStore.authenticateBiometric).toHaveBeenCalledTimes(1));
  });
});
