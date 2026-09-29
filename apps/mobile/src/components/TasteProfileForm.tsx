import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { DIETARY_LABELS, DIETARY_RESTRICTIONS } from '@fare/shared';

import type { TasteProfile } from '@/api/types';
import { SPICE_WORDS } from '@/lib/dish';
import { color, radius, space, type } from '@/theme';
import { Button, Chip, Section } from './ui';

export const DIETARY_OPTIONS = DIETARY_RESTRICTIONS;

export const CUISINE_OPTIONS = [
  'Ethiopian',
  'Turkish',
  'Indian',
  'Mexican',
  'Chinese',
  'French',
  'Italian',
  'Japanese',
  'Thai',
  'Korean',
  'Vietnamese',
  'Lebanese',
];

export const emptyProfile: TasteProfile = {
  dietaryRestrictions: [],
  spiceTolerance: 1,
  avoidedIngredients: [],
  favoriteIngredients: [],
  cuisinesTried: [],
};

export const slug = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '-');

function toggle<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function TasteProfileForm({
  value,
  onChange,
}: {
  value: TasteProfile;
  onChange: (p: TasteProfile) => void;
}) {
  const set = <K extends keyof TasteProfile>(k: K, v: TasteProfile[K]) =>
    onChange({ ...value, [k]: v });
  const customCuisines = value.cuisinesTried.filter((c) => !CUISINE_OPTIONS.includes(c));

  return (
    <View style={{ gap: space.xl }}>
      <Section title="How much heat do you enjoy?">
        <View style={styles.wrap}>
          {SPICE_WORDS.map((w, i) => (
            <Chip
              key={w}
              label={w}
              selected={value.spiceTolerance === i}
              onPress={() => set('spiceTolerance', i)}
              testID={`profile-spice-${i}`}
            />
          ))}
        </View>
      </Section>

      <Section
        title="Anything you don't eat?"
        hint="Used to flag dishes that don't fit. Always confirm allergens with the restaurant."
      >
        <View style={styles.wrap}>
          {DIETARY_OPTIONS.map((d) => (
            <Chip
              key={d}
              label={DIETARY_LABELS[d]}
              selected={value.dietaryRestrictions.includes(d)}
              onPress={() => set('dietaryRestrictions', toggle(value.dietaryRestrictions, d))}
              testID={`profile-diet-${d}`}
            />
          ))}
        </View>
      </Section>

      <TagInput
        title="Ingredients you love"
        hint="For example: lamb, lentils, coriander."
        idPrefix="profile-fav"
        values={value.favoriteIngredients}
        onChange={(v) => set('favoriteIngredients', v)}
      />

      <TagInput
        title="Ingredients you'd rather avoid"
        hint="For example: offal, coriander, anchovies."
        idPrefix="profile-avoid"
        values={value.avoidedIngredients}
        onChange={(v) => set('avoidedIngredients', v)}
      />

      <Section title="Cuisines you already know" hint="Menus from these get a lighter card.">
        <View style={styles.wrap}>
          {[...CUISINE_OPTIONS, ...customCuisines].map((c) => (
            <Chip
              key={c}
              label={c}
              selected={value.cuisinesTried.includes(c)}
              onPress={() => set('cuisinesTried', toggle(value.cuisinesTried, c))}
              testID={`profile-cuisine-${slug(c)}`}
            />
          ))}
        </View>
      </Section>
    </View>
  );
}

function TagInput({
  title,
  hint,
  idPrefix,
  values,
  onChange,
}: {
  title: string;
  hint: string;
  idPrefix: string;
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim().toLowerCase();
    if (v && !values.includes(v) && values.length < 30) onChange([...values, v]);
    setDraft('');
  };
  return (
    <Section title={title} hint={hint}>
      <View style={styles.inputRow}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          placeholder="Type an ingredient"
          placeholderTextColor={color.muted}
          accessibilityLabel={title}
          returnKeyType="done"
          maxLength={60}
          style={styles.input}
          testID={`${idPrefix}-input`}
        />
        <Button label="Add" variant="secondary" onPress={add} testID={`${idPrefix}-add`} />
      </View>
      {values.length ? (
        <View style={styles.wrap}>
          {values.map((v) => (
            <Pressable
              key={v}
              onPress={() => onChange(values.filter((x) => x !== v))}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${v}`}
              style={styles.tag}
              testID={`${idPrefix}-remove-${slug(v)}`}
            >
              <Text style={type.label}>{v}</Text>
              <Text style={type.small}>Remove</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  inputRow: { flexDirection: 'row', gap: space.sm },
  input: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.sm,
    backgroundColor: color.card,
    paddingHorizontal: space.md,
    fontSize: 16,
    color: color.ink,
  },
  tag: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    paddingHorizontal: space.md,
    minHeight: 36,
    borderRadius: radius.pill,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.line,
  },
});
