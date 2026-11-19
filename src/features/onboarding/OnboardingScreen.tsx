import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { todayLocal } from '@/core/dates';
import { CURRENCIES, divRound, getCurrency, parseAmount } from '@/core/money';
import { loadDemoData } from '@/db/seed/demo';
import { createAccount } from '@/features/accounts/accounts.repo';
import { resetDefaultCategories } from '@/features/categories/categories.repo';
import { type BudgetMethod, type Language, type PresetId, setSettings } from '@/features/settings/settings.repo';
import { englishCategoryName, initI18n } from '@/i18n';
import { getPreset, type AccountSuggestion } from '@/presets';
import { isExpoGoTestMode } from '@/runtime';
import { useCtx } from '@/stores/session';
import { Button, Card, Chip, Row, Segmented, TextField } from '@/ui/primitives';
import { Text } from '@/ui/Text';
import { spacing, usePalette } from '@/ui/theme';

const STEPS = 4;
const PAY_DAYS = [1, 15, 23, 25, 28, 31];

/**
 * ≤ 60-second onboarding. Every step can be skipped; sensible defaults are applied.
 * Nothing is written until "Finish" (or the demo shortcut), so backing out leaves no half-state.
 */
export function OnboardingScreen() {
  const ctx = useCtx();
  const qc = useQueryClient();
  const p = usePalette();
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const [language, setLanguage] = useState<Language>(t('meta.code') === 'ms' ? 'ms' : 'en');
  const [presetId, setPresetId] = useState<PresetId>('MY');
  const [currency, setCurrency] = useState('MYR');
  const [incomeText, setIncomeText] = useState('');
  const [payDay, setPayDay] = useState(25);
  const preset = getPreset(presetId);
  const [selected, setSelected] = useState<Record<string, boolean>>({ cash: true, bank: true });
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<BudgetMethod>('simple');

  const income = incomeText ? parseAmount(incomeText, currency) : 0;
  const incomeInvalid = incomeText !== '' && (income == null || income < 0);

  const changeLanguage = (l: Language) => {
    setLanguage(l);
    initI18n(l);
  };

  const finish = async (useDemo: boolean) => {
    setBusy(true);
    try {
      if (!useDemo && presetId !== 'MY') await resetDefaultCategories(ctx, preset.categories, englishCategoryName);
      if (useDemo) {
        await setSettings(ctx, { language, presetId: 'MY', currency: 'MYR' });
        await loadDemoData(ctx, todayLocal());
      } else {
        const monthlyIncome = income ?? 0;
        await setSettings(ctx, {
          language,
          presetId,
          currency,
          payDay,
          monthlyIncomeMinor: monthlyIncome,
          budgetMethod: method,
          // 50/30/20 → reserve 20% for savings; other methods start at 0 (editable in Settings).
          savingsTargetMinor: method === '50_30_20' ? divRound(monthlyIncome * 20, 100) : 0,
        });
        const chosen = preset.accountSuggestions.filter((a) => selected[a.nameKey]);
        // Always leave the user with somewhere to log spending.
        const toCreate: AccountSuggestion[] = chosen.length ? chosen : [preset.accountSuggestions[0]];
        for (const a of toCreate) {
          const entered = Math.abs(parseAmount(balances[a.nameKey] ?? '', currency) ?? 0);
          await createAccount(ctx, {
            name: t(`onboarding.accountNames.${a.nameKey}`),
            type: a.type,
            currency,
            icon: a.icon,
            // A card's balance is what you owe, stored as a negative (liability).
            openingBalance: a.type === 'credit_card' && entered > 0 ? -entered : entered,
          });
        }
      }
      await setSettings(ctx, { onboardingDone: true });
      await qc.invalidateQueries();
      router.replace('/(tabs)');
    } finally {
      setBusy(false);
    }
  };

  const next = () => (step < STEPS - 1 ? setStep(step + 1) : void finish(false));

  // Expo Go test mode: storage isn't encrypted, so real setup is not offered. Demo data only.
  if (isExpoGoTestMode()) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }} edges={['bottom']} testID="onboarding-test-mode">
        <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
          <Text variant="display">{t('onboarding.welcomeTitle')}</Text>
          <Card>
            <Text variant="heading">{t('testMode.title')}</Text>
            <Text tone="muted">{t('testMode.body')}</Text>
          </Card>
          <Button label={t('testMode.start')} onPress={() => void finish(true)} loading={busy} testID="onboarding-demo" />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }} testID="onboarding">
      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="caption" tone="muted">
            {t('onboarding.stepOf', { step: step + 1, total: STEPS })}
          </Text>
          <Button kind="ghost" label={t('common.skip')} onPress={next} testID="onboarding-skip" />
        </Row>

        {step === 0 && (
          <View style={{ gap: spacing.lg }}>
            <Text variant="display">{t('onboarding.welcomeTitle')}</Text>
            <Text tone="muted">{t('onboarding.welcomeBody')}</Text>
            <Text variant="label" tone="muted">
              {t('settings.language')}
            </Text>
            <Segmented
              value={language}
              onChange={changeLanguage}
              options={[
                { value: 'en', label: 'English' },
                { value: 'ms', label: 'Bahasa Melayu' },
              ]}
            />
            <Text variant="label" tone="muted">
              {t('onboarding.country')}
            </Text>
            <Segmented
              value={presetId}
              onChange={(v) => {
                setPresetId(v);
                const pr = getPreset(v);
                setCurrency(pr.currency);
                setPayDay(pr.suggestedPayDay);
              }}
              options={[
                { value: 'MY', label: t('onboarding.malaysia') },
                { value: 'GENERIC', label: t('onboarding.otherCountry') },
              ]}
            />
            <Text variant="label" tone="muted">
              {t('settings.currency')}
            </Text>
            <Row style={{ flexWrap: 'wrap' }}>
              {Object.values(CURRENCIES).map((c) => (
                <Chip key={c.code} label={`${c.symbol} ${c.code}`} selected={currency === c.code} onPress={() => setCurrency(c.code)} />
              ))}
            </Row>
          </View>
        )}

        {step === 1 && (
          <View style={{ gap: spacing.lg }}>
            <Text variant="title">{t('onboarding.incomeTitle')}</Text>
            <Text tone="muted">{t('onboarding.incomeBody')}</Text>
            <TextField
              label={t('onboarding.monthlyIncome', { symbol: getCurrency(currency).symbol })}
              value={incomeText}
              onChangeText={setIncomeText}
              keyboardType="decimal-pad"
              placeholder="4000"
              error={incomeInvalid ? t('errors.amountInvalid') : null}
              testID="onboarding-income"
            />
            <Text variant="label" tone="muted">
              {t('onboarding.payDay')}
            </Text>
            <Row style={{ flexWrap: 'wrap' }}>
              {PAY_DAYS.map((d) => (
                <Chip
                  key={d}
                  label={d === 31 ? t('onboarding.lastDay') : String(d)}
                  selected={payDay === d}
                  onPress={() => setPayDay(d)}
                />
              ))}
            </Row>
            <Text variant="caption" tone="muted">
              {t('onboarding.payDayHint', { day: payDay })}
            </Text>
          </View>
        )}

        {step === 2 && (
          <View style={{ gap: spacing.lg }}>
            <Text variant="title">{t('onboarding.accountsTitle')}</Text>
            <Text tone="muted">{t('onboarding.accountsBody')}</Text>
            {preset.accountSuggestions.map((a) => (
              <Card key={a.nameKey}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Chip
                    icon={a.icon}
                    label={t(`onboarding.accountNames.${a.nameKey}`)}
                    selected={!!selected[a.nameKey]}
                    onPress={() => setSelected((s) => ({ ...s, [a.nameKey]: !s[a.nameKey] }))}
                    testID={`onboarding-account-${a.nameKey}`}
                  />
                </Row>
                {selected[a.nameKey] ? (
                  <TextField
                    label={a.type === 'credit_card' ? t('onboarding.amountOwed') : t('onboarding.currentBalance')}
                    value={balances[a.nameKey] ?? ''}
                    onChangeText={(v) => setBalances((b) => ({ ...b, [a.nameKey]: v }))}
                    keyboardType="numbers-and-punctuation"
                    placeholder="0.00"
                  />
                ) : null}
              </Card>
            ))}
            <Text variant="caption" tone="muted">
              {t('onboarding.cardHint')}
            </Text>
          </View>
        )}

        {step === 3 && (
          <View style={{ gap: spacing.lg }}>
            <Text variant="title">{t('onboarding.methodTitle')}</Text>
            {(['simple', '50_30_20', 'zero_based'] as const).map((m) => (
              <Card
                key={m}
                onPress={() => setMethod(m)}
                style={method === m ? { borderColor: p.primary, borderWidth: 2 } : undefined}
                accessibilityLabel={t(`onboarding.methods.${m}.title`)}
                testID={`onboarding-method-${m}`}
              >
                <Text variant="bodyStrong">
                  {method === m ? '● ' : '○ '}
                  {t(`onboarding.methods.${m}.title`)}
                </Text>
                <Text tone="muted">{t(`onboarding.methods.${m}.body`)}</Text>
              </Card>
            ))}
          </View>
        )}

        <Button
          label={step === STEPS - 1 ? t('onboarding.finish') : t('common.next')}
          onPress={next}
          loading={busy}
          disabled={step === 1 && incomeInvalid}
          testID="onboarding-next"
        />
        {step > 0 ? <Button kind="ghost" label={t('common.back')} onPress={() => setStep(step - 1)} /> : null}
        {step === 0 ? (
          <Button kind="secondary" label={t('onboarding.tryDemo')} onPress={() => void finish(true)} disabled={busy} testID="onboarding-demo" />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
