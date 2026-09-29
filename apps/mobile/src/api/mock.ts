// In-memory stand-in for the Fare API, used when EXPO_PUBLIC_API_URL is unset or
// EXPO_PUBLIC_API_MOCK=1. Behaviour follows docs/TEAM_PLAN.md closely enough to develop
// screens against; it is not a spec for the real matching engine.
import type { Api } from './client';
import type { DishCard, Restaurant, RestaurantSummary, TasteProfile } from './types';

type MockDish = DishCard & { restaurantId: string; ingredients: string[] };

const MOCK_USER = '00000000-0000-0000-0000-000000000001';
const EPOCH = '2026-09-01T00:00:00.000Z';

const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));

function dish(
  restaurantId: string,
  id: string,
  d: Partial<MockDish> & Pick<DishCard, 'nativeName' | 'anchor' | 'description'>,
): MockDish {
  return {
    id,
    restaurantId,
    photoUrl: null,
    spice: 0,
    texture: '',
    adventurousness: 1,
    note: null,
    price: null,
    source: 'ai_generated',
    confidence: 'high',
    matchScore: null,
    matchState: 'unrated',
    matchExplanation: null,
    matchExplanationKind: null,
    feedbackUp: 0,
    feedbackDown: 0,
    ingredients: [],
    dietaryTags: [],
    ...d,
  };
}

function seed() {
  const restaurants: Restaurant[] = [
    {
      id: 'r-habesha',
      name: 'Habesha Kitchen',
      address: '12 Market St',
      cuisine: 'Ethiopian',
      createdBy: MOCK_USER,
      createdAt: EPOCH,
    },
    {
      id: 'r-bistro',
      name: 'Le Petit Bistro',
      address: '4 Rue Road',
      cuisine: 'French',
      createdBy: MOCK_USER,
      createdAt: EPOCH,
    },
  ];
  const dishes: MockDish[] = [
    dish('r-habesha', 'd-kitfo', {
      nativeName: 'Kitfo',
      price: '$18',
      anchor: 'Similar to steak tartare — finely minced raw beef warmed in spiced butter',
      description:
        'Lean beef minced by hand, tossed in niter kibbeh (clarified butter with herbs) and mitmita chili powder. Served with ayib, a mild fresh cheese, and injera.',
      spice: 2,
      texture: 'Soft, silky, rich',
      adventurousness: 3,
      note: 'Ask for it "leb leb" (lightly warmed) or fully cooked if raw isn\'t your thing.',
      ingredients: ['beef', 'butter', 'chili', 'cheese'],
      feedbackUp: 4,
      feedbackDown: 1,
    }),
    dish('r-habesha', 'd-doro', {
      nativeName: 'Doro Wat',
      price: '$16',
      anchor: 'Similar to a slow-cooked chicken curry — deep red, onion-rich stew',
      description:
        'Chicken legs and a hard-boiled egg simmered for hours in onions cooked down with berbere spice and butter. Eaten by tearing off injera and scooping.',
      spice: 3,
      texture: 'Saucy, fall-apart',
      adventurousness: 2,
      ingredients: ['chicken', 'egg', 'onion', 'berbere', 'butter'],
      feedbackUp: 2,
      feedbackDown: 0,
    }),
    dish('r-habesha', 'd-shiro', {
      nativeName: 'Shiro',
      price: '$13',
      anchor: 'Similar to a thick, smooth dal — creamy ground-chickpea stew',
      description:
        'Chickpea and broad-bean flour simmered with garlic, onion and gentle spice until velvety. Served on injera.',
      spice: 1,
      texture: 'Smooth, thick',
      adventurousness: 1,
      note: 'Vegan',
      ingredients: ['chickpea', 'garlic', 'onion'],
      dietaryTags: ['vegan', 'vegetarian'],
    }),
    dish('r-habesha', 'd-tibs', {
      nativeName: 'Tibs',
      price: '$17',
      anchor: 'Similar to a stir-fry — sautéed cubes of beef with onion and pepper',
      description: 'Beef pieces seared with onion, rosemary, jalapeño and butter.',
      spice: 1,
      texture: 'Tender, slightly charred',
      adventurousness: 1,
      confidence: 'low',
      ingredients: ['beef', 'onion', 'pepper', 'rosemary'],
    }),
    dish('r-bistro', 'd-steak-frites', {
      nativeName: 'Steak frites',
      price: '$26',
      anchor: 'Similar to steak and chips — pan-seared steak with thin fries',
      description: 'Sirloin cooked to order with a shallot butter sauce and hand-cut fries.',
      texture: 'Juicy, crisp fries',
      source: 'restaurant_verified',
      ingredients: ['beef', 'potato', 'butter'],
      feedbackUp: 12,
      feedbackDown: 1,
    }),
    dish('r-bistro', 'd-soupe', {
      nativeName: "Soupe à l'oignon",
      price: '$11',
      anchor: 'Similar to a French onion soup — because it is one: onion broth under melted cheese',
      description: 'Caramelised onions in beef broth, topped with a toasted crouton and gruyère.',
      texture: 'Brothy, gooey top',
      source: 'diner_refined',
      ingredients: ['onion', 'beef broth', 'cheese', 'bread'],
      feedbackUp: 3,
      feedbackDown: 0,
    }),
  ];
  return { restaurants, dishes };
}

