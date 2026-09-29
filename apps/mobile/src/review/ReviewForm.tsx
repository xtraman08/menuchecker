import { useReducer, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { CreateRestaurantInput, ParseConfidence, ScanResult } from '@/api/types';
import { Button, ErrorText, Field } from '@/components/ui';
import { color, radius, space, type } from '@/theme';
import {
  activeItems,
  badgeLabel,
  discardedItems,
  initReview,
  reviewReducer,
  saveBlocker,
  toReviewedDishes,
  type ReviewItem,
} from './reviewModel';

export function ReviewForm({
  draft,
  onSave,
  saving,
  saveError,
}: {
  draft: ScanResult | null;
  onSave: (input: CreateRestaurantInput) => void;
  saving: boolean;
  saveError: string | null;
}) {
  const [state, dispatch] = useReducer(reviewReducer, draft?.dishes ?? [], initReview);
  const [name, setName] = useState(draft?.restaurantGuess?.name ?? '');
  const [cuisine, setCuisine] = useState(draft?.restaurantGuess?.cuisine ?? '');
  const [address, setAddress] = useState('');
  const [triedSave, setTriedSave] = useState(false);

  const active = activeItems(state);
  const discarded = discardedItems(state);
  const blocker = saveBlocker(state, name, cuisine);
  const needsCheck = active.filter((i) => i.confidence === 'low').length;

  const save = () => {
    setTriedSave(true);
    if (blocker) return;
    onSave({
      name: name.trim(),
      cuisine: cuisine.trim(),
      ...(address.trim() ? { address: address.trim() } : {}),
      source: draft ? 'scan' : 'manual',
      dishes: toReviewedDishes(state),
    });
  };

  return (
    <View style={{ gap: space.xl }}>
      <View style={{ gap: space.sm }}>
        <Text style={type.title}>{draft ? 'Check what we read' : 'Add the dishes'}</Text>
        <Text style={type.body} testID="review-summary">
          {draft
            ? `${active.length} ${active.length === 1 ? 'dish' : 'dishes'} found${
                needsCheck ? `, ${needsCheck} to check` : ''
              }. Fix names and prices, discard anything that isn't a dish, then save.`
            : 'Type each dish name as printed on the menu. Fare explains them after you save.'}
        </Text>
      </View>

      <View style={{ gap: space.md }}>
        <Field
          label="Restaurant name"
          value={name}
          onChangeText={setName}
          maxLength={120}
          testID="review-restaurant-name"
        />
        <Field
          label="Cuisine"
          value={cuisine}
          onChangeText={setCuisine}
          placeholder="e.g. Ethiopian"
          maxLength={60}
          testID="review-restaurant-cuisine"
        />
        <Field
          label="Address (optional)"
          value={address}
          onChangeText={setAddress}
          maxLength={200}
          testID="review-restaurant-address"
        />
      </View>

      <View style={{ gap: space.md }} testID="review-list">
        {active.map((item) => (
          <ReviewRow
            key={item.tempId}
            item={item}
            onEdit={(field, value) => dispatch({ type: 'edit', tempId: item.tempId, field, value })}
            onDiscard={() => dispatch({ type: 'discard', tempId: item.tempId })}
          />
        ))}
        <Button
          label="Add a dish"
          variant="secondary"
          onPress={() => dispatch({ type: 'addManual' })}
          testID="review-add-manual"
        />
      </View>

      {discarded.length ? (
        <View style={{ gap: space.sm }} testID="review-discarded-list">
          <Text style={type.label}>Discarded</Text>
          {discarded.map((item) => (
            <View
              key={item.tempId}
              style={styles.discardedRow}
              testID={`review-discarded-${item.tempId}`}
            >
              <Text style={[type.body, { flex: 1, textDecorationLine: 'line-through' }]}>
                {item.nativeName || 'Unnamed dish'}
              </Text>
              <Button
                label="Restore"
                variant="quiet"
                onPress={() => dispatch({ type: 'restore', tempId: item.tempId })}
                testID={`review-restore-${item.tempId}`}
              />
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ gap: space.sm }}>
        {triedSave && blocker ? (
          <ErrorText testID="review-save-blocker">{blocker}</ErrorText>
        ) : null}
        {saveError ? <ErrorText testID="review-save-error">{saveError}</ErrorText> : null}
        {saving ? (
          <Text style={type.small} testID="review-saving">
            Saving and explaining {active.length} {active.length === 1 ? 'dish' : 'dishes'}. This
            can take up to a minute.
          </Text>
        ) : null}
        <Button label="Save menu" onPress={save} loading={saving} testID="review-save" />
      </View>
    </View>
  );
}

const BADGE_STYLE: Record<ParseConfidence, { bg: string; fg: string }> = {
  high: { bg: color.tealSoft, fg: color.teal },
  low: { bg: color.chiliSoft, fg: color.chili },
  manual: { bg: color.paper, fg: color.inkSoft },
};

function ReviewRow({
  item,
  onEdit,
  onDiscard,
}: {
  item: ReviewItem;
  onEdit: (field: 'nativeName' | 'price', value: string) => void;
  onDiscard: () => void;
}) {
  const id = item.tempId;
  const badge = BADGE_STYLE[item.confidence];
  return (
    <View
      style={[styles.row, item.confidence === 'low' && { borderColor: color.chili }]}
      testID={`review-item-${id}`}
    >
      <View style={styles.rowTop}>
        <Text
          style={[styles.badge, { backgroundColor: badge.bg, color: badge.fg }]}
          testID={`review-badge-${id}`}
        >
          {badgeLabel[item.confidence]}
        </Text>
        <Button
          label="Discard"
          variant="quiet"
          onPress={onDiscard}
          testID={`review-discard-${id}`}
        />
      </View>
      <View style={styles.inputs}>
        <TextInput
          value={item.nativeName}
          onChangeText={(v) => onEdit('nativeName', v)}
          placeholder="Dish name as printed"
          placeholderTextColor={color.muted}
          accessibilityLabel="Dish name"
          maxLength={120}
          style={[styles.input, { flex: 3 }]}
          testID={`review-name-${id}`}
        />
        <TextInput
          value={item.price}
          onChangeText={(v) => onEdit('price', v)}
          placeholder="Price"
          placeholderTextColor={color.muted}
          accessibilityLabel="Price"
          maxLength={32}
          style={[styles.input, { flex: 1 }]}
          testID={`review-price-${id}`}
        />
      </View>
      {item.rawText && item.confidence === 'low' ? (
        <Text style={type.small} testID={`review-raw-${id}`}>
          Read from the menu as: {item.rawText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: color.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.line,
    padding: space.md,
    gap: space.sm,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  inputs: { flexDirection: 'row', gap: space.sm },
  input: {
    minHeight: 44,
    minWidth: 0,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    fontSize: 16,
    color: color.ink,
    backgroundColor: color.card,
  },
  discardedRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
