import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { usePalette } from '@/ui/theme';

type IconName = keyof typeof Ionicons.glyphMap;

export default function TabsLayout() {
  const p = usePalette();
  const { t } = useTranslation();
  const icon = (name: IconName) =>
    function TabIcon({ color, size }: { color: unknown; size: number }) {
      return <Ionicons name={name} color={color as string} size={size} />;
    };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: p.primary,
        tabBarInactiveTintColor: p.textMuted,
        tabBarStyle: { backgroundColor: p.surface, borderTopColor: p.border },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.home'), tabBarIcon: icon('home-outline'), tabBarButtonTestID: 'tab-home' }} />
      <Tabs.Screen
        name="transactions"
        options={{ title: t('tabs.transactions'), tabBarIcon: icon('list-outline'), tabBarButtonTestID: 'tab-transactions' }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: '',
          tabBarAccessibilityLabel: t('tabs.add'),
          tabBarButton: () => (
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Pressable
                onPress={() => router.push('/add-transaction')}
                accessibilityRole="button"
                accessibilityLabel={t('tabs.add')}
                testID="fab-add"
                style={({ pressed }) => ({
                  width: 60,
                  height: 60,
                  marginTop: -18,
                  borderRadius: 30,
                  backgroundColor: p.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.85 : 1,
                  elevation: 4,
                  shadowColor: '#000',
                  shadowOpacity: 0.2,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 3 },
                })}
              >
                <Ionicons name="add" size={34} color={p.onPrimary} />
              </Pressable>
            </View>
          ),
        }}
      />
      <Tabs.Screen name="plan" options={{ title: t('tabs.plan'), tabBarIcon: icon('wallet-outline'), tabBarButtonTestID: 'tab-plan' }} />
      <Tabs.Screen
        name="reports"
        options={{ title: t('tabs.reports'), tabBarIcon: icon('pie-chart-outline'), tabBarButtonTestID: 'tab-reports' }}
      />
    </Tabs>
  );
}
