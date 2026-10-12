import { useState, type ReactNode } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { DIETARY_LABELS } from '@fare/shared';

import type { DishCard as Dish } from '@/api/types';
import { adventureWord, DIETARY_CAVEAT, mentionsDiet, sourceLabel, spiceWord } from '@/lib/dish';
import { color, radius, space, type } from '@/theme';
import { MatchIndicator } from './MatchIndicator';
import { Button } from './ui';

export type CardVariant = 'familiar' | 'unfamiliar';

/**
 * The atomic dish card. Order is fixed by CLAUDE.md §3:
 * photo + native name + price → anchor → description → spice / texture / adventurousness
 * → note → match indicator → add-to-order.
 *
 * `unfamiliar` (default for cuisines the diner hasn't tried): large photo, full description,
 * match indicator kept secondary. `familiar`: thumbnail photo, shorter description, and the
 * match score carries more visual weight. Neither variant removes comprehension content.
 */
export function DishCard({
  dish,
  variant = 'unfamiliar',
  inOrder = 0,
  onAdd,
  onFeedback,
}: {
  dish: Dish;
  variant?: CardVariant;
  inOrder?: number;
  onAdd?: () => void;
  onFeedback?: () => void;
}) {
  const id = dish.id;
  const familiar = variant === 'familiar';

  const header = (
    <View style={styles.titleRow}>
      <Text
        style={[familiar ? type.dishNameCompact : type.dishName, { flex: 1 }]}
        testID={`dish-card-name-${id}`}
        accessibilityRole="header"
      >
        {dish.nativeName}
      </Text>
      {dish.price ? (
        <Text style={styles.price} testID={`dish-card-price-${id}`}>
          {dish.price}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={styles.card} testID={`dish-card-${id}`}>
      {familiar ? (
        <View style={styles.compactTop} testID={`dish-card-compact-${id}`}>
          <DishPhoto dish={dish} size="thumb" />
          <View style={{ flex: 1 }}>{header}</View>
        </View>
      ) : (
        <>
          <DishPhoto dish={dish} size="hero" />
          <View style={styles.padded}>{header}</View>
        </>
      )}

      <View style={[styles.padded, styles.body]}>
        <View style={styles.anchor}>
          <Text style={type.anchor} testID={`dish-card-anchor-${id}`}>
            {dish.anchor}
          </Text>
        </View>

        <Text
          style={type.body}
          numberOfLines={familiar ? 2 : undefined}
          testID={`dish-card-description-${id}`}
        >
          {dish.description}
        </Text>

        <View style={styles.signals}>
          <Signal label="Spice" testID={`dish-card-spice-${id}`}>
            <SpicePips spice={dish.spice} />
            <Text style={styles.signalValue}>{spiceWord(dish.spice)}</Text>
          </Signal>
          {dish.texture ? (
            <Signal label="Texture" testID={`dish-card-texture-${id}`}>
              <Text style={styles.signalValue}>{dish.texture}</Text>
            </Signal>
          ) : null}
          <Signal label="How new" testID={`dish-card-adventurousness-${id}`}>
            <Text style={styles.signalValue}>{adventureWord(dish.adventurousness)}</Text>
          </Signal>
        </View>

        <DietNote dish={dish} />

        <Provenance dish={dish} />

        <MatchIndicator dish={dish} emphasis={familiar ? 'prominent' : 'secondary'} />

        {onAdd || onFeedback ? (
          <View style={styles.actions}>
            {onAdd ? (
              <Button
                testID={`dish-card-add-${id}`}
                label={inOrder > 0 ? `Add another (${inOrder})` : 'Add to order'}
                onPress={onAdd}
                style={{ flex: 1 }}
              />
            ) : null}
            {onFeedback ? (
              <Button
                testID={`dish-card-feedback-${id}`}
                label="Rate this dish"
                variant="secondary"
                onPress={onFeedback}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** Note plus AI-derived dietary tags, with the verify-with-restaurant caveat (CLAUDE.md §11). */
function DietNote({ dish }: { dish: Dish }) {
  const id = dish.id;
  const tags = dish.dietaryTags ?? [];
  if (!dish.note && tags.length === 0) return null;
  const caveat =
    tags.length > 0 || (dish.source !== 'restaurant_verified' && mentionsDiet(dish.note));
  return (
    <View style={styles.note}>
      {dish.note ? (
        <Text style={styles.noteText} testID={`dish-card-note-${id}`}>
          {dish.note}
        </Text>
      ) : null}
      {tags.length ? (
        <View style={styles.tags} testID={`dish-card-diet-tags-${id}`}>
          <Text style={type.small}>Marked as</Text>
          {tags.map((t) => (
            <Text key={t} style={styles.tag}>
              {DIETARY_LABELS[t]}
            </Text>
          ))}
        </View>
      ) : null}
      {caveat ? (
        <Text style={styles.caveat} testID={`dish-card-note-caveat-${id}`}>
          {DIETARY_CAVEAT}
        </Text>
      ) : null}
    </View>
  );
}

function DishPhoto({ dish, size }: { dish: Dish; size: 'hero' | 'thumb' }) {
  const [failed, setFailed] = useState(false);
  const boxStyle = size === 'hero' ? styles.hero : styles.thumb;
  if (!dish.photoUrl || failed) {
    return (
      <View
        style={[boxStyle, styles.placeholder]}
        testID={`dish-card-photo-placeholder-${dish.id}`}
        accessible
        accessibilityLabel={`No photo of ${dish.nativeName} yet`}
      >
        <Text style={styles.placeholderInitial}>
          {dish.nativeName.trim().charAt(0).toUpperCase()}
        </Text>
        {size === 'hero' ? <Text style={type.small}>No photo yet</Text> : null}
      </View>
    );
  }
  return (
    <Image
      source={{ uri: dish.photoUrl }}
      style={boxStyle}
      resizeMode="cover"
      onError={() => setFailed(true)}
      testID={`dish-card-photo-${dish.id}`}
      accessibilityLabel={`Photo of ${dish.nativeName}`}
    />
  );
}

function SpicePips({ spice }: { spice: number }) {
  return (
    <View
      style={styles.pips}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {[1, 2, 3].map((i) => (
        <View key={i} style={[styles.pip, i <= spice && styles.pipOn]} />
      ))}
    </View>
  );
}

function Signal({
  label,
  testID,
  children,
}: {
  label: string;
  testID: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.signal} testID={testID}>
      <Text style={type.small}>{label}</Text>
      <View style={styles.signalBody}>{children}</View>
    </View>
  );
}

function Provenance({ dish }: { dish: Dish }) {
  const id = dish.id;
  const ai = dish.source === 'ai_generated';
  const votes = dish.feedbackUp + dish.feedbackDown;
  return (
    <View style={styles.provenance}>
      <Text
        style={[styles.sourceTag, ai ? styles.sourceAi : styles.sourceHuman]}
        testID={`dish-card-source-${id}`}
      >
        {sourceLabel(dish.source)}
      </Text>
      {dish.confidence === 'low' ? (
        <Text style={type.small} testID={`dish-card-low-confidence-${id}`}>
          We're less sure about this description. Check with staff if it matters.
        </Text>
      ) : null}
      {votes > 0 ? (
        <Text style={type.small} testID={`dish-card-feedback-counts-${id}`}>
          {dish.feedbackUp} {dish.feedbackUp === 1 ? 'diner' : 'diners'} found this accurate,{' '}
          {dish.feedbackDown} didn't
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.card,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: color.line,
  },
  padded: { paddingHorizontal: space.lg },
  body: { paddingBottom: space.lg, gap: space.md },
  compactTop: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.lg,
    paddingBottom: 0,
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.md,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  price: { fontSize: 17, fontWeight: '600', color: color.ink, fontVariant: ['tabular-nums'] },
  hero: { width: '100%', aspectRatio: 16 / 9, backgroundColor: color.placeholder },
  thumb: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: color.placeholder },
  placeholder: { alignItems: 'center', justifyContent: 'center', gap: space.xs },
  placeholderInitial: { fontFamily: 'Georgia', fontSize: 34, color: color.muted },
  anchor: { borderLeftWidth: 3, borderLeftColor: color.ink, paddingLeft: space.md },
  signals: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  signal: { gap: 2, minWidth: 90 },
  signalBody: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  signalValue: { fontSize: 14, color: color.ink, fontWeight: '500' },
  pips: { flexDirection: 'row', gap: 3 },
  pip: { width: 9, height: 9, borderRadius: 5, borderWidth: 1.5, borderColor: color.chili },
  pipOn: { backgroundColor: color.chili },
  note: { backgroundColor: color.paper, borderRadius: radius.sm, padding: space.sm, gap: space.xs },
  noteText: { fontSize: 14, lineHeight: 20, color: color.ink },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs },
  tag: {
    fontSize: 12,
    fontWeight: '600',
    color: color.ink,
    backgroundColor: color.card,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  caveat: { fontSize: 12, lineHeight: 16, color: color.ochre, fontWeight: '600' },
  provenance: { gap: space.xs, alignItems: 'flex-start' },
  sourceTag: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  sourceAi: { backgroundColor: color.ochreSoft, color: color.ochre },
  sourceHuman: { backgroundColor: color.tealSoft, color: color.teal },
  actions: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
});
