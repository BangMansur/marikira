import { useColorScheme } from 'react-native';
import { useSettingsValue } from '@/features/settings/hooks';

/**
 * Calm palette. Status colours are reserved for status:
 * green = good, amber = caution, red = over. Normal spending is plain text, never red.
 */
export interface Palette {
  bg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  onPrimary: string;
  good: string;
  caution: string;
  over: string;
  goodBg: string;
  cautionBg: string;
  overBg: string;
  overlay: string;
  skeleton: string;
}

const light: Palette = {
  bg: '#F5F7F4',
  surface: '#FFFFFF',
  surfaceAlt: '#ECF1ED',
  text: '#16211C',
  textMuted: '#55655D',
  border: '#D9E1DC',
  primary: '#0B7A5C',
  onPrimary: '#FFFFFF',
  good: '#1B7F4E',
  caution: '#9A5B00',
  over: '#B3261E',
  goodBg: '#E3F4EA',
  cautionBg: '#FFF1D6',
  overBg: '#FCE4E1',
  overlay: 'rgba(0,0,0,0.4)',
  skeleton: '#E3E8E4',
};

const dark: Palette = {
  bg: '#0E1412',
  surface: '#171F1C',
  surfaceAlt: '#212B27',
  text: '#E7EEEA',
  textMuted: '#9DADA5',
  border: '#2B3631',
  primary: '#43C99D',
  onPrimary: '#0E1412',
  good: '#5ED39A',
  caution: '#F2B84B',
  over: '#FF8A7A',
  goodBg: '#183326',
  cautionBg: '#3A2D12',
  overBg: '#3D1C18',
  overlay: 'rgba(0,0,0,0.6)',
  skeleton: '#26302C',
};

/**
 * Okabe–Ito palette: distinguishable with the common forms of colour blindness.
 * Charts always pair colour with a text label and percentage as well.
 */
export const CHART_COLORS = ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9', '#D55E00', '#F0E442', '#999999'];

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export function usePalette(): Palette {
  const system = useColorScheme();
  const pref = useSettingsValue('theme');
  const mode = pref === 'system' || !pref ? (system === 'dark' ? 'dark' : 'light') : pref;
  return mode === 'dark' ? dark : light;
}

export function useIsDark(): boolean {
  return usePalette() === dark;
}

export const palettes = { light, dark };
