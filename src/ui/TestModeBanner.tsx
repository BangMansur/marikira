import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isExpoGoTestMode } from '@/runtime';
import { Text } from './Text';
import { spacing, usePalette } from './theme';

/**
 * Permanent warning shown on every screen in Expo Go test mode (including the lock screen).
 * It can't be dismissed. Renders nothing in real builds.
 */
export function TestModeBanner() {
  const { t } = useTranslation();
  const p = usePalette();
  const insets = useSafeAreaInsets();
  if (!isExpoGoTestMode()) return null;
  return (
    <View
      testID="test-mode-banner"
      accessibilityRole="alert"
      style={{ backgroundColor: p.cautionBg, paddingTop: insets.top + spacing.xs, paddingBottom: spacing.xs, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: p.caution }}
    >
      <Text variant="caption" tone="caution" align="center" style={{ fontWeight: '700' }}>
        ⚠️ {t('testMode.banner')}
      </Text>
    </View>
  );
}
