import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Switch } from 'react-native';
import { todayLocal } from '@/core/dates';
import { getCurrency, parseAmount, toDecimalString } from '@/core/money';
import { destroyAppDatabase } from '@/db/expoDb';
import { loadDemoData } from '@/db/seed/demo';
import { clearPin } from '@/features/security/pinStore';
import { isExpoGoTestMode } from '@/runtime';
import { useCtx, useSession } from '@/stores/session';
import { showSnackbar } from '@/stores/snackbar';
import { Button, Card, Chip, Divider, ListRow, Row, Screen, SectionHeader, TextField } from '@/ui/primitives';
import { Text } from '@/ui/Text';
import { usePalette } from '@/ui/theme';
import { useSettings, useUpdateSettings } from './hooks';
import type { AppSettings, BudgetMethod, ThemePref } from './settings.repo';

const PAY_DAYS = [1, 15, 23, 25, 28, 31];

export function SettingsScreen() {
  const { t } = useTranslation();
  const p = usePalette();
  const ctx = useCtx();
  const qc = useQueryClient();
  const { data: s } = useSettings();
  const update = useUpdateSettings();
  const [hasTx, setHasTx] = useState(true);

  useEffect(() => {
    void ctx.db.get<{ n: number }>('SELECT count(*) AS n FROM transactions WHERE deleted_at IS NULL').then((r) => setHasTx((r?.n ?? 0) > 0));
  }, [ctx, s]);

  if (!s) return null;

  const deleteEverything = () =>
    Alert.alert(t('settings.deleteAllTitle'), t('settings.deleteAllBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.deleteAllConfirm'),
        style: 'destructive',
        onPress: async () => {
          await destroyAppDatabase(ctx.db);
          await clearPin();
          qc.clear();
          // Unmounts the whole app; bootstrap re-runs and starts onboarding fresh.
          useSession.getState().reset();
        },
      },
    ]);

  return (
    <Screen edges={['bottom']} testID="settings">
      <SectionHeader title={t('settings.money')} />
      <Card>
        <MoneyFields key={`${s.monthlyIncomeMinor}|${s.savingsTargetMinor}`} settings={s} />
        <Divider />
        <Text variant="caption" tone="muted">
          {t('onboarding.payDay')}
        </Text>
        <Row style={{ flexWrap: 'wrap' }}>
          {PAY_DAYS.map((d) => (
            <Chip key={d} label={d === 31 ? t('onboarding.lastDay') : String(d)} selected={s.payDay === d} onPress={() => update.mutate({ payDay: d })} />
          ))}
        </Row>
        <Text variant="caption" tone="muted">
          {t('onboarding.payDayHint', { day: s.payDay })}
        </Text>
        <Divider />
        <Text variant="caption" tone="muted">
          {t('settings.budgetMethod')}
        </Text>
        <Row style={{ flexWrap: 'wrap' }}>
          {(['simple', '50_30_20', 'zero_based'] as BudgetMethod[]).map((m) => (
            <Chip key={m} label={t(`onboarding.methods.${m}.title`)} selected={s.budgetMethod === m} onPress={() => update.mutate({ budgetMethod: m })} />
          ))}
        </Row>
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <Text tone="muted">{t('settings.currency')}</Text>
          <Text>
            {getCurrency(s.currency).symbol} {s.currency}
          </Text>
        </Row>
        <Text variant="caption" tone="muted">
          {t('settings.currencyLocked')}
        </Text>
      </Card>

      <SectionHeader title={t('settings.appearance')} />
      <Card>
        <Text variant="caption" tone="muted">
          {t('settings.language')}
        </Text>
        <Row>
          <Chip label="English" selected={s.language === 'en'} onPress={() => update.mutate({ language: 'en' })} />
          <Chip label="Bahasa Melayu" selected={s.language === 'ms'} onPress={() => update.mutate({ language: 'ms' })} testID="lang-ms" />
        </Row>
        <Text variant="caption" tone="muted">
          {t('settings.theme')}
        </Text>
        <Row>
          {(['system', 'light', 'dark'] as ThemePref[]).map((th) => (
            <Chip key={th} label={t(`settings.themes.${th}`)} selected={s.theme === th} onPress={() => update.mutate({ theme: th })} />
          ))}
        </Row>
      </Card>

      <SectionHeader title={t('settings.privacy')} />
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <ListRow
          title={t('settings.hideBalances')}
          subtitle={t('settings.hideBalancesHint')}
          right={<Switch value={s.hideBalances} onValueChange={(v) => update.mutate({ hideBalances: v })} trackColor={{ true: p.primary }} accessibilityLabel={t('settings.hideBalances')} />}
        />
        <Divider />
        <ListRow title={t('security.title')} subtitle={s.lockEnabled ? t('security.on') : t('security.off')} onPress={() => router.push('/settings/security')} right={<Text tone="muted">›</Text>} testID="open-security" />
        <Divider />
        <ListRow title={t('categories.title')} onPress={() => router.push('/categories')} right={<Text tone="muted">›</Text>} />
      </Card>
      <Text variant="caption" tone="muted">
        {isExpoGoTestMode() ? t('testMode.securityNote') : t('settings.privacyStatement')}
      </Text>

      <SectionHeader title={t('settings.data')} />
      <Card>
        {!hasTx ? (
          <Button
            kind="secondary"
            label={t('settings.loadDemo')}
            onPress={async () => {
              const r = await loadDemoData(ctx, todayLocal());
              await qc.invalidateQueries();
              showSnackbar({ text: t('settings.demoLoaded', { count: r.transactions }) });
            }}
            testID="load-demo"
          />
        ) : null}
        <Button kind="danger" label={t('settings.deleteAll')} onPress={deleteEverything} testID="delete-all" />
        <Text variant="caption" tone="muted">
          {t('settings.deleteAllHint')}
        </Text>
      </Card>

      <Text variant="caption" tone="muted" align="center">
        MariKira {Constants.expoConfig?.version ?? ''}
      </Text>
    </Screen>
  );
}

