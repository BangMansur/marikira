import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { todayLocal } from '@/core/dates';
import { useCategoryLabel, useCategoryMap } from '@/features/categories/hooks';
import { showSnackbar } from '@/stores/snackbar';
import { Amount, useMoney } from '@/ui/Amount';
import { timeLabel, useDateLabels } from '@/ui/dates';
import { SkeletonCard } from '@/ui/feedback';
import { Button, Card, Divider, EmptyState, IconBubble, Row, Screen } from '@/ui/primitives';
import { Text } from '@/ui/Text';
import { spacing } from '@/ui/theme';
import { useDeleteTransaction, useRestoreTransactions, useTransaction } from './hooks';
import { rowTitle } from './TransactionRow';

export function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { data: tx, isLoading } = useTransaction(id);
  const cats = useCategoryMap();
  const label = useCategoryLabel();
  const { format } = useMoney();
  const { relative } = useDateLabels();
  const del = useDeleteTransaction();
  const restore = useRestoreTransactions();

  if (isLoading) {
    return (
      <Screen edges={[]}>
        <SkeletonCard lines={5} />
      </Screen>
    );
  }
  if (!tx) {
    return (
      <Screen edges={[]}>
        <EmptyState icon="🫥" title={t('detail.goneTitle')} body={t('detail.goneBody')} />
      </Screen>
    );
  }

  const isIn = tx.type === 'income' || tx.type === 'refund';
  const field = (k: string, v: string | null | undefined) =>
    v ? (
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }} key={k}>
        <Text tone="muted">{k}</Text>
        <Text style={{ flex: 1, textAlign: 'right' }}>{v}</Text>
      </Row>
    ) : null;

  const onDelete = async () => {
    const ids = await del.mutateAsync(tx.id);
    showSnackbar({ text: t('tx.deleted'), actionLabel: t('common.undo'), onAction: () => restore.mutate(ids) });
    router.back();
  };

  return (
    <Screen edges={['bottom']} testID="tx-detail">
      <Card>
        <Row>
          <IconBubble icon={tx.type === 'transfer' ? '🔁' : (tx.categoryIcon ?? '🧾')} color={tx.categoryColor} size={48} />
          <View style={{ flex: 1 }}>
            <Text variant="heading">{rowTitle(tx, t)}</Text>
            <Text variant="caption" tone="muted">
              {t(`tx.types.${tx.type}`)}
            </Text>
          </View>
        </Row>
        <Amount value={tx.amount} kind={isIn ? 'income' : tx.type === 'transfer' ? 'neutral' : 'expense'} variant="display" />
        {tx.type === 'transfer' ? <Text tone="muted">{t('detail.transferNote')}</Text> : null}
        {tx.refundedAmount > 0 ? <Text tone="good">{t('detail.refunded', { amount: format(tx.refundedAmount) })}</Text> : null}
      </Card>
      <Card>
        {field(t('detail.date'), `${relative(tx.localDate, todayLocal())} · ${timeLabel(tx.occurredAt)}`)}
        <Divider />
        {tx.categoryName ? field(t('add.category'), label({ name: tx.categoryName, nameKey: tx.categoryNameKey })) : null}
        {tx.splits.length ? (
          <View style={{ gap: spacing.xs }}>
            <Text tone="muted">{t('detail.splits')}</Text>
            {tx.splits.map((s) => {
              const c = cats.get(s.categoryId);
              return (
                <Row key={s.id} style={{ justifyContent: 'space-between' }}>
                  <Text>
                    {c?.icon} {c ? label(c) : ''}
                  </Text>
                  <Amount value={s.amount} />
                </Row>
              );
            })}
          </View>
        ) : null}
        {field(tx.type === 'transfer' ? t('add.from') : t('tx.account'), tx.accountName)}
        {field(t('add.to'), tx.toAccountName)}
        {field(t('add.merchant'), tx.merchantName)}
        {field(t('add.paymentMethod'), tx.paymentMethod ? t(`paymentMethods.${tx.paymentMethod}`) : null)}
        {field(t('add.tags'), tx.tags.join(', '))}
        {field(t('add.note'), tx.note)}
      </Card>
      {tx.type !== 'adjustment' ? (
        <Button kind="secondary" label={t('common.edit')} onPress={() => router.push({ pathname: '/add-transaction', params: { id: tx.id } })} testID="detail-edit" />
      ) : (
        <Text variant="caption" tone="muted">
          {t('detail.adjustmentNote')}
        </Text>
      )}
      {tx.type === 'expense' && tx.refundedAmount < tx.amount ? (
        <Button kind="secondary" label={t('detail.recordRefund')} onPress={() => router.push({ pathname: '/add-transaction', params: { refundOf: tx.id } })} />
      ) : null}
      <Button kind="danger" label={t('common.delete')} onPress={() => void onDelete()} testID="detail-delete" />
    </Screen>
  );
}
