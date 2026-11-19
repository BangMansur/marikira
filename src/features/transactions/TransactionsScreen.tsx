import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, SectionList, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getPayCycle, shiftPayCycle, todayLocal } from '@/core/dates';
import { getCurrency, parseAmount } from '@/core/money';
import { useAccounts } from '@/features/accounts/hooks';
import { useSettingsValue } from '@/features/settings/hooks';
import { showSnackbar } from '@/stores/snackbar';
import { Amount } from '@/ui/Amount';
import { useDateLabels } from '@/ui/dates';
import { SkeletonCard } from '@/ui/feedback';
import { Chip, EmptyState, Row, TextField } from '@/ui/primitives';
import { Text } from '@/ui/Text';
import { radius, spacing, usePalette } from '@/ui/theme';
import { useDeleteTransaction, useRestoreTransactions, useTransactionPages } from './hooks';
import type { TxType } from './rules';
import { TransactionRow } from './TransactionRow';
import type { SortOrder, TransactionFilter, TransactionListItem } from './transactions.repo';

type TypeFilter = 'all' | 'out' | 'in' | 'transfer';
type Period = 'cycle' | 'last' | 'all' | 'custom';

const TYPE_MAP: Record<TypeFilter, TxType[] | undefined> = {
  all: undefined,
  out: ['expense', 'refund'],
  in: ['income'],
  transfer: ['transfer'],
};

