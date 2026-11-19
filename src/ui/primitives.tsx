import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  ScrollView,
  type StyleProp,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { Text } from './Text';
import { radius, spacing, usePalette } from './theme';

export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  padded = true,
  testID,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  padded?: boolean;
  testID?: string;
}) {
  const p = usePalette();
  const inner = padded ? { padding: spacing.lg, gap: spacing.lg } : null;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }} edges={edges} testID={testID}>
      {scroll ? (
        <ScrollView contentContainerStyle={[inner, { paddingBottom: 120 }]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({
  children,
  onPress,
  style,
  accessibilityLabel,
  testID,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const p = usePalette();
  const base = [styles.card, { backgroundColor: p.surface, borderColor: p.border }, style];
  if (!onPress)
    return (
      <View style={base} testID={testID} accessibilityLabel={accessibilityLabel}>
        {children}
      </View>
    );
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [base, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}

type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  loading,
  icon,
  testID,
  accessibilityHint,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  testID?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const p = usePalette();
  const bg = kind === 'primary' ? p.primary : kind === 'danger' ? p.overBg : kind === 'secondary' ? p.surfaceAlt : 'transparent';
  const fg = kind === 'primary' ? 'onPrimary' : kind === 'danger' ? 'over' : 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      accessibilityHint={accessibilityHint}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={kind === 'primary' ? p.onPrimary : p.primary} /> : icon}
      <Text variant="bodyStrong" tone={fg}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
  testID,
  accessibilityLabel,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: string;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const p = usePalette();
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
      style={[
        styles.chip,
        { backgroundColor: selected ? p.primary : p.surfaceAlt, borderColor: selected ? p.primary : p.border },
      ]}
    >
      {icon ? <Text>{icon}</Text> : null}
      <Text variant="caption" tone={selected ? 'onPrimary' : 'default'} style={{ fontWeight: '600' }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Row({ children, gap = spacing.sm, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function ListRow({
  title,
  subtitle,
  left,
  right,
  onPress,
  testID,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string | null;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      testID={testID}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.listRow, { backgroundColor: pressed ? p.surfaceAlt : p.surface }]}
    >
      {left}
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

export function IconBubble({ icon, color, size = 40 }: { icon: string; color?: string | null; size?: number }) {
  const p = usePalette();
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: color ? color + '33' : p.surfaceAlt,
      }}
    >
      <Text style={{ fontSize: size * 0.48 }}>{icon}</Text>
    </View>
  );
}

export function TextField({ label, error, ...props }: TextInputProps & { label: string; error?: string | null }) {
  const p = usePalette();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <TextInput
        placeholderTextColor={p.textMuted}
        accessibilityLabel={label}
        maxFontSizeMultiplier={1.8}
        {...props}
        style={[
          styles.input,
          { color: p.text, backgroundColor: p.surface, borderColor: error ? p.over : p.border },
          props.style,
        ]}
      />
      {error ? (
        <Text variant="caption" tone="over" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  testIDPrefix,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  testIDPrefix?: string;
}) {
  const p = usePalette();
  return (
    <View style={[styles.segmented, { backgroundColor: p.surfaceAlt }]} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            testID={testIDPrefix ? `${testIDPrefix}-${o.value}` : undefined}
            style={[styles.segment, active && { backgroundColor: p.surface }]}
          >
            <Text variant="caption" tone={active ? 'primary' : 'muted'} style={{ fontWeight: '700' }} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: spacing.sm }}>
      <Text variant="label" tone="muted" accessibilityRole="header">
        {title}
      </Text>
      {action}
    </Row>
  );
}

export function Divider() {
  const p = usePalette();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: p.border }} />;
}

export function ProgressBar({
  fractionBps,
  tone = 'good',
  accessibilityLabel,
}: {
  fractionBps: number;
  tone?: 'good' | 'caution' | 'over' | 'primary';
  accessibilityLabel?: string;
}) {
  const p = usePalette();
  const pct = Math.max(0, Math.min(100, fractionBps / 100));
  const color = tone === 'primary' ? p.primary : p[tone];
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
      style={{ height: 8, borderRadius: radius.pill, backgroundColor: p.surfaceAlt, overflow: 'hidden' }}
    >
      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: radius.pill }} />
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  testID,
}: {
  icon: string;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}) {
  return (
    <View style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }} testID={testID}>
      <Text style={{ fontSize: 44 }} accessibilityElementsHidden importantForAccessibility="no">
        {icon}
      </Text>
      <Text variant="heading" align="center">
        {title}
      </Text>
      <Text tone="muted" align="center">
        {body}
      </Text>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} kind="secondary" /> : null}
    </View>
  );
}

export function PressableOpacity(props: PressableProps & { children: ReactNode }) {
  return <Pressable {...props} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }, props.style as ViewStyle]} />;
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: spacing.lg, borderWidth: StyleSheet.hairlineWidth, gap: spacing.sm },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, minHeight: 56 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 48, fontSize: 16 },
  segmented: { flexDirection: 'row', borderRadius: radius.md, padding: 4 },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
});
