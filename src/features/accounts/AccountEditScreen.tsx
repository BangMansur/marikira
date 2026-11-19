import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getCurrency, parseAmount, toDecimalString } from '@/core/money';
import { ValidationError } from '@/db/helpers';
import { useSettingsValue } from '@/features/settings/hooks';
import { Button, Chip, Row, Screen, TextField } from '@/ui/primitives';
import { Text } from '@/ui/Text';
import { ACCOUNT_TYPES, type AccountType } from './accounts.repo';
import { useAccount, useCreateAccount, useUpdateAccount } from './hooks';

const ICONS: Record<AccountType, string> = { cash: '💵', bank: '🏦', ewallet: '📱', credit_card: '💳', investment: '📈', loan: '🧾' };

export function AccountEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useTranslation();
  const currency = useSettingsValue('currency');
  const symbol = getCurrency(currency).symbol;
  const { data: existing } = useAccount(id);
  const create = useCreateAccount();
  const update = useUpdateAccount();

  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('bank');
  const [opening, setOpening] = useState('');
  const [limit, setLimit] = useState('');
  const [statementDay, setStatementDay] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setType(existing.type);
    setLimit(existing.creditLimit != null ? toDecimalString(existing.creditLimit, currency) : '');
    setStatementDay(existing.statementDay ? String(existing.statementDay) : '');
    setDueDay(existing.dueDay ? String(existing.dueDay) : '');
  }, [existing, currency]);

  const isLiability = type === 'credit_card' || type === 'loan';
  const openingMinor = opening ? parseAmount(opening, currency) : 0;
  const limitMinor = limit ? parseAmount(limit, currency) : null;
  const day = (s: string) => (s ? Number.parseInt(s, 10) : null);
  const dayInvalid = (s: string) => !!s && !(Number.isInteger(day(s)) && day(s)! >= 1 && day(s)! <= 31);
  const invalid = !name.trim() || openingMinor == null || (!!limit && limitMinor == null) || dayInvalid(statementDay) || dayInvalid(dueDay);

  const save = async () => {
    setError(null);
    const common = {
      name,
      type,
      icon: ICONS[type],
      creditLimit: limitMinor,
      statementDay: day(statementDay),
      dueDay: day(dueDay),
    };
    try {
      if (id) await update.mutateAsync({ id, input: common });
      else {
        const v = Math.abs(openingMinor ?? 0);
        // Liabilities: what you owe is stored as a negative balance.
        await create.mutateAsync({ ...common, currency, openingBalance: isLiability && v > 0 ? -v : v });
      }
      router.back();
    } catch (e) {
      setError(e instanceof ValidationError ? t(`errors.validation.${e.code}`, { defaultValue: t('errors.generic') }) : t('errors.generic'));
    }
  };

  return (
    <Screen edges={['bottom']} testID="account-edit">
      <TextField label={t('accounts.name')} value={name} onChangeText={setName} maxLength={40} placeholder={t('accounts.namePlaceholder')} testID="account-name" />
      <Text variant="caption" tone="muted">
        {t('accounts.type')}
      </Text>
      <Row style={{ flexWrap: 'wrap' }}>
        {ACCOUNT_TYPES.map((k) => (
          <Chip key={k} icon={ICONS[k]} label={t(`accounts.types.${k}`)} selected={type === k} onPress={() => setType(k)} testID={`account-type-${k}`} />
        ))}
      </Row>
      {!id ? (
        <TextField
          label={isLiability ? t('accounts.amountOwed', { symbol }) : t('accounts.openingBalance', { symbol })}
          value={opening}
          onChangeText={setOpening}
          keyboardType="numbers-and-punctuation"
          placeholder="0.00"
          error={openingMinor == null ? t('errors.amountInvalid') : null}
          testID="account-opening"
        />
      ) : (
        <Text variant="caption" tone="muted">
          {t('accounts.balanceEditHint')}
        </Text>
      )}
      {type === 'credit_card' ? (
        <>
          <TextField label={t('accounts.creditLimit', { symbol })} value={limit} onChangeText={setLimit} keyboardType="decimal-pad" error={limit && limitMinor == null ? t('errors.amountInvalid') : null} />
          <Row>
            <TextField label={t('accounts.statementDay')} value={statementDay} onChangeText={setStatementDay} keyboardType="number-pad" maxLength={2} style={{ minWidth: 120 }} error={dayInvalid(statementDay) ? t('errors.dayInvalid') : null} />
            <TextField label={t('accounts.dueDay')} value={dueDay} onChangeText={setDueDay} keyboardType="number-pad" maxLength={2} style={{ minWidth: 120 }} error={dayInvalid(dueDay) ? t('errors.dayInvalid') : null} />
          </Row>
        </>
      ) : null}
      {error ? <Text tone="over">{error}</Text> : null}
      <Button label={t('common.save')} onPress={() => void save()} disabled={invalid} loading={create.isPending || update.isPending} testID="account-save" />
    </Screen>
  );
}
