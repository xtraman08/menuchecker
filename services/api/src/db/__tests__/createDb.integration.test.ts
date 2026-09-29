import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seed } from '../../../../../db/scripts/seed.mjs';
import { createDb, type Db } from '../createDb.js';
import { ADMIN_URL, createTestDb, type TestDb } from './testDb.js';

const ETHIOPIAN = '11111111-1111-4111-8111-111111111111';
const KITFO = '11111111-0000-4000-8000-000000000101';
const DORO_WAT = '11111111-0000-4000-8000-000000000102';

describe.skipIf(!ADMIN_URL)('createDb (DbPort over real Postgres + seed)', () => {
  let testDb: TestDb;
  let db: Db;

  beforeAll(async () => {
    testDb = await createTestDb();
    await seed({ connectionString: testDb.ownerUrl, log: () => {} });
    db = createDb(testDb.appUrl, testDb.app);
  });
  afterAll(async () => {
    await testDb?.drop();
  });

  it('pings and creates anonymous users', async () => {
    expect(await db.ping()).toBe(true);
    expect(await db.createAnonymousUser()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('serves the seeded shared library to a brand-new diner', async () => {
    const user = await db.createAnonymousUser();
    const list = await db.withUserTx(user, (tx) => tx.listRestaurants());
    expect(list.map((r) => [r.name, r.dishCount])).toEqual(
      expect.arrayContaining([
        ['Selam Ethiopian Kitchen', 8],
        ['Le Petit Coin', 6],
      ]),
    );
    expect(typeof list[0]!.createdAt).toBe('string');

    const dishes = await db.withUserTx(user, (tx) => tx.listDishesForRestaurant(ETHIOPIAN));
    expect(dishes[0]).toMatchObject({
      id: KITFO,
      nativeName: 'Kitfo',
      spice: 2,
      adventurousness: 3,
    });
    expect(dishes[0]).not.toHaveProperty('menuId');

    const stats = await db.withUserTx(user, (tx) => tx.feedbackStats([KITFO, DORO_WAT]));
    expect(stats.get(KITFO)).toMatchObject({ entries: 0 });
    expect(stats.get(DORO_WAT)).toMatchObject({ entries: 10, likedUp: 8, likedDown: 2 });
  });

  it('round-trips a scan: restaurant, menu, decoded dishes, feedback, profile, matches', async () => {
    const user = await db.createAnonymousUser();
    const other = await db.createAnonymousUser();
    const { restaurantId, dishId } = await db.withUserTx(user, async (tx) => {
      const r = await tx.createRestaurant({ name: 'Anatolia', address: null, cuisine: 'Turkish' });
      const m = await tx.createMenu(r.id, 'scan');
      const [d] = await tx.createDishes(m.id, [
        {
          nativeName: 'İskender kebap',
          price: '$21',
          rawText: 'Iskender ... 21',
          anchor: 'Similar to a doner plate — sliced lamb over bread with tomato sauce and yogurt',
          description:
            'Thin slices of spit-roasted meat over pide bread, with tomato butter sauce and yogurt.',
          spice: 1,
          texture: 'Tender, saucy',
          adventurousness: 1,
          note: null,
          ingredients: ['lamb', 'pide', 'yogurt', 'tomato', 'butter'],
          dietaryTags: ['no_pork'],
          confidence: 'high',
        },
      ]);
      return { restaurantId: r.id, dishId: d!.id };
    });

    const seen = await db.withUserTx(other, (tx) => tx.getDish(dishId));
    expect(seen).toMatchObject({
      nativeName: 'İskender kebap',
      dietaryTags: ['no_pork'],
      source: 'ai_generated',
    });

    await db.withUserTx(other, (tx) => tx.upsertFeedback({ dishId, accurate: true, liked: false }));
    expect(await db.withUserTx(other, (tx) => tx.ownLiked([dishId]))).toEqual(
      new Map([[dishId, false]]),
    );
    expect(await db.withUserTx(user, (tx) => tx.ownLiked([dishId]))).toEqual(new Map());
    expect(await db.withUserTx(user, (tx) => tx.getDish(dishId))).toMatchObject({ feedbackUp: 1 });

    const profile = {
      dietaryRestrictions: [],
      spiceTolerance: 1,
      avoidedIngredients: [],
      favoriteIngredients: ['lamb'],
      cuisinesTried: ['Turkish'],
    };
    expect(await db.withUserTx(user, (tx) => tx.upsertTasteProfile(profile))).toEqual(profile);
    expect(await db.withUserTx(user, (tx) => tx.getTasteProfile())).toEqual(profile);

    const match = { dishId, matchScore: null, matchState: 'unrated' as const, explanation: null };
    await db.withUserTx(user, (tx) => tx.upsertMatches([match]));
    expect(await db.withUserTx(user, (tx) => tx.getMatches([dishId]))).toEqual(
      new Map([[dishId, match]]),
    );
    expect(await db.withUserTx(other, (tx) => tx.getMatches([dishId]))).toEqual(new Map());
    expect(await db.withUserTx(other, (tx) => tx.getRestaurant(restaurantId))).toMatchObject({
      createdBy: user,
    });
  });
});
