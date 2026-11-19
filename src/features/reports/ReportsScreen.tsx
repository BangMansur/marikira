import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { divRound, formatBps } from '@/core/money';
import { useCategoryLabel } from '@/features/categories/hooks';
import { Amount, useMoney } from '@/ui/Amount';
import { BarChart, DonutChart } from '@/ui/charts';
import { useDateLabels } from '@/ui/dates';
import { SkeletonCard } from '@/ui/feedback';
import { Card, Divider, EmptyState, Row, Screen, SectionHeader } from '@/ui/primitives';
import { Text } from '@/ui/Text';
import { CHART_COLORS, spacing, usePalette } from '@/ui/theme';
import { useCycleReport, useToday } from './hooks';

const MAX_SLICES = 6;

export function ReportsScreen() {
  const { t } = useTranslation();
  const p = usePalette();
  const [offset, setOffset] = useState(0);
  const { data: r, isLoading } = useCycleReport(offset);
  const { range, short } = useDateLabels();
  const { format } = useMoney();
  const label = useCategoryLabel();
  const today = useToday();

  const change = (bps: number | null, upIsGood: boolean) => {
    if (bps == null) return null;
    const good = upIsGood ? bps >= 0 : bps <= 0;
    return (
      <Text variant="caption" tone={bps === 0 ? 'muted' : good ? 'good' : 'caution'}>
        {bps > 0 ? '▲' : bps < 0 ? '▼' : ''} {formatBps(Math.abs(bps), 0)} {t('reports.vsPrevious')}
      </Text>
    );
  };

  const slices = r
    ? [
        ...r.categories.slice(0, MAX_SLICES).map((c, i) => ({ key: c.categoryId, value: c.total, color: CHART_COLORS[i] })),
        ...(r.categories.length > MAX_SLICES
          ? [{ key: 'other', value: r.categories.slice(MAX_SLICES).reduce((s, c) => s + c.total, 0), color: CHART_COLORS[7] }]
          : []),
      ]
    : [];

  return (
    <Screen testID="reports">
      <Text variant="title" accessibilityRole="header">
        {t('tabs.reports')}
      </Text>
      <Row style={{ justifyContent: 'space-between' }}>
        <Pressable onPress={() => setOffset((o) => o - 1)} accessibilityRole="button" accessibilityLabel={t('reports.previous')} hitSlop={12} style={{ padding: spacing.sm }}>
          <Ionicons name="chevron-back" size={24} color={p.primary} />
        </Pressable>
        <Text variant="bodyStrong" testID="report-period">
          {r ? range(r.cycle.start, r.cycle.end) : ''}
        </Text>
        <Pressable
          onPress={() => setOffset((o) => Math.min(0, o + 1))}
          disabled={offset === 0}
          accessibilityRole="button"
          accessibilityLabel={t('reports.next')}
          hitSlop={12}
          style={{ padding: spacing.sm, opacity: offset === 0 ? 0.3 : 1 }}
        >
          <Ionicons name="chevron-forward" size={24} color={p.primary} />
        </Pressable>
      </Row>

      {isLoading || !r ? (
        <>
          <SkeletonCard />
          <SkeletonCard lines={5} />
        </>
      ) : r.flow.count === 0 ? (
        <Card>
          <EmptyState icon="📊" title={t('reports.emptyTitle')} body={t('reports.emptyBody')} />
        </Card>
      ) : (
        <>
          <Card>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View>
                <Text variant="caption" tone="muted">
                  {t('home.moneyIn')}
                </Text>
                <Amount value={r.flow.moneyIn} kind="income" variant="heading" testID="report-money-in" onPress={() => router.push({ pathname: '/(tabs)/transactions', params: { type: 'income', from: r.cycle.start, to: r.cycle.end, title: t('home.moneyIn') } })} />
                {change(r.moneyInChangeBps, true)}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="caption" tone="muted">
                  {t('home.moneyOut')}
                </Text>
                <Amount value={r.flow.moneyOut} variant="heading" testID="report-money-out" onPress={() => router.push({ pathname: '/(tabs)/transactions', params: { type: 'expense', from: r.cycle.start, to: r.cycle.end, title: t('home.moneyOut') } })} />
                {change(r.moneyOutChangeBps, false)}
              </View>
            </Row>
            <Divider />
            <Row style={{ justifyContent: 'space-between' }}>
              <Text tone="muted">{t('home.net')}</Text>
              <Amount value={r.flow.net} signed tone={r.flow.net >= 0 ? 'good' : 'caution'} variant="bodyStrong" />
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text tone="muted">{t('home.savingsRate')}</Text>
              <Text variant="bodyStrong">{r.flow.savingsRateBps == null ? '—' : formatBps(r.flow.savingsRateBps)}</Text>
            </Row>
          </Card>

          {r.categories.length ? (
            <>
              <SectionHeader title={t('reports.byCategory')} />
              <Card>
                <View style={{ alignItems: 'center' }}>
                  <DonutChart
                    slices={slices}
                    size={180}
                    centerLabel={t('home.moneyOut')}
                    centerValue={format(r.flow.moneyOut, { compact: true })}
                    accessibilityLabel={t('reports.donutA11y', {
                      list: r.categories
                        .slice(0, MAX_SLICES)
                        .map((c) => `${label(c)} ${`${c.sharePct}%`}`)
                        .join(', '),
                    })}
                  />
                </View>
                {r.categories.map((c, i) => (
                  <Pressable
                    key={c.categoryId}
                    onPress={() => router.push({ pathname: '/(tabs)/transactions', params: { categoryId: c.categoryId, from: r.cycle.start, to: r.cycle.end, title: label(c) } })}
                    accessibilityRole="button"
                    accessibilityLabel={`${label(c)}, ${format(c.total)}, ${c.sharePct}%`}
                    style={{ paddingVertical: spacing.xs }}
                    testID={`report-cat-${c.nameKey ?? c.categoryId}`}
                  >
                    <Row>
                      <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: CHART_COLORS[Math.min(i, 7)] }} />
                      <Text style={{ flex: 1 }} numberOfLines={1}>
                        {c.icon} {label(c)}
                      </Text>
                      <Text variant="caption" tone="muted" testID={`report-pct-${c.nameKey ?? c.categoryId}`}>
                        {`${c.sharePct}%`}
                      </Text>
                      <Amount value={c.total} variant="bodyStrong" testID={`report-amt-${c.nameKey ?? c.categoryId}`} />
                    </Row>
                    {c.changeBps != null && Math.abs(c.changeBps) >= 1000 ? (
                      <Text variant="caption" tone="muted" style={{ marginLeft: 20 }}>
                        {c.changeBps > 0
                          ? t('reports.insightUp', { pct: formatBps(c.changeBps, 0), name: label(c) })
                          : t('reports.insightDown', { pct: formatBps(-c.changeBps, 0), name: label(c) })}
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
              </Card>
            </>
          ) : null}

          <SectionHeader title={t('reports.daily')} />
          <Card>
            <BarChart
              bars={r.daily.map((d) => ({ key: d.date, value: d.out, label: short(d.date), highlight: d.date === today }))}
              accessibilityLabel={t('reports.dailyA11y')}
              onPressBar={(date) => router.push({ pathname: '/(tabs)/transactions', params: { from: date, to: date, title: short(date) } })}
              barAccessibilityLabel={(b) => `${short(b.key)}: ${format(b.value)}`}
            />
            <Text variant="caption" tone="muted">
              {t('reports.dailyAverage', {
                amount: format(divRound(r.flow.moneyOut, Math.max(1, r.daily.filter((d) => d.date <= today).length))),
              })}
            </Text>
          </Card>

          {r.biggest.length ? (
            <>
              <SectionHeader title={t('reports.biggest')} />
              <Card>
                {r.biggest.map((b) => (
                  <Pressable key={b.id} onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: b.id } })} accessibilityRole="button" style={{ paddingVertical: spacing.xs }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text style={{ flex: 1 }} numberOfLines={1}>
                        {b.label ?? t('tx.uncategorised')}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {short(b.localDate)}
                      </Text>
                      <Amount value={b.amount} variant="bodyStrong" />
                    </Row>
                  </Pressable>
                ))}
              </Card>
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}
