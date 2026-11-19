import { Pressable, View } from 'react-native';
import Svg, { Circle, G, Rect } from 'react-native-svg';
import { Text } from './Text';
import { CHART_COLORS, spacing, usePalette } from './theme';

export interface DonutSlice {
  key: string;
  value: number;
  color?: string;
}

/**
 * Donut chart drawn with stroke-dasharray arcs. Colours default to the colour-blind-safe
 * Okabe–Ito palette; the caller always renders a text legend with percentages too.
 */
export function DonutChart({
  slices,
  size = 160,
  thickness = 22,
  accessibilityLabel,
  centerLabel,
  centerValue,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  accessibilityLabel: string;
  centerLabel?: string;
  centerValue?: string;
}) {
  const p = usePalette();
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  let offset = 0;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={p.surfaceAlt} strokeWidth={thickness} fill="none" />
          {total > 0 &&
            slices.map((s, i) => {
              const len = (Math.max(0, s.value) / total) * c;
              const gap = slices.length > 1 ? Math.min(2, len / 4) : 0;
              const el = (
                <Circle
                  key={s.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  stroke={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={thickness}
                  strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
                  strokeDashoffset={-offset}
                  fill="none"
                />
              );
              offset += len;
              return el;
            })}
        </G>
      </Svg>
      {centerValue ? (
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', padding: thickness }}>
          {centerLabel ? (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {centerLabel}
            </Text>
          ) : null}
          <Text variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit>
            {centerValue}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export interface Bar {
  key: string;
  value: number;
  label?: string;
  highlight?: boolean;
}

/** Simple vertical bar chart (e.g. daily spending). Each bar is tappable for drill-down. */
export function BarChart({
  bars,
  height = 140,
  accessibilityLabel,
  onPressBar,
  barAccessibilityLabel,
}: {
  bars: Bar[];
  height?: number;
  accessibilityLabel: string;
  onPressBar?: (key: string) => void;
  barAccessibilityLabel?: (b: Bar) => string;
}) {
  const p = usePalette();
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <View accessibilityLabel={accessibilityLabel} style={{ gap: spacing.xs }}>
      <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
        {bars.map((b) => {
          const h = b.value > 0 ? Math.max(3, (b.value / max) * height) : 2;
          return (
            <Pressable
              key={b.key}
              style={{ flex: 1, height, justifyContent: 'flex-end' }}
              onPress={onPressBar ? () => onPressBar(b.key) : undefined}
              disabled={!onPressBar}
              accessibilityRole={onPressBar ? 'button' : undefined}
              accessibilityLabel={barAccessibilityLabel?.(b)}
            >
              <Svg height={h} width="100%">
                <Rect x="10%" width="80%" height={h} rx={2} fill={b.highlight ? p.primary : b.value > 0 ? CHART_COLORS[0] : p.surfaceAlt} />
              </Svg>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {[bars[0], bars[Math.floor(bars.length / 2)], bars[bars.length - 1]].filter(Boolean).map((b, i) => (
          <Text key={`${b.key}-${i}`} variant="caption" tone="muted">
            {b.label ?? ''}
          </Text>
        ))}
      </View>
    </View>
  );
}
