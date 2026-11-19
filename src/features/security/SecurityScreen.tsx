import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch, View } from 'react-native';
import { useSettings, useUpdateSettings } from '@/features/settings/hooks';
import { isExpoGoTestMode } from '@/runtime';
import { showSnackbar } from '@/stores/snackbar';
import { Button, Card, Chip, Divider, ListRow, Row, Screen } from '@/ui/primitives';
import { Text } from '@/ui/Text';
import { spacing, usePalette } from '@/ui/theme';
import { PinPad } from './PinPad';
import { isValidPin, PIN_MAX } from './pinCrypto';
import { biometricsAvailable, clearPin, setPin } from './pinStore';

const TIMEOUTS = [0, 60, 300, 900];

type Stage = { kind: 'idle' } | { kind: 'enter' } | { kind: 'confirm'; first: string };

export function SecurityScreen() {
  const { t } = useTranslation();
  const p = usePalette();
  const { data: s } = useSettings();
  const update = useUpdateSettings();
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [pin, setPinValue] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [bioAvailable, setBioAvailable] = useState(false);

  const testMode = isExpoGoTestMode();
  useEffect(() => {
    if (!testMode) void biometricsAvailable().then(setBioAvailable);
  }, [testMode]);

  if (!s) return null;

  const submit = async () => {
    if (!isValidPin(pin)) {
      setMessage(t('security.pinLength'));
      return;
    }
    if (stage.kind === 'enter') {
      setStage({ kind: 'confirm', first: pin });
      setPinValue('');
      setMessage(null);
    } else if (stage.kind === 'confirm') {
      if (pin !== stage.first) {
        setMessage(t('security.pinMismatch'));
        setStage({ kind: 'enter' });
        setPinValue('');
        return;
      }
      await setPin(pin);
      update.mutate({ lockEnabled: true });
      setStage({ kind: 'idle' });
      setPinValue('');
      showSnackbar({ text: t('security.pinSet') });
    }
  };

  if (stage.kind !== 'idle') {
    return (
      <Screen edges={['bottom']} testID="pin-setup">
        <View style={{ alignItems: 'center', gap: spacing.lg }}>
          <Text variant="heading">{stage.kind === 'enter' ? t('security.choosePin') : t('security.confirmPin')}</Text>
          <Text tone="muted">{t('security.pinLength')}</Text>
          <PinPad value={pin} onChange={setPinValue} length={PIN_MAX} testIDPrefix="setpin" />
          {message ? <Text tone="over">{message}</Text> : null}
          <Button label={t('common.next')} onPress={() => void submit()} disabled={pin.length < 4} testID="pin-next" />
          <Button kind="ghost" label={t('common.cancel')} onPress={() => setStage({ kind: 'idle' })} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']} testID="security">
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <ListRow
          title={t('security.appLock')}
          subtitle={t('security.appLockHint')}
          right={
            <Switch
              value={s.lockEnabled}
              trackColor={{ true: p.primary }}
              accessibilityLabel={t('security.appLock')}
              testID="lock-switch"
              onValueChange={async (v) => {
                if (v) setStage({ kind: 'enter' });
                else {
                  await clearPin();
                  update.mutate({ lockEnabled: false, biometricsEnabled: false });
                }
              }}
            />
          }
        />
        {s.lockEnabled ? (
          <>
            {testMode ? null : (
              <>
            <Divider />
            <ListRow
              title={t('security.biometrics')}
              subtitle={bioAvailable ? t('security.biometricsHint') : t('security.biometricsUnavailable')}
              right={
                <Switch
                  value={s.biometricsEnabled}
                  disabled={!bioAvailable}
                  trackColor={{ true: p.primary }}
                  accessibilityLabel={t('security.biometrics')}
                  onValueChange={(v) => update.mutate({ biometricsEnabled: v })}
                />
              }
            />
              </>
            )}
            <Divider />
            <ListRow title={t('security.changePin')} onPress={() => setStage({ kind: 'enter' })} right={<Text tone="muted">›</Text>} />
          </>
        ) : null}
      </Card>
      {s.lockEnabled ? (
        <Card>
          <Text variant="caption" tone="muted">
            {t('security.autoLock')}
          </Text>
          <Row style={{ flexWrap: 'wrap' }}>
            {TIMEOUTS.map((sec) => (
              <Chip key={sec} label={t(`security.timeouts.${sec}`)} selected={s.autoLockSeconds === sec} onPress={() => update.mutate({ autoLockSeconds: sec })} />
            ))}
          </Row>
        </Card>
      ) : null}
      <Text variant="caption" tone="muted">
        {testMode ? t('testMode.securityNote') : t('security.encryptionNote')}
      </Text>
    </Screen>
  );
}
