import { StyleSheet, Text, View } from 'react-native';

import type { DishCard } from '@/api/types';
import { matchStateLabel, matchWord, shouldShowScore } from '@/lib/dish';
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
        {dish.matchExplanation ? (
          <Text style={type.small} testID={`dish-card-match-reason-${id}`}>
            {dish.matchExplanation}
          </Text>
        ) : null}
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
      {dish.matchExplanation ? (
        <Text style={type.small} testID={`dish-card-match-reason-${id}`}>
          {dish.matchExplanation}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.md, padding: space.md, gap: space.sm },
  unrated: { borderWidth: 1, borderStyle: 'dashed', borderColor: color.muted, backgroundColor: color.paper },
  scored: { backgroundColor: color.tealSoft },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  score: { fontSize: 20, fontWeight: '700', color: color.teal, minWidth: 32, fontVariant: ['tabular-nums'] },
  scoreProminent: { fontSize: 30 },
  track: { height: 6, borderRadius: 3, backgroundColor: color.card, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: color.teal },
});
