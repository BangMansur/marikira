import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import type { Bucket } from '@/presets';
import { Button, Chip, Row, Screen, TextField } from '@/ui/primitives';
import { Text } from '@/ui/Text';
import { radius, spacing, usePalette } from '@/ui/theme';
import { SkeletonCard } from '@/ui/feedback';
import type { Category } from './categories.repo';
import { useCategories, useCategoryLabel, useCreateCategory, useUpdateCategory } from './hooks';

const ICONS = ['🍜', '☕', '🛒', '🚌', '⛽', '🅿️', '💡', '📶', '🏠', '🏦', '🛡️', '💊', '🎓', '🛍️', '🎬', '🔁', '👨‍👩‍👧', '🤲', '💇', '✈️', '🌱', '📦', '🐈', '🎮', '⚽', '🎁', '💼', '🛠️', '📈', '💰', '🧒', '🕌', '🍰', '🧺', '🚗', '🏍️'];
const COLORS = ['#E07A5F', '#81B29A', '#3D85C6', '#F2A541', '#6D597A', '#F4D35E', '#5FA8D3', '#B56576', '#355070', '#2A9D8F', '#E76F51', '#457B9D', '#D81159', '#8F2D56', '#7B2CBF', '#52B788', '#8D99AE', '#2D6A4F'];
const BUCKETS: Bucket[] = ['need', 'want', 'savings_debt'];

export function CategoryEditScreen() {
  const { id, kind } = useLocalSearchParams<{ id?: string; kind?: 'expense' | 'income' }>();
  const { data: all, isLoading } = useCategories({ includeHidden: true });
  if (isLoading || !all) return <Screen edges={['bottom']}><SkeletonCard /></Screen>;
  return <CategoryForm existing={all.find((c) => c.id === id) ?? null} kindParam={kind} />;
}

function CategoryForm({ existing, kindParam }: { existing: Category | null; kindParam?: 'expense' | 'income' }) {
  const { t } = useTranslation();
  const p = usePalette();
  const label = useCategoryLabel();
  const create = useCreateCategory();
  const update = useUpdateCategory();

  const kind = existing?.kind ?? kindParam ?? 'expense';
  const [name, setName] = useState(existing ? label(existing) : '');
  const [icon, setIcon] = useState(existing?.icon ?? ICONS[0]);
  const [color, setColor] = useState(existing?.color ?? COLORS[0]);
  const [bucket, setBucket] = useState<Bucket>(existing?.bucket ?? 'want');

  const save = async () => {
    const input = { name, kind, icon, color, bucket: kind === 'expense' ? bucket : null };
    if (existing) await update.mutateAsync({ id: existing.id, input, nameChanged: name.trim() !== label(existing) });
    else await create.mutateAsync(input);
    router.back();
  };

  return (
    <Screen edges={['bottom']} testID="category-edit">
      <TextField label={t('categories.name')} value={name} onChangeText={setName} maxLength={40} testID="category-name" />
      {kind === 'expense' ? (
        <>
          <Text variant="caption" tone="muted">
            {t('categories.bucket')}
          </Text>
          <Row style={{ flexWrap: 'wrap' }}>
            {BUCKETS.map((b) => (
              <Chip key={b} label={t(`buckets.${b}`)} selected={bucket === b} onPress={() => setBucket(b)} />
            ))}
          </Row>
          <Text variant="caption" tone="muted">
            {t(`buckets.${bucket}Hint`)}
          </Text>
        </>
      ) : null}
      <Text variant="caption" tone="muted">
        {t('categories.icon')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {ICONS.map((i) => (
          <Pressable
            key={i}
            onPress={() => setIcon(i)}
            accessibilityRole="button"
            accessibilityState={{ selected: icon === i }}
            accessibilityLabel={i}
            style={{ width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: icon === i ? p.primary : 'transparent', backgroundColor: p.surface }}
          >
            <Text style={{ fontSize: 22 }}>{i}</Text>
          </Pressable>
        ))}
      </View>
      <Text variant="caption" tone="muted">
        {t('categories.color')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {COLORS.map((c) => (
          <Pressable
            key={c}
            onPress={() => setColor(c)}
            accessibilityRole="button"
            accessibilityState={{ selected: color === c }}
            accessibilityLabel={t('categories.colorOption', { color: c })}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c, borderWidth: 3, borderColor: color === c ? p.text : 'transparent' }}
          />
        ))}
      </View>
      <Button label={t('common.save')} onPress={() => void save()} disabled={!name.trim()} loading={create.isPending || update.isPending} testID="category-save" />
    </Screen>
  );
}
