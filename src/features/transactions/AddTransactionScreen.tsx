import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { evaluateToMinor, hasOperator } from '@/core/calculator/calculator';
import { addDays, localDateTimeToEpochMs, todayLocal } from '@/core/dates';
import { formatMoney, getCurrency, toDecimalString } from '@/core/money';
import { ValidationError } from '@/db/helpers';
import { useAccounts } from '@/features/accounts/hooks';
import { useCategories, useCategoryLabel } from '@/features/categories/hooks';
import { useSettingsValue } from '@/features/settings/hooks';
import { showSnackbar } from '@/stores/snackbar';
import { useDateLabels } from '@/ui/dates';
import { SkeletonCard } from '@/ui/feedback';
import { Keypad } from '@/ui/Keypad';
import { Button, Chip, Row, Segmented, TextField } from '@/ui/primitives';
import { Text } from '@/ui/Text';
import { radius, spacing, usePalette } from '@/ui/theme';
import {
  useCategorySuggestions,
  useCreateTransaction,
  useLastAccountId,
  useMerchantCategory,
  useMerchantSearch,
  useTransaction,
  useUpdateTransaction,
} from './hooks';
import type { EntryType, TransactionInput } from './rules';
import type { TransactionDetail } from './transactions.repo';

const PAYMENT_METHODS = ['cash', 'card', 'duitnow', 'ewallet', 'online_banking'] as const;

/**
 * Quick add: amount → category → Save (3 taps). Everything else is optional and tucked
 * under "More details". Also handles editing (?id=) and refunds (?refundOf=).
 */
export function AddTransactionScreen() {
  const params = useLocalSearchParams<{ id?: string; refundOf?: string; type?: EntryType }>();
  const editingQ = useTransaction(params.id);
  const refundQ = useTransaction(params.refundOf);
  const accountsQ = useAccounts();
  const lastQ = useLastAccountId();
  // Wait for everything the form's initial values depend on, then mount it once.
  if (editingQ.isLoading || refundQ.isLoading || accountsQ.isLoading || lastQ.isLoading) {
    return (
      <View style={{ padding: spacing.lg }}>
        <SkeletonCard lines={4} />
      </View>
    );
  }
  return (
    <TransactionForm
      editing={editingQ.data ?? null}
      refundOf={refundQ.data ?? null}
      initialType={params.refundOf ? 'refund' : (params.type ?? 'expense')}
      defaultAccountId={lastQ.data ?? null}
    />
  );
}

