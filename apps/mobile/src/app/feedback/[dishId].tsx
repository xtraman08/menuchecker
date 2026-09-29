import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { useRestaurant, useSendFeedback } from '@/api/hooks';
import type { FeedbackInput } from '@/api/types';
import { Button, Chip, ErrorText, Screen, Section } from '@/components/ui';
import { sourceLabel } from '@/lib/dish';
import { color, radius, space, type } from '@/theme';

export default function Feedback() {
  const { dishId = '', restaurantId = '' } = useLocalSearchParams<{ dishId: string; restaurantId: string }>();
  const detail = useRestaurant(restaurantId);
  const send = useSendFeedback(restaurantId);
  const [accurate, setAccurate] = useState<boolean | undefined>();
  const [liked, setLiked] = useState<boolean | undefined>();
  const [tastesLike, setTastesLike] = useState('');

  const dish = detail.data?.dishes.find((d) => d.id === dishId);

  if (detail.isPending) {
    return (
      <Screen testID="feedback-screen">
        <ActivityIndicator color={color.ink} />
      </Screen>
    );
  }
  if (!dish) {
    return (
      <Screen testID="feedback-screen">
        <ErrorText testID="feedback-error">
          {detail.isError ? errorMessage(detail.error) : "This dish couldn't be found."}
        </ErrorText>
      </Screen>
    );
  }

  const input: FeedbackInput = {
    ...(accurate !== undefined ? { accurate } : {}),
    ...(liked !== undefined ? { liked } : {}),
    ...(tastesLike.trim() ? { tastesLike: tastesLike.trim() } : {}),
  };
  const empty = Object.keys(input).length === 0;

  if (send.isSuccess) {
    return (
      <Screen testID="feedback-screen">
        <Text style={type.title} testID="feedback-success">
          Thanks, your feedback is saved
        </Text>
        <Text style={type.body}>
          It helps correct {dish.nativeName}'s description for the next diner and tunes your matches.
        </Text>
        <Button label="Back to the menu" onPress={() => router.back()} testID="feedback-done" />
      </Screen>
    );
  }

  return (
    <Screen testID="feedback-screen">
      <View style={styles.summary}>
        <Text style={type.dishName} testID="feedback-dish-name">
          {dish.nativeName}
        </Text>
        <Text style={type.anchor}>{dish.anchor}</Text>
        <Text style={type.small}>{sourceLabel(dish.source)}</Text>
      </View>

      <Section title="Was the description accurate?">
        <View style={styles.row}>
          <Chip label="Yes, spot on" selected={accurate === true} onPress={() => setAccurate(true)} testID="feedback-accurate-yes" />
          <Chip label="Not really" selected={accurate === false} onPress={() => setAccurate(false)} testID="feedback-accurate-no" />
        </View>
      </Section>

      <Section title="It tastes like…" hint="Optional. A dish or flavour you'd compare it to.">
        <TextInput
          value={tastesLike}
          onChangeText={setTastesLike}
          placeholder="e.g. a spicier chilli con carne"
          placeholderTextColor={color.muted}
          accessibilityLabel="It tastes like"
          maxLength={200}
          style={styles.input}
          testID="feedback-tastes-like"
        />
      </Section>

      <Section title="Tried it?" hint="Tell us if you'd order it again. This shapes your match scores.">
        <View style={styles.row}>
          <Chip label="Liked it" selected={liked === true} onPress={() => setLiked(true)} testID="feedback-liked-yes" />
          <Chip label="Not for me" selected={liked === false} onPress={() => setLiked(false)} testID="feedback-liked-no" />
        </View>
      </Section>

      {send.isError ? <ErrorText testID="feedback-error">{errorMessage(send.error)}</ErrorText> : null}
      <Button
        label="Send feedback"
        disabled={empty}
        loading={send.isPending}
        onPress={() => send.mutate({ dishId: dish.id, input })}
        testID="feedback-submit"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { gap: space.sm, backgroundColor: color.card, padding: space.lg, borderRadius: radius.lg },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.sm,
    backgroundColor: color.card,
    paddingHorizontal: space.md,
    fontSize: 16,
    color: color.ink,
  },
});
