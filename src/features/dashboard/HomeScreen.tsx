import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { formatBps } from '@/core/money';
import { useCategoryLabel } from '@/features/categories/hooks';
import { useDashboard } from '@/features/reports/hooks';
import type { Dashboard } from '@/features/reports/reports.repo';
import { useSettingsValue, useUpdateSettings } from '@/features/settings/hooks';
import { useTransactionPages } from '@/features/transactions/hooks';
import { TransactionRow } from '@/features/transactions/TransactionRow';
import { Amount, useMoney } from '@/ui/Amount';
import { useDateLabels } from '@/ui/dates';
import { SkeletonCard } from '@/ui/feedback';
import { Button, Card, Divider, EmptyState, IconBubble, ProgressBar, Row, Screen, SectionHeader } from '@/ui/primitives';
import { Text } from '@/ui/Text';
import { spacing, usePalette } from '@/ui/theme';

type TxParams = { type?: string; from?: string; to?: string; categoryId?: string; title?: string };
const drill = (params: TxParams) => router.push({ pathname: '/(tabs)/transactions', params });

export function HomeScreen() {
  const { t } = useTranslation();
  const p = usePalette();
  const { data, isLoading } = useDashboard();
  const hidden = useSettingsValue('hideBalances');
  const update = useUpdateSettings();
  const { range } = useDateLabels();

  return (
    <Screen testID="home">
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text variant="title" accessibilityRole="header">
            {t('home.greeting')}
          </Text>
          {data ? (
            <Text variant="caption" tone="muted">
              {t('home.cycle', { range: range(data.cycle.start, data.cycle.end) })}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={() => update.mutate({ hideBalances: !hidden })}
          accessibilityRole="switch"
          accessibilityState={{ checked: hidden }}
          accessibilityLabel={t('settings.hideBalances')}
          hitSlop={12}
          testID="toggle-hide-balances"
          style={{ padding: spacing.sm }}
        >
          <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={24} color={p.text} />
        </Pressable>
        <Pressable
          onPress={() => router.push('/settings')}
          accessibilityRole="button"
          accessibilityLabel={t('settings.title')}
          hitSlop={12}
          style={{ padding: spacing.sm }}
          testID="open-settings"
        >
          <Ionicons name="settings-outline" size={24} color={p.text} />
        </Pressable>
      </Row>

      {isLoading || !data ? (
        <>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={4} />
        </>
      ) : (
        <>
          <SafeToSpendCard d={data} />
          <MonthCard d={data} />
          <TopCategories d={data} />
          <Recent />
        </>
      )}
    </Screen>
  );
}

function SafeToSpendCard({ d }: { d: Dashboard }) {
  const { t } = useTranslation();
  const { format } = useMoney();
  const today = { from: d.today, to: d.today, title: t('dates.today') };

  if (d.safe.status === 'no_income') {
    return (
      <Card testID="safe-card">
        <Text variant="label" tone="muted">
          {t('home.spentToday')}
        </Text>
        <Amount value={d.spentToday} variant="display" onPress={() => drill({ ...today, type: 'expense' })} testID="spent-today" />
        <Divider />
        <Text tone="muted">{t('home.noIncomeBody')}</Text>
        <Button kind="secondary" label={t('home.addIncome')} onPress={() => router.push('/settings')} />
      </Card>
    );
  }
  const s = d.safe;
  const over = s.status === 'over';
  return (
    <Card testID="safe-card" accessibilityLabel={undefined}>
      <Text variant="label" tone="muted">
        {t('home.safeToday')}
      </Text>
      <Amount value={s.perDay} variant="display" testID="safe-per-day" />
      <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <View>
          <Text variant="caption" tone="muted">
            {t('home.spentToday')}
          </Text>
          <Amount value={d.spentToday} variant="bodyStrong" onPress={() => drill({ ...today, type: 'expense' })} testID="spent-today" />
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="caption" tone="muted">
            {s.leftToday >= 0 ? t('home.leftToday') : t('home.overToday')}
          </Text>
          <Amount
            value={Math.abs(s.leftToday)}
            variant="bodyStrong"
            tone={s.leftToday >= 0 ? 'good' : 'caution'}
            testID="left-today"
          />
        </View>
      </Row>
      {over ? (
        <View accessibilityLiveRegion="polite">
          <Text tone="over" variant="bodyStrong" testID="over-by">
            {t('home.overBy', { amount: format(s.overBy) })}
          </Text>
          <Text variant="caption" tone="muted">
            {t('home.overByHint')}
          </Text>
        </View>
      ) : (
        <Text variant="caption" tone="muted">
          {t('home.daysLeft', { count: s.daysLeft })}
        </Text>
      )}
    </Card>
  );
}

function MonthCard({ d }: { d: Dashboard }) {
  const { t } = useTranslation();
  const range = { from: d.cycle.start, to: d.cycle.end };
  const rate = d.flow.savingsRateBps;
  return (
    <Card testID="month-card">
      <Text variant="label" tone="muted">
        {t('home.thisCycle')}
      </Text>
      <Row style={{ justifyContent: 'space-between' }}>
        <Stat label={t('home.moneyIn')}>
          <Amount value={d.flow.moneyIn} kind="income" variant="heading" onPress={() => drill({ ...range, type: 'income', title: t('home.moneyIn') })} testID="money-in" />
        </Stat>
        <Stat label={t('home.moneyOut')} align="flex-end">
          <Amount value={d.flow.moneyOut} variant="heading" onPress={() => drill({ ...range, type: 'expense', title: t('home.moneyOut') })} testID="money-out" />
        </Stat>
      </Row>
      <Divider />
      <Row style={{ justifyContent: 'space-between' }}>
        <Stat label={t('home.net')}>
          <Amount value={d.flow.net} signed tone={d.flow.net >= 0 ? 'good' : 'caution'} variant="bodyStrong" onPress={() => drill(range)} testID="net" />
        </Stat>
        <Stat label={t('home.savingsRate')} align="flex-end">
          <Text variant="bodyStrong" tone={rate == null ? 'muted' : rate >= 2000 ? 'good' : rate >= 0 ? 'default' : 'caution'} testID="savings-rate">
            {rate == null ? '—' : formatBps(rate)}
          </Text>
        </Stat>
      </Row>
      {rate != null ? (
        <Text variant="caption" tone="muted">
          {rate >= 2000 ? t('home.savingsGood') : rate >= 0 ? t('home.savingsOk') : t('home.savingsNegative')}
        </Text>
      ) : null}
    </Card>
  );
}

function Stat({ label, children, align = 'flex-start' }: { label: string; children: React.ReactNode; align?: 'flex-start' | 'flex-end' }) {
  return (
    <View style={{ alignItems: align, gap: 2 }}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      {children}
    </View>
  );
}

function TopCategories({ d }: { d: Dashboard }) {
  const { t } = useTranslation();
  const label = useCategoryLabel();
  if (d.topCategories.length === 0) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHeader
        title={t('home.topCategories')}
        action={<Button kind="ghost" label={t('common.seeReport')} onPress={() => router.push('/(tabs)/reports')} />}
      />
      <Card>
        {d.topCategories.map((c) => (
          <Pressable
            key={c.categoryId}
            onPress={() => drill({ categoryId: c.categoryId, from: d.cycle.start, to: d.cycle.end, title: label(c) })}
            accessibilityRole="button"
            accessibilityLabel={`${label(c)}, ${`${c.sharePct}%`}`}
            style={{ gap: spacing.xs, paddingVertical: spacing.xs }}
          >
            <Row>
              <IconBubble icon={c.icon} color={c.color} size={28} />
              <Text style={{ flex: 1 }} numberOfLines={1}>
                {label(c)}
              </Text>
              <Text variant="caption" tone="muted" testID={`home-pct-${c.nameKey ?? c.categoryId}`}>
                {`${c.sharePct}%`}
              </Text>
              <Amount value={c.total} variant="bodyStrong" />
            </Row>
            <ProgressBar fractionBps={c.shareBps} tone="primary" />
          </Pressable>
        ))}
      </Card>
    </View>
  );
}

function Recent() {
  const { t } = useTranslation();
  const { data } = useTransactionPages({ sort: 'date_desc' });
  const items = data?.pages[0]?.slice(0, 5) ?? [];
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHeader
        title={t('home.recent')}
        action={items.length ? <Button kind="ghost" label={t('common.seeAll')} onPress={() => router.push('/(tabs)/transactions')} /> : undefined}
      />
      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon="🪙"
            title={t('home.emptyTitle')}
            body={t('home.emptyBody')}
            actionLabel={t('home.emptyAction')}
            onAction={() => router.push('/add-transaction')}
            testID="home-empty"
          />
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {items.map((tx) => (
            <TransactionRow key={tx.id} tx={tx} />
          ))}
        </Card>
      )}
    </View>
  );
}
