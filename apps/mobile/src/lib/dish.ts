import type { DishCard, DishSource, MatchState } from '@/api/types';

export const SPICE_WORDS = ['No heat', 'Mild', 'Medium', 'Hot'] as const;
export const ADVENTURE_WORDS = { 1: 'Familiar', 2: 'A little new', 3: 'Adventurous' } as const;

export function spiceWord(spice: number): string {
  return SPICE_WORDS[clamp(Math.round(spice), 0, 3)]!;
}

export function adventureWord(level: number): string {
  return ADVENTURE_WORDS[clamp(Math.round(level), 1, 3) as 1 | 2 | 3];
}

export function sourceLabel(source: DishSource): string {
  switch (source) {
    case 'ai_generated':
      return 'AI-written, not yet confirmed by diners';
    case 'diner_refined':
      return 'Refined by diners';
    case 'restaurant_verified':
      return 'Verified by the restaurant';
  }
}

export function matchStateLabel(state: MatchState): string {
  switch (state) {
    case 'unrated':
      return 'Still learning your taste';
    case 'preliminary':
      return 'Early estimate';
    case 'confident':
      return 'Based on solid feedback';
  }
}

export function matchWord(score: number): string {
  if (score >= 80) return 'Strong match';
  if (score >= 60) return 'Good match';
  if (score >= 40) return 'Might suit you';
  if (score > 0) return 'Probably not for you';
  return "Doesn't fit your diet";
}

/**
 * CLAUDE.md §2.1: a match score may only be shown next to the comprehension content.
 * A dish with no anchor/description gets the unrated treatment even if a score exists.
 */
export function hasComprehension(d: Pick<DishCard, 'anchor' | 'description'>): boolean {
  return d.anchor.trim().length > 0 && d.description.trim().length > 0;
}

export function shouldShowScore(d: DishCard): boolean {
  return d.matchState !== 'unrated' && d.matchScore !== null && hasComprehension(d);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
}

export const DIETARY_CAVEAT = 'Dietary info is AI-generated — verify with the restaurant';

const DIETARY_WORDS =
  /\b(vegan|vegetarian|pescatarian|gluten|dairy|lactose|nuts?|peanuts?|shellfish|halal|kosher|pork|beef|allerg\w*|celiac|coeliac|diet\w*)\b/i;

/** Heuristic: does this free text (note / match explanation) make a dietary claim? */
export function mentionsDiet(text: string | null | undefined): boolean {
  return !!text && DIETARY_WORDS.test(text);
}
