import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import { formatBps, getCurrency, parseAmount, toDecimalString } from '@/core/money';
import { useTransactionPages } from '@/features/transactions/hooks';
import { TransactionRow } from '@/features/transactions/TransactionRow';
import { showSnackbar } from '@/stores/snackbar';
import { Amount } from '@/ui/Amount';
import { SkeletonCard } from '@/ui/feedback';
import { Button, Card, EmptyState, ProgressBar, Row, Screen, SectionHeader, TextField } from '@/ui/primitives';
import { Text } from '@/ui/Text';
import { useAccount, useAdjustBalance, useArchiveAccount } from './hooks';

export function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { data: a, isLoading } = useAccount(id);
  const { data: txPages } = useTransactionPages({ accountIds: id ? [id] : [] });
  const adjust = useAdjustBalance();
  const archive = useArchiveAccount();
  const [adjusting, setAdjusting] = useState(false);
  const [balanceText, setBalanceText] = useState('');
  const [note, setNote] = useState('');

  if (isLoading) return <Screen edges={[]}><SkeletonCard /></Screen>;
  if (!a) return <Screen edges={[]}><EmptyState icon="🫥" title={t('detail.goneTitle')} body={t('detail.goneBody')} /></Screen>;

  const parsed = parseAmount(balanceText, a.currency);
  const recent = txPages?.pages[0]?.slice(0, 20) ?? [];
  const utilTone = a.utilisationBps == null ? 'good' : a.utilisationBps > 7000 ? 'over' : a.utilisationBps >= 3000 ? 'caution' : 'good';

  return (
    <Screen edges={['bottom']} testID="account-detail">
      <Card>
        <Text variant="heading">
          {a.icon} {a.name}
        </Text>
        <Text variant="caption" tone="muted">
          {t(`accounts.types.${a.type}`)}
          {a.isArchived ? ` · ${t('accounts.archived')}` : ''}
        </Text>
        <Amount value={a.balance} variant="display" tone={a.balance < 0 ? 'caution' : 'default'} testID="account-balance" />
        {a.type === 'credit_card' ? (
          <>
            <Text tone="muted">{a.balance < 0 ? t('accounts.owed') : t('accounts.nothingOwed')}</Text>
            {a.creditLimit ? (
              <>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text variant="caption" tone="muted">
                    {t('accounts.utilisation', { pct: formatBps(a.utilisationBps ?? 0, 0) })}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {t('accounts.limit')} <Amount value={a.creditLimit} variant="caption" tone="muted" />
                  </Text>
                </Row>
                <ProgressBar fractionBps={a.utilisationBps ?? 0} tone={utilTone} accessibilityLabel={t('accounts.utilisation', { pct: formatBps(a.utilisationBps ?? 0, 0) })} />
                <Text variant="caption" tone="muted">
                  {t('accounts.utilisationHint')}
                </Text>
              </>
            ) : null}
            {a.dueDay ? <Text variant="caption" tone="muted">{t('accounts.dueOn', { day: a.dueDay })}</Text> : null}
          </>
        ) : null}
      </Card>

      {adjusting ? (
        <Card>
          <Text variant="bodyStrong">{t('accounts.adjustTitle')}</Text>
          <Text variant="caption" tone="muted">
            {t('accounts.adjustHint')}
          </Text>
          <TextField
            label={t('accounts.actualBalance', { symbol: getCurrency(a.currency).symbol })}
            value={balanceText}
            onChangeText={setBalanceText}
            keyboardType="numbers-and-punctuation"
            error={balanceText && parsed == null ? t('errors.amountInvalid') : null}
            testID="adjust-input"
          />
          <TextField label={t('add.note')} value={note} onChangeText={setNote} />
          <Button
            label={t('common.save')}
            disabled={parsed == null}
            loading={adjust.isPending}
            onPress={async () => {
              const r = await adjust.mutateAsync({ id: a.id, balance: parsed!, note: note.trim() || t('accounts.adjustDefaultNote') });
              setAdjusting(false);
              showSnackbar({ text: r ? t('accounts.adjusted') : t('accounts.noChange') });
            }}
          />
          <Button kind="ghost" label={t('common.cancel')} onPress={() => setAdjusting(false)} />
        </Card>
      ) : (
        <Row>
          <Button
            kind="secondary"
            style={{ flex: 1 }}
            label={t('accounts.adjust')}
            onPress={() => {
              setBalanceText(toDecimalString(a.balance, a.currency));
              setAdjusting(true);
            }}
            testID="adjust-balance"
          />
          <Button kind="secondary" style={{ flex: 1 }} label={t('common.edit')} onPress={() => router.push({ pathname: '/accounts/edit', params: { id: a.id } })} />
        </Row>
      )}

      <SectionHeader
        title={t('home.recent')}
        action={<Button kind="ghost" label={t('common.seeAll')} onPress={() => router.push({ pathname: '/(tabs)/transactions', params: { accountId: a.id, title: a.name } })} />}
      />
      {recent.length ? (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {recent.map((tx) => (
            <TransactionRow key={tx.id} tx={tx} />
          ))}
        </Card>
      ) : (
        <Text tone="muted">{t('accounts.noTransactions')}</Text>
      )}

      <Button
        kind="ghost"
        label={a.isArchived ? t('accounts.unarchive') : t('accounts.archive')}
        onPress={() =>
          a.isArchived
            ? archive.mutate({ id: a.id, archived: false })
            : Alert.alert(t('accounts.archive'), t('accounts.archiveConfirm'), [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('accounts.archive'),
                  onPress: async () => {
                    await archive.mutateAsync({ id: a.id, archived: true });
                    router.back();
                  },
                },
              ])
        }
      />
    </Screen>
  );
}
