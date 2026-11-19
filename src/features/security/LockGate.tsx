import * as Haptics from 'expo-haptics';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSettings } from '@/features/settings/hooks';
import { useSession } from '@/stores/session';
import { Text } from '@/ui/Text';
import { spacing, usePalette } from '@/ui/theme';
import { PinPad } from './PinPad';
import { shouldAutoLock } from './pinCrypto';
import { authenticateBiometric, checkPin, getPinLength } from './pinStore';

/**
 * Renders children, and overlays the lock screen whenever the app is locked:
 * on cold start and after `autoLockSeconds` in the background.
 * While locked, children are not rendered, so no balances are visible in the app switcher.
 */
export function LockGate({ children }: { children: ReactNode }) {
  const { data: settings } = useSettings();
  const locked = useSession((s) => s.locked);
  const setLocked = useSession((s) => s.setLocked);
  const backgroundedAt = useRef<number | null>(null);
  const [inBackground, setInBackground] = useState(false);
  const enabled = !!settings?.lockEnabled;

  // Lock on cold start once settings are known.
  const initial = useRef(true);
  useEffect(() => {
    if (settings && initial.current) {
      initial.current = false;
      if (settings.lockEnabled) setLocked(true);
    }
  }, [settings, setLocked]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setInBackground(false);
        if (enabled && shouldAutoLock(backgroundedAt.current, Date.now(), settings?.autoLockSeconds ?? 60)) setLocked(true);
        backgroundedAt.current = null;
      } else {
        // 'inactive' (iOS app switcher) and 'background': hide content for privacy.
        setInBackground(true);
        if (backgroundedAt.current == null) backgroundedAt.current = Date.now();
      }
    });
    return () => sub.remove();
  }, [enabled, settings?.autoLockSeconds, setLocked]);

  if (enabled && locked) return <LockScreen biometrics={!!settings?.biometricsEnabled} onUnlock={() => setLocked(false)} />;
  return (
    <View style={{ flex: 1 }}>
      {children}
      {enabled && inBackground ? <PrivacyCover /> : null}
    </View>
  );
}

function PrivacyCover() {
  const p = usePalette();
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center' }]}>
      <Text variant="title">MariKira</Text>
    </View>
  );
}

export function LockScreen({ biometrics, onUnlock }: { biometrics: boolean; onUnlock: () => void }) {
  const p = usePalette();
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [length, setLength] = useState<number | null>(null);

  useEffect(() => {
    void getPinLength().then((n) => {
      // No PIN stored (e.g. keystore wiped): nothing to protect against, let the user in.
      if (n == null) onUnlock();
      else setLength(n);
    });
  }, [onUnlock]);

  const tryBiometric = useCallback(async () => {
    if (!biometrics) return;
    if (await authenticateBiometric(t('security.unlockPrompt'), t('security.usePin'))) onUnlock();
  }, [biometrics, onUnlock, t]);

  useEffect(() => {
    void tryBiometric();
  }, [tryBiometric]);

  const onChange = async (v: string) => {
    setPin(v);
    setMessage(null);
    if (length == null || v.length < length || busy) return;
    setBusy(true);
    const r = await checkPin(v);
    setBusy(false);
    if (r.ok) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      onUnlock();
    } else if (r.lockedForMs > 0) {
      setPin('');
      setMessage(t('security.tooManyAttempts', { seconds: Math.ceil(r.lockedForMs / 1000) }));
    } else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      setPin('');
      setMessage(t('security.wrongPin'));
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center', gap: spacing.xl }} testID="lock-screen">
      <Text variant="title">{t('security.lockedTitle')}</Text>
      <Text tone="muted">{t('security.enterPin')}</Text>
      <PinPad
        length={length ?? 4}
        value={pin}
        onChange={(v) => void onChange(v)}
        extraKey={biometrics ? { label: '🔓', accessibilityLabel: t('security.useBiometrics'), onPress: () => void tryBiometric() } : undefined}
      />
      <Text tone="over" accessibilityLiveRegion="assertive" style={{ minHeight: 22 }}>
        {message ?? ''}
      </Text>
    </SafeAreaView>
  );
}
