import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAppState } from '@/state/AppState';
import { color } from '@/theme';

export default function Index() {
  const { onboarded } = useAppState();
  if (onboarded === null) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: color.paper,
        }}
      >
        <ActivityIndicator color={color.ink} testID="app-loading" />
      </View>
    );
  }
  return <Redirect href={onboarded ? '/library' : '/onboarding'} />;
}
