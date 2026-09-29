import { StyleSheet, Text, View } from 'react-native';

import type { DishCard } from '@/api/types';
import { DIETARY_CAVEAT, matchStateLabel, matchWord, shouldShowScore } from '@/lib/dish';
import { color, radius, space, type } from '@/theme';

export function MatchIndicator({ dish, emphasis }: { dish: DishCard; emphasis: 'secondary' | 'prominent' }) {
  const id = dish.id;

  if (!shouldShowScore(dish)) {
    return (
      <View style={[styles.box, styles.unrated]} testID={`dish-card-match-${id}`}>
        <Text style={type.label} testID={`dish-card-match-unrated-${id}`}>
          Still learning your taste
        </Text>
        <Text style={type.small}>
          No match score yet. It appears once you have a taste profile and a few diners have rated this dish.
        </Text>
          <Explanation dish={dish} />
      </View>
    );
  }

  const score = Math.round(dish.matchScore!);
  const prominent = emphasis === 'prominent';
  const preliminary = dish.matchState === 'preliminary';
  return (
    <View
      style={[styles.box, styles.scored]}
      testID={`dish-card-match-${id}`}
      accessible
      accessibilityLabel={`Match ${score} out of 100, ${matchWord(score)}. ${matchStateLabel(dish.matchState)}.`}
    >
      <View style={styles.row}>
        <Text
          style={[styles.score, prominent && styles.scoreProminent]}
          testID={`dish-card-match-score-${id}`}
        >
          {score}
        </Text>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={type.label}>{matchWord(score)}</Text>
          <Text style={type.small} testID={`dish-card-match-state-${id}`}>
            {matchStateLabel(dish.matchState)}
          </Text>
        </View>
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${Math.max(2, Math.min(100, score))}%` },
            preliminary && { backgroundColor: '#6FA7A1' },
          ]}
        />
      </View>
      <Explanation dish={dish} />
    </View>
  );
}

function Explanation({ dish }: { dish: DishCard }) {
  if (!dish.matchExplanation) return null;
  return (
    <View style={{ gap: 2 }}>
      <Text style={type.small} testID={`dish-card-match-reason-${dish.id}`}>
        {dish.matchExplanation}
      </Text>
      {dish.matchExplanationKind === 'dietary' ? (
        <Text style={styles.caveat} testID={`dish-card-match-caveat-${dish.id}`}>
          {DIETARY_CAVEAT}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caveat: { fontSize: 12, lineHeight: 16, color: color.ochre, fontWeight: '600' },
  box: { borderRadius: radius.md, padding: space.md, gap: space.sm },
  unrated: { borderWidth: 1, borderStyle: 'dashed', borderColor: color.muted, backgroundColor: color.paper },
  scored: { backgroundColor: color.tealSoft },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  score: { fontSize: 20, fontWeight: '700', color: color.teal, minWidth: 32, fontVariant: ['tabular-nums'] },
  scoreProminent: { fontSize: 30 },
  track: { height: 6, borderRadius: 3, backgroundColor: color.card, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: color.teal },
});
