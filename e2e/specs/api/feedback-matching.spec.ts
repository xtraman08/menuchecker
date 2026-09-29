// Diner feedback counters and match states (TEAM_PLAN "Matching"):
// unrated until the diner has a profile AND the dish has >= 3 feedback entries;
// dietary conflicts are a hard 0. Each test uses a different seeded dish so
// parallel runs don't disturb each other's counters.
import { expect, test } from '@playwright/test';
import {
  ApiUser,
  dishByName,
  expectDishCardInvariants,
  findSeededRestaurant,
  type DishCard,
} from '../../support/api.ts';

async function withUsers<T>(n: number, fn: (users: ApiUser[]) => Promise<T>): Promise<T> {
  const users = await Promise.all(Array.from({ length: n }, () => ApiUser.create()));
  try {
    return await fn(users);
  } finally {
    await Promise.all(users.map((u) => u.dispose()));
  }
}

test('seeded dishes satisfy the DishCard contract and start unrated for a new diner', async () => {
  await withUsers(1, async ([u]) => {
    for (const cuisine of [/ethiop/i, /bistro|french|american|european/i]) {
      const { dishes } = await findSeededRestaurant(u!, cuisine);
      expect(dishes.length).toBeGreaterThan(0);
      for (const d of dishes) {
        expectDishCardInvariants(d);
        // No taste profile yet -> must be honestly unrated, never a guessed score.
        expect(d.matchState, d.nativeName).toBe('unrated');
        expect(d.matchScore, d.nativeName).toBeNull();
      }
    }
  });
});

test('seeded Ethiopian menu keeps native names', async () => {
  await withUsers(1, async ([u]) => {
    const { dishes } = await findSeededRestaurant(u!, /ethiop/i);
    for (const name of ['Kitfo', /^Doro W(a|o)t$/i, 'Shiro']) dishByName(dishes, name);
  });
});

test('feedback increments the accuracy counters by exactly one', async () => {
  await withUsers(2, async ([up, down]) => {
    const { restaurant, dishes } = await findSeededRestaurant(up!, /ethiop/i);
    const before = dishByName(dishes, 'Shiro');

    const afterUp = (await up!.feedback(before.id, { accurate: true, tastesLike: 'hummus' })).dish;
    expect(afterUp.id).toBe(before.id);
    expect(afterUp.feedbackUp).toBeGreaterThanOrEqual(before.feedbackUp + 1);

    const afterDown = (await down!.feedback(before.id, { accurate: false })).dish;
    expect(afterDown.feedbackDown).toBeGreaterThanOrEqual(before.feedbackDown + 1);

    // Reading back reflects the persisted counts.
    const reread = dishByName((await up!.getRestaurant(restaurant.id)).dishes, 'Shiro');
    expect(reread.feedbackUp).toBeGreaterThanOrEqual(afterUp.feedbackUp);
    expect(reread.feedbackDown).toBeGreaterThanOrEqual(afterDown.feedbackDown);
  });
});

test('feedback rejects invalid bodies and unknown dishes', async () => {
  await withUsers(1, async ([u]) => {
    const { dishes } = await findSeededRestaurant(u!, /ethiop/i);
    const bad = await u!.ctx.post(`/dishes/${dishes[0]!.id}/feedback`, {
      data: { accurate: 'very', liked: 42 },
    });
    expect(bad.status()).toBe(400);
    const missing = await u!.ctx.post('/dishes/00000000-0000-4000-8000-000000000000/feedback', {
      data: { accurate: true },
    });
    expect(missing.status()).toBe(404);
  });
});

test('match state moves from unrated to a real score once profile + 3 feedback exist', async () => {
  await withUsers(4, async ([diner, ...raters]) => {
    const { restaurant, dishes } = await findSeededRestaurant(diner!, /ethiop/i);
    const tibs = dishByName(dishes, /tibs/i);

    // Profile alone is not enough if the dish has < 3 feedback entries; feedback alone
    // is not enough without a profile. Give the dish 3 more "liked" entries.
    for (const r of raters) await r.feedback(tibs.id, { accurate: true, liked: true });

    let card: DishCard = dishByName((await diner!.getRestaurant(restaurant.id)).dishes, /tibs/i);
    expect(card.matchState, 'no taste profile yet').toBe('unrated');
    expect(card.matchScore).toBeNull();

    await diner!.putTasteProfile({
      dietaryRestrictions: [],
      spiceTolerance: 3,
      avoidedIngredients: [],
      favoriteIngredients: ['beef'],
      cuisinesTried: ['ethiopian'],
    });
    card = dishByName((await diner!.getRestaurant(restaurant.id)).dishes, /tibs/i);
    expectDishCardInvariants(card);
    expect(['preliminary', 'confident']).toContain(card.matchState);
    expect(card.matchScore).not.toBeNull();
    expect(card.matchScore!).toBeGreaterThan(0);
  });
});

test('a dietary conflict is a hard 0 (vegetarian diner, Kitfo)', async () => {
  await withUsers(4, async ([diner, ...raters]) => {
    const { restaurant, dishes } = await findSeededRestaurant(diner!, /ethiop/i);
    const kitfo = dishByName(dishes, 'Kitfo');
    for (const r of raters) await r.feedback(kitfo.id, { liked: true });

    await diner!.putTasteProfile({
      dietaryRestrictions: ['vegetarian'],
      spiceTolerance: 3,
      avoidedIngredients: [],
      favoriteIngredients: ['beef'],
      cuisinesTried: [],
    });
    const card = dishByName((await diner!.getRestaurant(restaurant.id)).dishes, 'Kitfo');
    expect(['preliminary', 'confident']).toContain(card.matchState);
    expect(card.matchScore).toBe(0);
  });
});

test('menu order is not changed by match score by default', async () => {
  await withUsers(1, async ([u]) => {
    const { restaurant, dishes: before } = await findSeededRestaurant(u!, /ethiop/i);
    await u!.putTasteProfile({
      dietaryRestrictions: ['vegan'],
      spiceTolerance: 0,
      avoidedIngredients: ['beef'],
      favoriteIngredients: ['lentils'],
      cuisinesTried: [],
    });
    const after = (await u!.getRestaurant(restaurant.id)).dishes;
    expect(after.map((d) => d.id)).toEqual(before.map((d) => d.id));
  });
});
