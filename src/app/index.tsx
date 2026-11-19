import { Redirect } from 'expo-router';
import { useSettingsValue } from '@/features/settings/hooks';

export default function Index() {
  const done = useSettingsValue('onboardingDone');
  return <Redirect href={done ? '/(tabs)' : '/onboarding'} />;
}
