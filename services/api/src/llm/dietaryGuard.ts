// Safety net for dietary tags. The prompt asks the model to tag conservatively;
// this drops any tag that its own ingredient list contradicts (e.g. gluten_free
// on a dish served with injera). It only ever removes tags: a missing tag makes
// matching cautious, a wrong one can hurt someone. Matching is deliberately
// broad ("butter" also hits "peanut butter"); false drops are the safe side.
import type { DietaryRestriction } from '@fare/shared';

const MEAT = ['beef', 'veal', 'steak', 'chicken', 'lamb', 'mutton', 'goat', 'pork', 'bacon', 'ham', 'lard', 'chorizo', 'sausage', 'duck', 'turkey', 'meat', 'tripe', 'liver', 'gelatin'];
const SEAFOOD = ['fish', 'salmon', 'tuna', 'cod', 'tilapia', 'anchovy', 'anchovies', 'sardine', 'sardines', 'shrimp', 'prawn', 'prawns', 'crab', 'lobster', 'mussel', 'mussels', 'clam', 'clams', 'oyster', 'oysters', 'scallop', 'scallops', 'squid', 'octopus', 'fish sauce'];
const DAIRY = ['milk', 'butter', 'ghee', 'niter kibbeh', 'kibbeh', 'cheese', 'ayib', 'paneer', 'yogurt', 'yoghurt', 'cream', 'labneh', 'kefir'];
const OTHER_ANIMAL = ['egg', 'eggs', 'honey'];
const GLUTEN = ['wheat', 'barley', 'rye', 'bread', 'breadcrumbs', 'injera', 'flour', 'pita', 'naan', 'chapati', 'roti', 'paratha', 'tortilla', 'couscous', 'bulgur', 'pasta', 'noodles', 'seitan', 'semolina', 'spelt', 'farro', 'malt', 'soy sauce', 'dumpling', 'dumplings', 'flatbread', 'kita', 'dabo'];
const NUTS = ['almond', 'almonds', 'cashew', 'cashews', 'walnut', 'walnuts', 'pistachio', 'pistachios', 'hazelnut', 'hazelnuts', 'pecan', 'pecans', 'peanut', 'peanuts', 'nut', 'nuts'];
const SHELLFISH = ['shrimp', 'prawn', 'prawns', 'crab', 'lobster', 'mussel', 'mussels', 'clam', 'clams', 'oyster', 'oysters', 'scallop', 'scallops', 'crayfish'];

/** Ingredients that contradict each tag. halal/kosher also depend on sourcing, so only pork is checked. */
const CONFLICTS: Record<DietaryRestriction, readonly string[]> = {
  vegan: [...MEAT, ...SEAFOOD, ...DAIRY, ...OTHER_ANIMAL],
  vegetarian: [...MEAT, ...SEAFOOD],
  pescatarian: MEAT,
  gluten_free: GLUTEN,
  dairy_free: DAIRY,
  nut_free: NUTS,
  shellfish_free: SHELLFISH,
  halal: ['pork', 'bacon', 'ham', 'lard', 'chorizo', 'wine', 'beer'],
  kosher: ['pork', 'bacon', 'ham', 'lard', 'chorizo', ...SHELLFISH],
  no_pork: ['pork', 'bacon', 'ham', 'lard', 'chorizo', 'prosciutto', 'pancetta'],
  no_beef: ['beef', 'veal', 'steak', 'tripe'],
};

/**
 * A word right before a term that makes it plant-based / gluten-free, e.g.
 * "coconut milk", "rice noodles", "chickpea flour". Injera is never exempt:
 * whether it contains wheat depends on the restaurant.
 */
const EXEMPT_BEFORE: Record<string, readonly string[]> = {
  milk: ['coconut', 'soy', 'oat', 'almond', 'cashew', 'rice', 'plant'],
  cream: ['coconut', 'soy', 'oat', 'cashew', 'plant'],
  butter: ['peanut', 'almond', 'cashew', 'nut', 'cocoa', 'shea', 'plant', 'vegan'],
  cheese: ['vegan', 'plant', 'cashew'],
  yogurt: ['coconut', 'soy', 'oat', 'plant'],
  flour: ['chickpea', 'rice', 'teff', 'corn', 'maize', 'cassava', 'potato', 'tapioca', 'almond', 'lentil', 'bean', 'pea', 'buckwheat', 'sorghum'],
  noodles: ['rice', 'glass', 'mung', 'buckwheat'],
  pasta: ['rice', 'chickpea', 'lentil'],
  tortilla: ['corn', 'maize'],
  bread: ['teff', 'corn', 'cassava'],
};

function mentions(ingredient: string, term: string): boolean {
  if (term.includes(' ')) return ingredient.includes(term);
  const words = ingredient.split(/[^\p{L}]+/u);
  return words.some((w, i) => w === term && !(i > 0 && EXEMPT_BEFORE[term]?.includes(words[i - 1]!)));
}

/** Returns the tags that survive plus the ones dropped (for logging). */
export function guardDietaryTags(
  tags: readonly DietaryRestriction[],
  ingredients: readonly string[],
): { tags: DietaryRestriction[]; dropped: DietaryRestriction[] } {
  const lower = ingredients.map((i) => i.toLowerCase());
  const kept: DietaryRestriction[] = [];
  const dropped: DietaryRestriction[] = [];
  for (const tag of new Set(tags)) {
    const conflict = CONFLICTS[tag].some((term) => lower.some((i) => mentions(i, term)));
    (conflict ? dropped : kept).push(tag);
  }
  return { tags: kept, dropped };
}
