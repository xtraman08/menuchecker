import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { useSaveTasteProfile, useTasteProfile } from '@/api/hooks';
import type { TasteProfile } from '@/api/types';
import { emptyProfile, TasteProfileForm } from '@/components/TasteProfileForm';
import { Button, ErrorText, Screen } from '@/components/ui';
import { color, space, type } from '@/theme';

export default function Profile() {
  const current = useTasteProfile();
  const save = useSaveTasteProfile();
  const [profile, setProfile] = useState<TasteProfile | null>(null);

  useEffect(() => {
    if (current.isSuccess && profile === null) setProfile(current.data ?? emptyProfile);
  }, [current.isSuccess, current.data, profile]);

  if (current.isError) {
    return (
      <Screen testID="profile-screen">
        <ErrorText testID="profile-error">{errorMessage(current.error)}</ErrorText>
        <Button label="Try again" onPress={() => current.refetch()} testID="profile-retry" />
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen testID="profile-screen">
        <ActivityIndicator color={color.ink} testID="profile-loading" />
      </Screen>
    );
  }

  return (
    <Screen
      testID="profile-screen"
      footer={
        <View style={styles.footer}>
          {save.isError ? <ErrorText testID="profile-save-error">{errorMessage(save.error)}</ErrorText> : null}
          {save.isSuccess ? (
            <Text style={type.small} testID="profile-saved">
              Saved. Match scores update with your new answers.
            </Text>
          ) : null}
          <Button
            label="Save profile"
            onPress={() => save.mutate(profile)}
            loading={save.isPending}
            testID="profile-save"
          />
        </View>
      }
    >
      {current.data === null ? (
        <Text style={type.body} testID="profile-empty">
          You haven't set up a taste profile yet. Until you do, every dish shows "Still learning your taste".
        </Text>
      ) : null}
      <TasteProfileForm
        value={profile}
        onChange={(p) => {
          setProfile(p);
          if (save.isSuccess) save.reset();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { borderTopWidth: 1, borderTopColor: color.line, backgroundColor: color.card, padding: space.lg, gap: space.sm },
});
