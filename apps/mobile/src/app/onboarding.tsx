import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { useSaveTasteProfile } from '@/api/hooks';
import type { TasteProfile } from '@/api/types';
import { emptyProfile, TasteProfileForm } from '@/components/TasteProfileForm';
import { Button, ErrorText, Heading, Screen } from '@/components/ui';
import { useAppState } from '@/state/AppState';
import { color, space, type } from '@/theme';

export default function Onboarding() {
  const { setOnboarded } = useAppState();
  const [profile, setProfile] = useState<TasteProfile>(emptyProfile);
  const save = useSaveTasteProfile();

  const finish = () => {
    setOnboarded();
    router.replace('/library');
  };

  return (
    <Screen
      testID="onboarding-screen"
      footer={
        <View style={styles.footer}>
          {save.isError ? <ErrorText testID="onboarding-error">{errorMessage(save.error)}</ErrorText> : null}
          <View style={styles.footerRow}>
            <Button label="Skip for now" variant="quiet" onPress={finish} testID="onboarding-skip" />
            <Button
              label="Save and continue"
              onPress={() => save.mutate(profile, { onSuccess: finish })}
              loading={save.isPending}
              testID="onboarding-save"
              style={{ flex: 1 }}
            />
          </View>
        </View>
      }
    >
      <View style={{ gap: space.sm }}>
        <Heading testID="onboarding-title">A few questions so menus make sense to you</Heading>
        <Text style={type.body}>
          Every dish is explained whether or not you answer. Your answers let Fare start estimating which dishes
          you'll like. You can change them any time.
        </Text>
      </View>
      <TasteProfileForm value={profile} onChange={setProfile} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: {
    borderTopWidth: 1,
    borderTopColor: color.line,
    backgroundColor: color.card,
    padding: space.lg,
    gap: space.sm,
  },
  footerRow: { flexDirection: 'row', gap: space.md, alignItems: 'center', maxWidth: 640, width: '100%', alignSelf: 'center' },
});
