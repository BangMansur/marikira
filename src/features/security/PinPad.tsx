import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { radius, spacing, usePalette } from '@/ui/theme';
import { PIN_MAX } from './pinCrypto';

/** Numeric PIN entry with masked dots. */
export function PinPad({
  value,
  onChange,
  length = PIN_MAX,
  extraKey,
  testIDPrefix = 'pin',
}: {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  extraKey?: { label: string; accessibilityLabel: string; onPress: () => void };
  testIDPrefix?: string;
}) {
  const p = usePalette();
  const { t } = useTranslation();
  const press = (d: string) => {
    void Haptics.selectionAsync().catch(() => undefined);
    if (d === 'back') onChange(value.slice(0, -1));
    else if (value.length < length) onChange(value + d);
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'extra', '0', 'back'];
  return (
    <View style={{ gap: spacing.xl, alignItems: 'center' }}>
      <View
        style={{ flexDirection: 'row', gap: spacing.md }}
        accessible
        accessibilityLabel={t('security.pinDigitsEntered', { count: value.length })}
      >
        {Array.from({ length }, (_, i) => (
          <View
            key={i}
            style={[styles.dot, { borderColor: p.primary, backgroundColor: i < value.length ? p.primary : 'transparent' }]}
          />
        ))}
      </View>
      <View style={styles.grid}>
        {keys.map((k) => {
          if (k === 'extra') {
            return extraKey ? (
              <Pressable
                key={k}
                onPress={extraKey.onPress}
                style={styles.key}
                accessibilityRole="button"
                accessibilityLabel={extraKey.accessibilityLabel}
              >
                <Text variant="title">{extraKey.label}</Text>
              </Pressable>
            ) : (
              <View key={k} style={styles.key} />
            );
          }
          return (
            <Pressable
              key={k}
              onPress={() => press(k)}
              accessibilityRole="button"
              accessibilityLabel={k === 'back' ? t('keypad.backspace') : k}
              testID={`${testIDPrefix}-${k}`}
              style={({ pressed }) => [styles.key, { backgroundColor: pressed ? p.border : p.surfaceAlt }]}
            >
              <Text variant="title">{k === 'back' ? '⌫' : k}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: 3 * 76 + 2 * 16, gap: 16, justifyContent: 'center' },
  key: { width: 76, height: 76, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