const DIET_CONFLICTS: Record<string, string[]> = {
  vegetarian: ['beef', 'chicken', 'lamb', 'pork', 'fish', 'beef broth'],
  vegan: ['beef', 'chicken', 'lamb', 'pork', 'fish', 'egg', 'butter', 'cheese', 'beef broth'],
};

function computeMatch(
  d: MockDish,
  profile: TasteProfile | null,
): Pick<DishCard, 'matchScore' | 'matchState' | 'matchExplanation' | 'matchExplanationKind'> {
  const volume = d.feedbackUp + d.feedbackDown;
  if (!profile || volume < 3)
    return {
      matchScore: null,
      matchState: 'unrated',
      matchExplanation: null,
      matchExplanationKind: null,
    };
  const state = volume >= 10 ? 'confident' : 'preliminary';
  for (const r of profile.dietaryRestrictions) {
    const hit = d.ingredients.find((i) => DIET_CONFLICTS[r.toLowerCase()]?.includes(i));
    if (hit)
      return {
        matchScore: 0,
        matchState: state,
        matchExplanation: `Contains ${hit}, which doesn't fit ${r}`,
        matchExplanationKind: 'dietary',
      };
  }
  const spiceFit = 1 - Math.max(0, d.spice - profile.spiceTolerance) / 3;
  const fav = d.ingredients.filter((i) => profile.favoriteIngredients.includes(i)).length;
  const avoid = d.ingredients.filter((i) => profile.avoidedIngredients.includes(i)).length;
  const overlap = Math.min(1, Math.max(0, 0.5 + 0.25 * fav - 0.35 * avoid));
  const liked = d.feedbackUp / volume;
  return {
    matchScore: Math.round(100 * (0.35 * spiceFit + 0.35 * overlap + 0.3 * liked)),
    matchState: state,
    matchExplanation: null,
    matchExplanationKind: null,
  };
}

export function createMockApi(): Api {
  const db = seed();
  let profile: TasteProfile | null = null;
  let n = 0;

  const card = (d: MockDish): DishCard => {
    const { restaurantId: _r, ingredients: _i, ...rest } = d;
    return { ...rest, ...computeMatch(d, profile) };
  };
  const findRestaurant = (id: string) => {
    const r = db.restaurants.find((x) => x.id === id);
    if (!r) throw new Error('Restaurant not found');
    return r;
  };

  return {
    async listRestaurants(q) {
      await delay();
      const needle = q?.trim().toLowerCase();
      return db.restaurants
        .filter((r) => !needle || `${r.name} ${r.cuisine}`.toLowerCase().includes(needle))
        .map<RestaurantSummary>((r) => ({
          ...r,
          dishCount: db.dishes.filter((d) => d.restaurantId === r.id).length,
        }));
    },
    async getRestaurant(id) {
      await delay();
      return {
        restaurant: findRestaurant(id),
        dishes: db.dishes.filter((d) => d.restaurantId === id).map(card),
      };
    },
    async scanMenu() {
      await delay(1500);
      return {
        scanId: `scan-${++n}`,
        restaurantGuess: { name: 'Anatolia Grill', cuisine: 'Turkish' },
        dishes: [
          {
            tempId: 't1',
            nativeName: 'İskender Kebap',
            price: '$19',
            rawText: 'İskender Kebap 19',
            confidence: 'high',
          },
          {
            tempId: 't2',
            nativeName: 'Mantı',
            price: '$15',
            rawText: 'Mantı ........ 15',
            confidence: 'high',
          },
          {
            tempId: 't3',
            nativeName: 'Lahmac',
            price: null,
            rawText: 'Lahmac(un) 9?',
            confidence: 'low',
          },
        ],
      };
    },
    async createRestaurant(input) {
      await delay(1200);
      const restaurant: Restaurant = {
        id: `r-${++n}`,
        name: input.name,
        address: input.address ?? null,
        cuisine: input.cuisine,
        createdBy: MOCK_USER,
        createdAt: new Date().toISOString(),
      };
      db.restaurants.unshift(restaurant);
      const created = input.dishes.map((d, i) =>
        dish(restaurant.id, `${restaurant.id}-d${i}`, {
          nativeName: d.nativeName,
          price: d.price,
          anchor: `Similar to a dish you may know — ${d.nativeName} (mock decode)`,
          description:
            'Mock description: the real API asks Claude to explain ingredients and preparation.',
          texture: 'Varies',
          adventurousness: 2,
          confidence: 'low',
        }),
      );
      db.dishes.push(...created);
      return { restaurant, menuId: `m-${n}`, dishes: created.map(card) };
    },
    async sendFeedback(dishId, input) {
      await delay();
      const d = db.dishes.find((x) => x.id === dishId);
      if (!d) throw new Error('Dish not found');
      if (input.accurate === true) d.feedbackUp++;
      if (input.accurate === false) d.feedbackDown++;
      return { dish: card(d) };
    },
    async getTasteProfile() {
      await delay();
      return profile;
    },
    async putTasteProfile(p) {
      await delay();
      profile = p;
      return p;
    },
  };
}