function TransactionForm({
  editing,
  refundOf,
  initialType,
  defaultAccountId,
}: {
  editing: TransactionDetail | null;
  refundOf: TransactionDetail | null;
  initialType: EntryType;
  defaultAccountId: string | null;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  const editingId = editing?.id;
  const currency = useSettingsValue('currency');
  const exponent = getCurrency(currency).exponent;
  const { short } = useDateLabels();
  const { data: accounts = [] } = useAccounts();

  const src = editing;
  const [type, setType] = useState<EntryType>(src ? (src.type === 'adjustment' ? 'expense' : src.type) : initialType);
  const [expr, setExpr] = useState(() =>
    src ? toDecimalString(src.amount, currency) : refundOf ? toDecimalString(refundOf.amount - refundOf.refundedAmount, currency) : '',
  );
  const [categoryId, setCategoryId] = useState<string | null>(src?.categoryId ?? null);
  const [pickedAccountId, setAccountId] = useState<string | null>(src?.accountId ?? refundOf?.accountId ?? null);
  const [toAccountId, setToAccountId] = useState<string | null>(src?.toAccountId ?? null);
  const [date, setDate] = useState(src?.localDate ?? todayLocal());
  const [merchant, setMerchant] = useState(src?.merchantName ?? refundOf?.merchantName ?? '');
  const [note, setNote] = useState(src?.note ?? '');
  const [tagsText, setTagsText] = useState(src?.tags.join(', ') ?? '');
  const [method, setMethod] = useState<string | null>(src?.paymentMethod ?? null);
  const [showMore, setShowMore] = useState(!!(src && (src.note || src.tags.length || src.paymentMethod)));
  const [showAllCats, setShowAllCats] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userPickedCategory = useRef(!!src);

  // Smart default account: the one picked, else last used, else the first.
  const accountId =
    pickedAccountId ?? accounts.find((a) => a.id === defaultAccountId)?.id ?? accounts[0]?.id ?? null;

  const catKind = type === 'income' ? 'income' : 'expense';
  const { data: allCats = [] } = useCategories({ kind: catKind });
  const { data: suggestions = [] } = useCategorySuggestions(catKind, merchant);
  const { data: merchantMatches = [] } = useMerchantSearch(merchant);
  const { data: learnedCategory } = useMerchantCategory(type === 'transfer' || type === 'refund' ? '' : merchant);
  const label = useCategoryLabel();

  // When the merchant is known, pre-select its learned category (until the user picks one).
  useEffect(() => {
    if (!userPickedCategory.current && learnedCategory && allCats.some((c) => c.id === learnedCategory)) {
      setCategoryId(learnedCategory);
    }
  }, [learnedCategory, allCats]);

  const chipCats = useMemo(() => {
    const byId = new Map(allCats.map((c) => [c.id, c]));
    const list = showAllCats ? allCats : suggestions.map((id) => byId.get(id)).filter((c): c is NonNullable<typeof c> => !!c);
    if (categoryId && !list.some((c) => c.id === categoryId)) {
      const sel = byId.get(categoryId);
      if (sel) list.unshift(sel);
    }
    return list;
  }, [allCats, suggestions, showAllCats, categoryId]);

  const amount = evaluateToMinor(expr, exponent);
  const create = useCreateTransaction();
  const update = useUpdateTransaction();
  const busy = create.isPending || update.isPending;

  const needsCategory = type === 'expense' || type === 'income';
  const canSave =
    !!amount &&
    amount > 0 &&
    !!accountId &&
    (!needsCategory || !!categoryId) &&
    (type !== 'transfer' || (!!toAccountId && toAccountId !== accountId));

  const save = async () => {
    if (!canSave || !amount || !accountId) return;
    setError(null);
    const now = new Date();
    const input: TransactionInput = {
      type,
      amount,
      accountId,
      toAccountId: type === 'transfer' ? toAccountId : null,
      categoryId: needsCategory ? categoryId : null,
      refundOfId: type === 'refund' ? (refundOf?.id ?? editing?.refundOfId ?? null) : null,
      localDate: date,
      occurredAt: editing && editing.localDate === date ? editing.occurredAt : localDateTimeToEpochMs(date, now),
      merchantName: type === 'transfer' ? null : merchant.trim() || null,
      note: note.trim() || null,
      paymentMethod: method,
      tags: tagsText.split(',').map((s) => s.trim()).filter(Boolean),
    };
    try {
      if (editingId) await update.mutateAsync({ id: editingId, input });
      else await create.mutateAsync(input);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      showSnackbar({ text: editingId ? t('add.updated') : t('add.saved', { amount: formatMoney(amount, currency) }) });
      router.back();
    } catch (e) {
      setError(e instanceof ValidationError ? t(`errors.validation.${e.code}`, { defaultValue: t('errors.generic') }) : t('errors.generic'));
    }
  };

  const showRefundHeader = type === 'refund';
  const typeOptions: { value: EntryType; label: string }[] = [
    { value: 'expense', label: t('add.expense') },
    { value: 'income', label: t('add.income') },
    { value: 'transfer', label: t('add.transfer') },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }} edges={['bottom']} testID="add-transaction">
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
        {showRefundHeader ? (
          <Text variant="bodyStrong">{t('add.refundFor', { name: refundOf?.merchantName ?? refundOf?.note ?? '' })}</Text>
        ) : (
          <Segmented
            options={typeOptions}
            value={type}
            onChange={(v) => {
              setType(v);
              setCategoryId(null);
              userPickedCategory.current = false;
            }}
            testIDPrefix="type"
          />
        )}

        {/* Amount display */}
        <View
          style={{ alignItems: 'flex-end', paddingVertical: spacing.sm }}
          accessible
          accessibilityLabel={t('add.amountA11y', { amount: amount != null ? formatMoney(amount, currency) : t('add.noAmount') })}
          accessibilityLiveRegion="polite"
        >
          {hasOperator(expr) ? (
            <Text tone="muted" testID="amount-expression">
              {expr}
            </Text>
          ) : null}
          <Text variant="display" tabular testID="amount-display" tone={amount != null && amount < 0 ? 'over' : 'default'}>
            {getCurrency(currency).symbol}
            {amount != null ? toDecimalString(Math.abs(amount), currency) : '0'}
          </Text>
        </View>

        {/* Category or transfer target */}
        {type === 'transfer' ? (
          <AccountPicker
            label={t('add.to')}
            accounts={accounts.filter((a) => a.id !== accountId)}
            value={toAccountId}
            onChange={setToAccountId}
            testIDPrefix="to-account"
          />
        ) : needsCategory ? (
          <View style={{ gap: spacing.xs }}>
            <Text variant="caption" tone="muted">
              {t('add.category')}
            </Text>
            <ScrollView horizontal={!showAllCats} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, flexWrap: showAllCats ? 'wrap' : 'nowrap', flexDirection: 'row' }}>
              {chipCats.map((c) => (
                <Chip
                  key={c.id}
                  icon={c.icon}
                  label={label(c)}
                  selected={categoryId === c.id}
                  onPress={() => {
                    userPickedCategory.current = true;
                    setCategoryId(c.id);
                  }}
                  testID={`cat-${c.nameKey ?? c.id}`}
                />
              ))}
              <Chip label={showAllCats ? t('add.fewerCategories') : t('add.allCategories')} onPress={() => setShowAllCats((v) => !v)} testID="cat-all" />
            </ScrollView>
          </View>
        ) : null}

        <AccountPicker
          label={type === 'transfer' ? t('add.from') : type === 'income' || type === 'refund' ? t('add.into') : t('add.paidFrom')}
          accounts={accounts}
          value={accountId}
          onChange={(id) => {
            setAccountId(id);
            if (id === toAccountId) setToAccountId(null);
          }}
          testIDPrefix="account"
        />

        <Keypad value={expr} onChange={setExpr} exponent={exponent} />

        {error ? (
          <Text tone="over" accessibilityLiveRegion="assertive">
            {error}
          </Text>
        ) : null}
        <Button label={editingId ? t('common.saveChanges') : t('common.save')} onPress={() => void save()} disabled={!canSave} loading={busy} testID="save-transaction" />

        <Pressable onPress={() => setShowMore((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showMore }} style={{ paddingVertical: spacing.sm }}>
          <Text tone="primary" variant="bodyStrong" align="center">
            {showMore ? t('add.lessDetails') : t('add.moreDetails')}
          </Text>
        </Pressable>

        {showMore ? (
          <View style={{ gap: spacing.md }}>
            <Text variant="caption" tone="muted">
              {t('add.date')}
            </Text>
            <Row style={{ justifyContent: 'space-between' }}>
              <Button kind="secondary" label="‹" onPress={() => setDate(addDays(date, -1))} accessibilityHint={t('add.prevDay')} />
              <Text variant="bodyStrong" testID="date-label">
                {date === todayLocal() ? t('dates.today') : short(date)}
              </Text>
              <Button kind="secondary" label="›" onPress={() => setDate(addDays(date, 1))} disabled={date >= todayLocal()} accessibilityHint={t('add.nextDay')} />
            </Row>
            {type !== 'transfer' ? (
              <View style={{ gap: spacing.xs }}>
                <TextField label={t('add.merchant')} value={merchant} onChangeText={setMerchant} placeholder={t('add.merchantPlaceholder')} testID="merchant-input" autoCorrect={false} />
                {merchantMatches.filter((m) => m !== merchant).length ? (
                  <Row style={{ flexWrap: 'wrap' }}>
                    {merchantMatches
                      .filter((m) => m !== merchant)
                      .map((m) => (
                        <Chip key={m} label={m} onPress={() => setMerchant(m)} />
                      ))}
                  </Row>
                ) : null}
              </View>
            ) : null}
            <TextField label={t('add.note')} value={note} onChangeText={setNote} multiline maxLength={500} testID="note-input" />
            <TextField label={t('add.tags')} value={tagsText} onChangeText={setTagsText} placeholder={t('add.tagsPlaceholder')} autoCapitalize="none" />
            {type === 'expense' ? (
              <>
                <Text variant="caption" tone="muted">
                  {t('add.paymentMethod')}
                </Text>
                <Row style={{ flexWrap: 'wrap' }}>
                  {PAYMENT_METHODS.map((m) => (
                    <Chip key={m} label={t(`paymentMethods.${m}`)} selected={method === m} onPress={() => setMethod(method === m ? null : m)} />
                  ))}
                </Row>
              </>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function AccountPicker({
  label,
  accounts,
  value,
  onChange,
  testIDPrefix,
}: {
  label: string;
  accounts: { id: string; name: string; icon: string | null }[];
  value: string | null;
  onChange: (id: string) => void;
  testIDPrefix: string;
}) {
  const { t } = useTranslation();
  const p = usePalette();
  if (accounts.length === 0) {
    return (
      <View style={{ padding: spacing.md, borderRadius: radius.md, backgroundColor: p.cautionBg }}>
        <Text tone="caution">{t('add.noAccounts')}</Text>
        <Button kind="ghost" label={t('accounts.add')} onPress={() => router.push('/accounts/edit')} />
      </View>
    );
  }
  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {accounts.map((a, i) => (
          <Chip key={a.id} icon={a.icon ?? undefined} label={a.name} selected={value === a.id} onPress={() => onChange(a.id)} testID={`${testIDPrefix}-${i}`} />
        ))}
      </ScrollView>
    </View>
  );
}
