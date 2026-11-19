import { router } from 'expo-router';
import { memo } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { categoryLabel } from '@/features/categories/categories.repo';
import { Amount, useMoney } from '@/ui/Amount';
import { IconBubble, ListRow } from '@/ui/primitives';
import { Text } from '@/ui/Text';
import type { TransactionListItem } from './transactions.repo';

export function rowTitle(tx: TransactionListItem, t: TFunction): string {
  if (tx.type === 'transfer') return t('tx.transferTitle', { from: tx.accountName, to: tx.toAccountName ?? '' });
  if (tx.type === 'adjustment') return t('tx.adjustment');
  if (tx.merchantName) return tx.merchantName;
  if (tx.splitCount > 0) return t('tx.split', { count: tx.splitCount });
  if (tx.categoryName) return categoryLabel({ name: tx.categoryName, nameKey: tx.categoryNameKey }, t);
  return t('tx.uncategorised');
}

export const TransactionRow = memo(function TransactionRow({ tx, showDate }: { tx: TransactionListItem; showDate?: string }) {
  const { t } = useTranslation();
  const { format } = useMoney();
  const title = rowTitle(tx, t);
  const category = tx.categoryName ? categoryLabel({ name: tx.categoryName, nameKey: tx.categoryNameKey }, t) : null;
  const subtitleParts = [
    tx.type === 'refund' ? t('tx.refund') : tx.merchantName ? category : null,
    tx.type === 'transfer' ? null : tx.accountName,
    tx.note && tx.note !== title ? tx.note : null,
    showDate,
  ].filter(Boolean);
  const icon = tx.type === 'transfer' ? '🔁' : tx.type === 'adjustment' ? '⚖️' : (tx.categoryIcon ?? '🧾');
  const isIn = tx.type === 'income' || tx.type === 'refund';
  return (
    <ListRow
      title={title}
      subtitle={subtitleParts.join(' · ')}
      left={<IconBubble icon={icon} color={tx.categoryColor} />}
      right={
        <View style={{ alignItems: 'flex-end' }}>
          {tx.type === 'transfer' ? (
            <Amount value={tx.amount} tone="muted" variant="bodyStrong" />
          ) : (
            <Amount value={tx.amount} kind={isIn ? 'income' : 'expense'} signed={isIn || tx.type === 'adjustment'} variant="bodyStrong" />
          )}
          {tx.type === 'transfer' ? (
            <Text variant="caption" tone="muted">
              {t('tx.notSpending')}
            </Text>
          ) : null}
        </View>
      }
      onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: tx.id } })}
      testID={`tx-row-${tx.id}`}
      accessibilityLabel={`${title}, ${format(tx.amount, { signed: isIn })}. ${subtitleParts.join(', ')}`}
    />
  );
});
