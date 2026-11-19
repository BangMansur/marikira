import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View, type DimensionValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSnackbar } from '@/stores/snackbar';
import { Text } from './Text';
import { radius, spacing, usePalette } from './theme';

/** Shimmer-free skeleton block (respects reduced motion by not animating). */
export function Skeleton({ width = '100%', height = 16 }: { width?: DimensionValue; height?: number }) {
  const p = usePalette();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width, height, borderRadius: radius.sm, backgroundColor: p.skeleton }}
    />
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  const p = usePalette();
  return (
    <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }]}>
      <Skeleton width="40%" height={14} />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === 0 ? '70%' : '100%'} height={i === 0 ? 28 : 14} />
      ))}
    </View>
  );
}

/** Global snackbar with optional action (used for Undo). Auto-hides after 5 s. */
export function SnackbarHost() {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { current, dismiss } = useSnackbar();
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!current) return;
    Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    const timer = setTimeout(dismiss, 5000);
    return () => clearTimeout(timer);
  }, [current, dismiss, opacity]);

  if (!current) return null;
  return (
    <Animated.View
      style={[styles.snackbar, { opacity, bottom: insets.bottom + 90, backgroundColor: p.text }]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      testID="snackbar"
    >
      <Text style={{ color: p.bg, flex: 1 }}>{current.text}</Text>
      {current.actionLabel ? (
        <Pressable
          onPress={() => {
            current.onAction?.();
            dismiss();
          }}
          accessibilityRole="button"
          hitSlop={12}
          testID="snackbar-action"
        >
          <Text variant="bodyStrong" style={{ color: p.bg, textDecorationLine: 'underline' }}>
            {current.actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, borderWidth: StyleSheet.hairlineWidth },
  snackbar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    borderRadius: radius.md,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    elevation: 6,
  },
});