export function TransactionsScreen() {
  const { t } = useTranslation();
  const p = usePalette();
  const params = useLocalSearchParams<{ type?: string; from?: string; to?: string; categoryId?: string; accountId?: string; title?: string }>();
  const payDay = useSettingsValue('payDay');
  const currency = useSettingsValue('currency');
  const { relative } = useDateLabels();
  const today = todayLocal();
  const { data: accounts = [] } = useAccounts({ includeArchived: true });

  const [text, setText] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [period, setPeriod] = useState<Period>('all');
  const [custom, setCustom] = useState<{ from?: string; to?: string }>({});
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [accountId, setAccountId] = useState<string | undefined>();
  const [drillTitle, setDrillTitle] = useState<string | undefined>();
  const [sort, setSort] = useState<SortOrder>('date_desc');
  const [minText, setMinText] = useState('');
  const [maxText, setMaxText] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Drill-down params (from tapping a number elsewhere) replace the current filters.
  useEffect(() => {
    if (!params.type && !params.from && !params.categoryId && !params.accountId) return;
    setTypeFilter(params.type === 'income' ? 'in' : params.type === 'expense' ? 'out' : params.type === 'transfer' ? 'transfer' : 'all');
    if (params.from || params.to) {
      setPeriod('custom');
      setCustom({ from: params.from, to: params.to });
    }
    setCategoryId(params.categoryId);
    setAccountId(params.accountId);
    setDrillTitle(params.title);
  }, [params.type, params.from, params.to, params.categoryId, params.accountId, params.title]);

  const filter: Omit<TransactionFilter, 'limit' | 'offset'> = useMemo(() => {
    const cycle = getPayCycle(today, payDay);
    const range =
      period === 'cycle'
        ? { from: cycle.start, to: cycle.end }
        : period === 'last'
          ? (() => {
              const c = shiftPayCycle(cycle, -1, payDay);
              return { from: c.start, to: c.end };
            })()
          : period === 'custom'
            ? custom
            : {};
    return {
      ...range,
      text: text || undefined,
      types: TYPE_MAP[typeFilter],
      categoryIds: categoryId ? [categoryId] : undefined,
      accountIds: accountId ? [accountId] : undefined,
      minAmount: parseAmount(minText, currency) ?? undefined,
      maxAmount: parseAmount(maxText, currency) ?? undefined,
      sort,
    };
  }, [today, payDay, period, custom, text, typeFilter, categoryId, accountId, minText, maxText, currency, sort]);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useTransactionPages(filter);
  const items = useMemo(() => data?.pages.flat() ?? [], [data]);

  const sections = useMemo(() => {
    if (!sort.startsWith('date')) return [{ title: '', total: 0, data: items }];
    const groups = new Map<string, TransactionListItem[]>();
    for (const tx of items) groups.set(tx.localDate, [...(groups.get(tx.localDate) ?? []), tx]);
    return [...groups].map(([date, txs]) => ({
      title: date,
      total: txs.reduce((s, x) => s + (x.type === 'expense' ? x.baseAmount : x.type === 'refund' ? -x.baseAmount : 0), 0),
      data: txs,
    }));
  }, [items, sort]);

  const del = useDeleteTransaction();
  const restore = useRestoreTransactions();
  const onDelete = async (tx: TransactionListItem) => {
    const ids = await del.mutateAsync(tx.id);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    showSnackbar({ text: t('tx.deleted'), actionLabel: t('common.undo'), onAction: () => restore.mutate(ids) });
  };

  const activeDrill = !!(categoryId || accountId || period === 'custom');
  const clearDrill = () => {
    setCategoryId(undefined);
    setAccountId(undefined);
    setDrillTitle(undefined);
    setPeriod('all');
    setCustom({});
    router.setParams({ type: undefined, from: undefined, to: undefined, categoryId: undefined, accountId: undefined, title: undefined });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }} edges={['top']} testID="transactions">
      <View style={{ padding: spacing.lg, gap: spacing.sm }}>
        <Text variant="title" accessibilityRole="header">
          {t('tabs.transactions')}
        </Text>
        <Row>
          <View style={{ flex: 1 }}>
            <TextField label={t('tx.search')} value={text} onChangeText={setText} placeholder={t('tx.searchPlaceholder')} returnKeyType="search" testID="tx-search" />
          </View>
          <Pressable
            onPress={() => setShowFilters((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={t('tx.filters')}
            accessibilityState={{ expanded: showFilters }}
            style={{ marginTop: 20, padding: spacing.md, borderRadius: radius.md, backgroundColor: showFilters ? p.primary : p.surfaceAlt }}
          >
            <Ionicons name="options-outline" size={22} color={showFilters ? p.onPrimary : p.text} />
          </Pressable>
        </Row>
        <Row style={{ flexWrap: 'wrap' }}>
          {(['all', 'out', 'in', 'transfer'] as const).map((k) => (
            <Chip key={k} label={t(`tx.filter.${k}`)} selected={typeFilter === k} onPress={() => setTypeFilter(k)} testID={`filter-${k}`} />
          ))}
        </Row>
        {activeDrill ? (
          <Row>
            <Chip label={`${drillTitle ?? t('tx.filtered')}  ✕`} selected onPress={clearDrill} accessibilityLabel={t('tx.clearFilter')} testID="clear-drill" />
          </Row>
        ) : null}
        {showFilters ? (
          <View style={{ gap: spacing.sm }}>
            <Text variant="caption" tone="muted">
              {t('tx.period')}
            </Text>
            <Row style={{ flexWrap: 'wrap' }}>
              {(['cycle', 'last', 'all'] as const).map((k) => (
                <Chip key={k} label={t(`tx.periods.${k}`)} selected={period === k} onPress={() => setPeriod(k)} />
              ))}
            </Row>
            <Text variant="caption" tone="muted">
              {t('tx.account')}
            </Text>
            <Row style={{ flexWrap: 'wrap' }}>
              <Chip label={t('tx.allAccounts')} selected={!accountId} onPress={() => setAccountId(undefined)} />
              {accounts.map((a) => (
                <Chip key={a.id} label={a.name} selected={accountId === a.id} onPress={() => setAccountId(a.id)} />
              ))}
            </Row>
            <Row>
              <View style={{ flex: 1 }}>
                <TextField label={t('tx.minAmount', { symbol: getCurrency(currency).symbol })} value={minText} onChangeText={setMinText} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <TextField label={t('tx.maxAmount', { symbol: getCurrency(currency).symbol })} value={maxText} onChangeText={setMaxText} keyboardType="decimal-pad" />
              </View>
            </Row>
            <Text variant="caption" tone="muted">
              {t('tx.sort')}
            </Text>
            <Row style={{ flexWrap: 'wrap' }}>
              {(['date_desc', 'date_asc', 'amount_desc', 'amount_asc'] as const).map((k) => (
                <Chip key={k} label={t(`tx.sorts.${k}`)} selected={sort === k} onPress={() => setSort(k)} />
              ))}
            </Row>
          </View>
        ) : null}
      </View>

      {isLoading ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(x) => x.id}
          stickySectionHeadersEnabled
          contentContainerStyle={{ paddingBottom: 120 }}
          onEndReached={() => hasNextPage && !isFetchingNextPage && void fetchNextPage()}
          onEndReachedThreshold={0.5}
          renderSectionHeader={({ section }) =>
            section.title ? (
              <Row style={{ justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: p.bg }}>
                <Text variant="label" tone="muted">
                  {relative(section.title, today)}
                </Text>
                {section.total !== 0 ? <Amount value={section.total} variant="caption" tone="muted" /> : null}
              </Row>
            ) : null
          }
          renderItem={({ item }) => <SwipeRow tx={item} onDelete={() => void onDelete(item)} showDate={sort.startsWith('amount') ? relative(item.localDate, today) : undefined} />}
          ListEmptyComponent={
            <EmptyState
              icon={text || activeDrill || typeFilter !== 'all' ? '🔍' : '🧾'}
              title={text || activeDrill || typeFilter !== 'all' ? t('tx.noMatches') : t('tx.emptyTitle')}
              body={text || activeDrill || typeFilter !== 'all' ? t('tx.noMatchesBody') : t('tx.emptyBody')}
              actionLabel={text || activeDrill ? undefined : t('home.emptyAction')}
              onAction={() => router.push('/add-transaction')}
              testID="tx-empty"
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

/** Swipe left to delete, right to edit. Screen readers get the same as accessibility actions. */
function SwipeRow({ tx, onDelete, showDate }: { tx: TransactionListItem; onDelete: () => void; showDate?: string }) {
  const { t } = useTranslation();
  const p = usePalette();
  const editable = tx.type !== 'adjustment';
  const edit = () => router.push({ pathname: '/add-transaction', params: { id: tx.id } });
  return (
    <View
      accessibilityActions={[{ name: 'delete', label: t('common.delete') }, ...(editable ? [{ name: 'edit', label: t('common.edit') }] : [])]}
      onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'delete' ? onDelete() : edit())}
    >
      <ReanimatedSwipeable
        friction={2}
        rightThreshold={60}
        leftThreshold={60}
        overshootRight={false}
        overshootLeft={false}
        renderRightActions={(_pr, _tr, m) => (
          <Pressable
            onPress={() => {
              m.close();
              onDelete();
            }}
            style={{ backgroundColor: p.over, justifyContent: 'center', paddingHorizontal: spacing.xl }}
            accessibilityRole="button"
            accessibilityLabel={t('common.delete')}
            testID={`delete-${tx.id}`}
          >
            <Ionicons name="trash-outline" size={22} color="#fff" />
          </Pressable>
        )}
        renderLeftActions={
          editable
            ? (_pr, _tr, m) => (
                <Pressable
                  onPress={() => {
                    m.close();
                    edit();
                  }}
                  style={{ backgroundColor: p.primary, justifyContent: 'center', paddingHorizontal: spacing.xl }}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.edit')}
                >
                  <Ionicons name="create-outline" size={22} color={p.onPrimary} />
                </Pressable>
              )
            : undefined
        }
      >
        <TransactionRow tx={tx} showDate={showDate} />
      </ReanimatedSwipeable>
    </View>
  );
}