/** Income & savings inputs; remounted (via key) whenever the saved values change. */
function MoneyFields({ settings: s }: { settings: AppSettings }) {
  const { t } = useTranslation();
  const update = useUpdateSettings();
  const [income, setIncome] = useState(s.monthlyIncomeMinor ? toDecimalString(s.monthlyIncomeMinor, s.currency) : '');
  const [savings, setSavings] = useState(s.savingsTargetMinor ? toDecimalString(s.savingsTargetMinor, s.currency) : '');
  const symbol = getCurrency(s.currency).symbol;
  const incomeMinor = income ? parseAmount(income, s.currency) : 0;
  const savingsMinor = savings ? parseAmount(savings, s.currency) : 0;
  const valid = incomeMinor != null && incomeMinor >= 0 && savingsMinor != null && savingsMinor >= 0;

  const saveMoney = () => {
    if (!valid || (incomeMinor === s.monthlyIncomeMinor && savingsMinor === s.savingsTargetMinor)) return;
    update.mutate({ monthlyIncomeMinor: incomeMinor!, savingsTargetMinor: savingsMinor! });
    showSnackbar({ text: t('settings.saved') });
  };

  return (
    <>
      <TextField
        label={t('settings.monthlyIncome', { symbol })}
        value={income}
        onChangeText={setIncome}
        onBlur={saveMoney}
        keyboardType="decimal-pad"
        error={incomeMinor == null ? t('errors.amountInvalid') : null}
        testID="settings-income"
      />
      <TextField
        label={t('settings.savingsTarget', { symbol })}
        value={savings}
        onChangeText={setSavings}
        onBlur={saveMoney}
        keyboardType="decimal-pad"
        error={savingsMinor == null ? t('errors.amountInvalid') : null}
      />
      <Text variant="caption" tone="muted">
        {t('settings.savingsTargetHint')}
      </Text>
      <Button kind="secondary" label={t('common.save')} onPress={saveMoney} disabled={!valid} testID="settings-save-money" />
    </>
  );
}
