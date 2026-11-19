import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import { formatMoney, formatMoneyCompact, getCurrency, type Minor } from '@/core/money';
import { useSettingsValue } from '@/features/settings/hooks';
import { Text, type AppTextProps } from './Text';

export const HIDDEN_MASK = '••••';

/** Currency-aware money formatting that honours the "hide balances" privacy toggle. */
export function useMoney() {
  const currency = useSettingsValue('currency');
  const hidden = useSettingsValue('hideBalances');
  const format = useCallback(
    (v: Minor, opts?: { signed?: boolean; compact?: boolean; reveal?: boolean }) => {
      if (hidden && !opts?.reveal) return `${getCurrency(currency).symbol}${HIDDEN_MASK}`;
      return opts?.compact ? formatMoneyCompact(v, currency) : formatMoney(v, currency, { signed: opts?.signed });
    },
    [currency, hidden],
  );
  return { format, currency, hidden };
}

export type AmountKind = 'expense' | 'income' | 'neutral';

/**
 * A money amount. Expenses are shown in normal text colour (never red);
 * income is green with a "+"; "over" states are handled by the caller's tone.
 * Tappable amounts drill down to the transactions behind them.
 */
export function Amount({
  value,
  kind = 'neutral',
  onPress,
  accessibilityHint,
  signed,
  ...text
}: { value: Minor; kind?: AmountKind; onPress?: () => void; accessibilityHint?: string; signed?: boolean } & Omit<
  AppTextProps,
  'children'
>) {
  const { format, hidden } = useMoney();
  const { t } = useTranslation();
  const display = format(value, { signed: signed ?? kind === 'income' });
  const node = (
    <Text
      tabular
      tone={text.tone ?? (kind === 'income' ? 'good' : 'default')}
      accessibilityLabel={hidden ? t('common.hiddenAmount') : display}
      {...text}
    >
      {display}
    </Text>
  );
  if (!onPress) return node;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityHint={accessibilityHint ?? t('common.drillDownHint')} hitSlop={8}>
      {node}
    </Pressable>
  );
}
