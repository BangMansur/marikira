import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { type Palette, usePalette } from './theme';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'caption' | 'label';
type Tone = 'default' | 'muted' | 'good' | 'caution' | 'over' | 'primary' | 'onPrimary';

const variants: Record<Variant, TextStyle> = {
  display: { fontSize: 34, fontWeight: '700', letterSpacing: -0.5 },
  title: { fontSize: 24, fontWeight: '700' },
  heading: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 16 },
  bodyStrong: { fontSize: 16, fontWeight: '600' },
  caption: { fontSize: 13 },
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase' },
};

function toneColor(p: Palette, tone: Tone): string {
  switch (tone) {
    case 'muted':
      return p.textMuted;
    case 'good':
      return p.good;
    case 'caution':
      return p.caution;
    case 'over':
      return p.over;
    case 'primary':
      return p.primary;
    case 'onPrimary':
      return p.onPrimary;
    default:
      return p.text;
  }
}

export interface AppTextProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
  align?: TextStyle['textAlign'];
  tabular?: boolean;
}

/** Text that respects the user's system font size (allowFontScaling stays on), capped to keep layouts intact. */
export function Text({ variant = 'body', tone = 'default', align, tabular, style, ...rest }: AppTextProps) {
  const p = usePalette();
  return (
    <RNText
      maxFontSizeMultiplier={1.8}
      {...rest}
      style={[
        variants[variant],
        { color: toneColor(p, tone), textAlign: align },
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
    />
  );
}
