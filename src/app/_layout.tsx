import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getLocales } from 'expo-localization';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DatabaseKeyError, destroyAppDatabase, EncryptionUnavailableError, openAppDatabase } from '@/db/expoDb';
import { bootstrapDatabase } from '@/db/seed/bootstrap';
import { LockGate } from '@/features/security/LockGate';
import { useSettings } from '@/features/settings/hooks';
import { englishCategoryName, initI18n, pickLanguage } from '@/i18n';
import { initMonitoring } from '@/monitoring';
import { useSession } from '@/stores/session';
import { SnackbarHost } from '@/ui/feedback';
import { TestModeBanner } from '@/ui/TestModeBanner';
import { Button } from '@/ui/primitives';
import { Text } from '@/ui/Text';
import { spacing, useIsDark, usePalette } from '@/ui/theme';

void initMonitoring();
initI18n(pickLanguage(getLocales().map((l) => l.languageCode)));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, networkMode: 'always' }, mutations: { networkMode: 'always' } },
});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <TestModeBanner />
          <View style={{ flex: 1 }}>
            <DatabaseGate />
          </View>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function DatabaseGate() {
  const { status, errorKind, epoch, setReady, setError, reset } = useSession();
  const [attempt, setAttempt] = useState(0);
  const p = usePalette();
  const { t } = useTranslation();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await openAppDatabase();
        const ctx = await bootstrapDatabase(db, englishCategoryName);
        if (!cancelled) setReady(ctx);
      } catch (e) {
        if (!cancelled) setError(e instanceof EncryptionUnavailableError ? 'encryption' : e instanceof DatabaseKeyError ? 'key' : 'other');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, epoch, setReady, setError]);

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={p.primary} />
      </View>
    );
  }
  if (status === 'error') {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.lg }}>
        <Text variant="title" align="center">
          {t('errors.dbTitle')}
        </Text>
        <Text tone="muted" align="center">
          {errorKind === 'encryption' ? t('errors.noEncryption') : errorKind === 'key' ? t('errors.dbKey') : t('errors.dbOther')}
        </Text>
        <Button label={t('common.tryAgain')} onPress={() => setAttempt((a) => a + 1)} />
        {/* Erasing can't fix a build without SQLCipher, so don't offer it. */}
        {errorKind === 'encryption' ? null : <Button
          kind="danger"
          label={t('errors.resetApp')}
          onPress={() =>
            Alert.alert(t('errors.resetApp'), t('errors.resetConfirm'), [
              { text: t('common.cancel'), style: 'cancel' },
              {
                text: t('errors.resetApp'),
                style: 'destructive',
                onPress: async () => {
                  await destroyAppDatabase();
                  reset();
                },
              },
            ])
          }
        />}
      </View>
    );
  }
  return <AppShell />;
}

function AppShell() {
  const { data: settings } = useSettings();
  const isDark = useIsDark();
  const p = usePalette();
  const { t } = useTranslation();

  useEffect(() => {
    if (settings) initI18n(settings.language);
  }, [settings]);

  if (!settings) return <View style={{ flex: 1, backgroundColor: p.bg }} />;

  return (
    <LockGate>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: p.bg },
          headerTintColor: p.primary,
          headerTitleStyle: { color: p.text },
          contentStyle: { backgroundColor: p.bg },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="add-transaction" options={{ presentation: 'modal', title: t('add.title') }} />
        <Stack.Screen name="transaction/[id]" options={{ title: t('detail.title') }} />
        <Stack.Screen name="accounts/[id]" options={{ title: t('accounts.title') }} />
        <Stack.Screen name="accounts/edit" options={{ presentation: 'modal', title: t('accounts.edit') }} />
        <Stack.Screen name="categories/index" options={{ title: t('categories.title') }} />
        <Stack.Screen name="categories/edit" options={{ presentation: 'modal', title: t('categories.edit') }} />
        <Stack.Screen name="settings/index" options={{ title: t('settings.title') }} />
        <Stack.Screen name="settings/security" options={{ title: t('security.title') }} />
      </Stack>
      <SnackbarHost />
    </LockGate>
  );
}
