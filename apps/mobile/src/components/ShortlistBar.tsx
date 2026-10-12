import { StyleSheet, Text, View } from 'react-native';

import { summarize, type ShortlistLine } from '@/state/shortlist';
import { color, space, type } from '@/theme';
import { Button } from './ui';

export function ShortlistBar({ lines, onClear }: { lines: ShortlistLine[]; onClear: () => void }) {
  const s = summarize(lines);
  if (s.count === 0) {
    return (
      <View style={styles.bar} testID="shortlist-bar">
        <Text style={type.small} testID="shortlist-count">
          Your order is empty. Add dishes to keep a running total.
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.bar} testID="shortlist-bar">
      <View style={{ flex: 1 }}>
        <Text style={styles.total} testID="shortlist-total">
          {s.unpriced === s.count ? 'Total unknown' : s.label}
        </Text>
        <Text style={type.small} testID="shortlist-count">
          {s.count} {s.count === 1 ? 'dish' : 'dishes'} in your order
          {s.unpriced ? `, ${s.unpriced} without a listed price` : ''}
        </Text>
      </View>
      <Button label="Clear" variant="secondary" onPress={onClear} testID="shortlist-clear" />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: color.card,
    borderTopWidth: 1,
    borderTopColor: color.line,
  },
  total: { fontSize: 22, fontWeight: '700', color: color.ink, fontVariant: ['tabular-nums'] },
});
