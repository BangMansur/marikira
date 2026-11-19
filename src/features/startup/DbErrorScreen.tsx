import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, View } from 'react-native';
import { describeError, diagnosticsEnabled } from '@/diagnostics';
import { Button } from '@/ui/primitives';
import { Text } from '@/ui/Text';
import { radius, spacing, usePalette } from '@/ui/theme';

export type DbErrorKind = 'key' | 'encryption' | 'other';

/** Shown when the database can't be opened. Error details appear only in Expo Go test mode + __DEV__. */
export function DbErrorScreen({
  kind,
  error,
  onRetry,
  onReset,
}: {
  kind: DbErrorKind;
  error: unknown;
  onRetry: () => void;
  onReset: () => void;
}) {
  const p = usePalette();
  const { t } = useTranslation();
  const showDetails = diagnosticsEnabled();
  const details = showDetails ? describeError(error) : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: p.bg }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg }}
      testID="db-error"
    >
      <Text variant="title" align="center">
        {t('errors.dbTitle')}
      </Text>
      <Text tone="muted" align="center">
        {kind === 'encryption' ? t('errors.noEncryption') : kind === 'key' ? t('errors.dbKey') : t('errors.dbOther')}
      </Text>
      {details ? (
        <View
          testID="db-error-details"
          style={{ backgroundColor: p.surfaceAlt, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm }}
        >
          <Text variant="label" tone="caution">
            {t('testMode.diagnosticsTitle')}
          </Text>
          <Text selectable variant="bodyStrong" testID="db-error-message">
            {details.name}: {details.message}
          </Text>
          <Text selectable variant="caption" testID="db-error-code">
            {t('testMode.errorCode')}: {details.code ?? '—'}
          </Text>
          <Text selectable variant="caption" style={{ fontFamily: 'Courier' }} testID="db-error-stack">
            {details.stack ?? t('testMode.noStack')}
          </Text>
        </View>
      ) : null}
      <Button label={t('common.tryAgain')} onPress={onRetry} testID="db-error-retry" />
      {/* Erasing can't fix a build without SQLCipher, so don't offer it. */}
      {kind === 'encryption' ? null : (
        <Button
          kind="danger"
          label={t('errors.resetApp')}
          testID="db-error-reset"
          onPress={() =>
            Alert.alert(t('errors.resetApp'), t('errors.resetConfirm'), [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('errors.resetApp'), style: 'destructive', onPress: onReset },
            ])
          }
        />
      )}
    </ScrollView>
  );
}
