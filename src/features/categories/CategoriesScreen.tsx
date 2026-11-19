import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { showSnackbar } from '@/stores/snackbar';
import { Button, Card, IconBubble, Row, Screen, Segmented } from '@/ui/primitives';
import { Text } from '@/ui/Text';
import { spacing, usePalette } from '@/ui/theme';
import type { Category } from './categories.repo';
import { useCategories, useCategoryLabel, useRemoveCategory, useReorderCategories, useSetCategoryHidden } from './hooks';

export function CategoriesScreen() {
  const { t } = useTranslation();
  const p = usePalette();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const { data: cats = [] } = useCategories({ kind, includeHidden: true });
  const label = useCategoryLabel();
  const reorder = useReorderCategories();
  const hide = useSetCategoryHidden();
  const remove = useRemoveCategory();

  const top = cats.filter((c) => !c.parentId);
  const children = (id: string) => cats.filter((c) => c.parentId === id);

  const move = (c: Category, dir: -1 | 1) => {
    const i = top.findIndex((x) => x.id === c.id);
    const j = i + dir;
    if (j < 0 || j >= top.length) return;
    const ids = top.map((x) => x.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder.mutate(ids);
  };

  const row = (c: Category, depth: number, index?: number) => (
    <Row key={c.id} style={{ paddingVertical: spacing.sm, paddingLeft: depth * spacing.xl, opacity: c.isHidden ? 0.5 : 1 }}>
      <Pressable
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
        onPress={() => router.push({ pathname: '/categories/edit', params: { id: c.id } })}
        accessibilityRole="button"
        accessibilityLabel={`${label(c)}${c.isHidden ? `, ${t('categories.hidden')}` : ''}`}
      >
        <IconBubble icon={c.icon} color={c.color} size={34} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1}>{label(c)}</Text>
          {c.bucket ? (
            <Text variant="caption" tone="muted">
              {t(`buckets.${c.bucket}`)}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {index != null ? (
        <>
          <IconButton name="chevron-up" label={t('categories.moveUp')} onPress={() => move(c, -1)} disabled={index === 0} color={p.text} />
          <IconButton name="chevron-down" label={t('categories.moveDown')} onPress={() => move(c, 1)} disabled={index === top.length - 1} color={p.text} />
        </>
      ) : null}
      <IconButton
        name={c.isHidden ? 'eye-off-outline' : 'eye-outline'}
        label={c.isHidden ? t('categories.show') : t('categories.hide')}
        onPress={() => hide.mutate({ id: c.id, hidden: !c.isHidden })}
        color={p.text}
      />
      {!c.isSystem ? (
        <IconButton
          name="trash-outline"
          label={t('common.delete')}
          color={p.over}
          onPress={async () => {
            const r = await remove.mutateAsync(c.id);
            showSnackbar({ text: r === 'deleted' ? t('categories.deleted') : t('categories.hiddenBecauseUsed') });
          }}
        />
      ) : null}
    </Row>
  );

  return (
    <Screen edges={['bottom']} testID="categories">
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'expense', label: t('categories.expense') },
          { value: 'income', label: t('categories.income') },
        ]}
      />
      <Text variant="caption" tone="muted">
        {kind === 'expense' ? t('categories.bucketHint') : t('categories.incomeHint')}
      </Text>
      <Card>
        {top.map((c, i) => (
          <View key={c.id}>
            {row(c, 0, i)}
            {children(c.id).map((ch) => row(ch, 1))}
          </View>
        ))}
      </Card>
      <Button label={t('categories.add')} onPress={() => router.push({ pathname: '/categories/edit', params: { kind } })} testID="add-category" />
    </Screen>
  );
}

function IconButton({
  name,
  label,
  onPress,
  disabled,
  color,
}: {
  name: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  color: string;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={{ padding: spacing.sm, opacity: disabled ? 0.3 : 1 }}>
      <Ionicons name={name} size={20} color={color} />
    </Pressable>
  );
}
