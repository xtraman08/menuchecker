import { describe, expect, it } from 'vitest';
import {
  createRestaurantRequestSchema,
  decodedDishSchema,
  dishCardSchema,
  feedbackRequestSchema,
  MATCH_CONFIG,
  parsedDishSchema,
  tasteProfileSchema,
} from './index';

const card = {
  id: '6f1c1c9e-5b8a-4a51-9e0f-1d9b7a2b3c4d',
  nativeName: 'Kitfo',
  photoUrl: null,
  anchor: 'Similar to steak tartare — minced raw beef with spiced butter',
  description: 'Finely minced beef warmed in niter kibbeh and mitmita.',
  spice: 2,
  texture: 'Soft, buttery',
  adventurousness: 3,
  note: 'Ask for it cooked (leb leb) if raw is not your thing',
  price: '$18',
  source: 'ai_generated',
  confidence: 'high',
  matchScore: null,
  matchState: 'unrated',
  matchExplanation: null,
  feedbackUp: 0,
  feedbackDown: 0,
};

describe('shared schemas', () => {
  it('accepts a valid dish card', () => {
    expect(dishCardSchema.parse(card)).toEqual(card);
  });

  it('rejects out-of-range spice and adventurousness', () => {
    expect(dishCardSchema.safeParse({ ...card, spice: 4 }).success).toBe(false);
    expect(dishCardSchema.safeParse({ ...card, adventurousness: 0 }).success).toBe(false);
    expect(dishCardSchema.safeParse({ ...card, matchScore: 101 }).success).toBe(false);
  });

  it('rejects unknown source / match state', () => {
    expect(dishCardSchema.safeParse({ ...card, source: 'guessed' }).success).toBe(false);
    expect(dishCardSchema.safeParse({ ...card, matchState: 'maybe' }).success).toBe(false);
  });

  it('validates decoded dish output strictly and normalises ingredients', () => {
    const d = decodedDishSchema.parse({
      anchor: 'Similar to chili — spicy chicken stew',
      description: 'Chicken simmered in berbere and onions.',
      spice: 3,
      texture: 'Saucy, fall-apart',
      adventurousness: 2,
      note: null,
      ingredients: [' Chicken ', 'Berbere'],
      dietaryTags: ['gluten_free'],
    });
    expect(d.ingredients).toEqual(['chicken', 'berbere']);
    expect(decodedDishSchema.safeParse({ ...d, dietaryTags: ['paleo'] }).success).toBe(false);
    expect(decodedDishSchema.safeParse({ ...d, spice: 1.5 }).success).toBe(false);
    expect(decodedDishSchema.safeParse({ ...d, anchor: '' }).success).toBe(false);
  });

  it('parsed dish requires a known confidence', () => {
    const p = { tempId: 't1', nativeName: 'Shiro', price: null, rawText: 'Shiro ... 12', confidence: 'low' };
    expect(parsedDishSchema.parse(p)).toEqual(p);
    expect(parsedDishSchema.safeParse({ ...p, confidence: 'medium' }).success).toBe(false);
  });

  it('create restaurant request defaults source and dish confidence', () => {
    const r = createRestaurantRequestSchema.parse({
      name: 'Queen of Sheba',
      cuisine: 'Ethiopian',
      dishes: [{ nativeName: 'Tibs', price: '$15' }],
    });
    expect(r.source).toBe('scan');
    expect(r.dishes[0]?.confidence).toBe('manual');
    expect(createRestaurantRequestSchema.safeParse({ name: 'x', cuisine: 'y', dishes: [] }).success).toBe(false);
  });

  it('feedback requires at least one field', () => {
    expect(feedbackRequestSchema.safeParse({}).success).toBe(false);
    expect(feedbackRequestSchema.safeParse({ liked: false }).success).toBe(true);
  });

  it('taste profile validates spice tolerance and dietary vocabulary', () => {
    const p = {
      dietaryRestrictions: ['vegan'],
      spiceTolerance: 1,
      avoidedIngredients: [],
      favoriteIngredients: ['lentils'],
      cuisinesTried: ['Ethiopian'],
    };
    expect(tasteProfileSchema.parse(p)).toEqual(p);
    expect(tasteProfileSchema.safeParse({ ...p, spiceTolerance: 5 }).success).toBe(false);
    expect(tasteProfileSchema.safeParse({ ...p, dietaryRestrictions: ['carnivore'] }).success).toBe(false);
  });

  it('match weights sum to 1', () => {
    const w = MATCH_CONFIG.weights;
    expect(w.spice + w.ingredients + w.likedRate).toBeCloseTo(1);
  });
});
