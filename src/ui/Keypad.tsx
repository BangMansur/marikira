import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { applyKey, type Key } from '@/core/calculator/calculator';
import { Text } from './Text';
import { radius, spacing, usePalette } from './theme';

const ROWS: Key[][] = [
  ['7', '8', '9', '÷'],
  ['4', '5', '6', '×'],
  ['1', '2', '3', '−'],
  ['.', '0', 'back', '+'],
];

/**
 * Large-key amount pad with a built-in calculator ("12.50+8").
 * Pure input logic lives in core/calculator (unit-tested); this only renders keys.
 */
export function Keypad({ value, onChange, exponent }: { value: string; onChange: (v: string) => void; exponent: number }) {
  const p = usePalette();
  const { t } = useTranslation();
  const press = (k: Key) => {
    void Haptics.selectionAsync().catch(() => undefined);
    onChange(applyKey(value, k, exponent));
  };
  const label = (k: Key) =>
    k === 'back' ? t('keypad.backspace') : k === '.' ? t('keypad.decimal') : k === '+' ? t('keypad.plus') : k === '−' ? t('keypad.minus') : k === '×' ? t('keypad.times') : k === '÷' ? t('keypad.divide') : k;
  return (
    <View style={{ gap: spacing.sm }}>
      {ROWS.map((row, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: spacing.sm }}>
          {row.map((k) => {
            const op = ['+', '−', '×', '÷'].includes(k);
            return (
              <Pressable
                key={k}
                onPress={() => press(k)}
                onLongPress={k === 'back' ? () => onChange(applyKey(value, 'clear', exponent)) : undefined}
                accessibilityRole="button"
                accessibilityLabel={label(k)}
                accessibilityHint={k === 'back' ? t('keypad.clearHint') : undefined}
                testID={`key-${k === '.' ? 'dot' : k === 'back' ? 'back' : k}`}
                style={({ pressed }) => [
                  styles.key,
                  { backgroundColor: pressed ? p.border : op ? p.surfaceAlt : p.surface, borderColor: p.border },
                ]}
              >
                <Text variant="title" tone={op ? 'primary' : 'default'} style={{ fontWeight: '500' }}>
                  {k === 'back' ? '⌫' : k}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  key: {
    flex: 1,
    minHeight: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
