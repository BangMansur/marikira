import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { formatBps } from '@/core/money';
import { netWorth } from '@/features/accounts/accounts.repo';
import { useAccounts } from '@/features/accounts/hooks';
import { useCategories } from '@/features/categories/hooks';
import { Amount } from '@/ui/Amount';
import { SkeletonCard } from '@/ui/feedback';
import { Button, Card, EmptyState, IconBubble, ListRow, Screen, SectionHeader } from '@/ui/primitives';
import { Text } from '@/ui/Text';
import { spacing } from '@/ui/theme';

/** Phase 1: Accounts + Categories. Budgets, Commitments and Goals join this tab in Phase 2. */
export function PlanScreen() {
  const { t } = useTranslation();
  const { data: accounts, isLoading } = useAccounts();
  const { data: cats = [] } = useCategories({ includeHidden: true });

  return (
    <Screen testID="plan">
      <Text variant="title" accessibilityRole="header">
        {t('tabs.plan')}
      </Text>

      <SectionHeader title={t('accounts.title')} action={<Button kind="ghost" label={t('accounts.add')} onPress={() => router.push('/accounts/edit')} testID="add-account" />} />
      {isLoading || !accounts ? (
        <SkeletonCard />
      ) : accounts.length === 0 ? (
        <Card>
          <EmptyState icon="👛" title={t('accounts.emptyTitle')} body={t('accounts.emptyBody')} actionLabel={t('accounts.add')} onAction={() => router.push('/accounts/edit')} />
        </Card>
      ) : (
        <>
          <Card>
            <Text variant="caption" tone="muted">
              {t('accounts.netWorth')}
            </Text>
            <Amount value={netWorth(accounts)} variant="title" testID="net-worth" />
            <Text variant="caption" tone="muted">
              {t('accounts.netWorthHint')}
            </Text>
          </Card>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {accounts.map((a) => (
              <ListRow
                key={a.id}
                title={a.name}
                subtitle={
                  a.type === 'credit_card' && a.utilisationBps != null
                    ? t('accounts.utilisation', { pct: formatBps(a.utilisationBps, 0) })
                    : t(`accounts.types.${a.type}`)
                }
                left={<IconBubble icon={a.icon ?? '🏦'} />}
                right={<Amount value={a.balance} variant="bodyStrong" tone={a.balance < 0 ? 'caution' : 'default'} />}
                onPress={() => router.push({ pathname: '/accounts/[id]', params: { id: a.id } })}
                testID={`account-row-${a.name}`}
              />
            ))}
          </Card>
        </>
      )}

      <SectionHeader title={t('categories.title')} />
      <Card onPress={() => router.push('/categories')} accessibilityLabel={t('categories.manage')} testID="manage-categories">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {cats
            .filter((c) => !c.isHidden && !c.parentId && c.kind === 'expense')
            .slice(0, 12)
            .map((c) => (
              <Text key={c.id} style={{ fontSize: 22 }}>
                {c.icon}
              </Text>
            ))}
        </View>
        <Text variant="bodyStrong" tone="primary">
          {t('categories.manage')} ›
        </Text>
        <Text variant="caption" tone="muted">
          {t('categories.manageHint')}
        </Text>
      </Card>
    </Screen>
  );
}
