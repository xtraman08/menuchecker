import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  dishes,
  feedback,
  matches,
  menus,
  restaurants,
  tasteProfiles,
  users,
  withUserTx,
  type DishRow,
  type RestaurantRow,
} from '../index.js';
import { ADMIN_URL, createTestDb, type TestDb } from './testDb.js';

const PROFILE = {
  dietaryRestrictions: ['vegetarian' as const],
  spiceTolerance: 2,
  avoidedIngredients: ['cilantro'],
  favoriteIngredients: ['lentils'],
  cuisinesTried: ['Ethiopian'],
};

const DECODED = {
  anchor: 'Similar to red lentil dal — a spiced lentil stew',
  description: 'Red lentils simmered with berbere, onion and garlic.',
  spice: 2,
  texture: 'Thick, spoonable',
  adventurousness: 1,
  note: 'Vegan',
  ingredients: ['red lentils', 'berbere'],
  dietaryTags: ['vegan' as const, 'vegetarian' as const],
};

describe.skipIf(!ADMIN_URL)('row-level security (real Postgres, role fare_app)', () => {
  let db: TestDb;
  let pool: pg.Pool;
  let userA: string;
  let userB: string;
  let restaurant: RestaurantRow;
  let dish: DishRow;

  const asA = <T>(fn: Parameters<typeof withUserTx<T>>[1]) => withUserTx(userA, fn, pool);
  const asB = <T>(fn: Parameters<typeof withUserTx<T>>[1]) => withUserTx(userB, fn, pool);

  /** Runs raw SQL as fare_app with no app.user_id set. */
  async function anonymous<R extends pg.QueryResultRow>(sql: string, values?: unknown[]) {
    return (await pool.query<R>(sql, values)).rows;
  }

  beforeAll(async () => {
    db = await createTestDb();
    pool = db.app;
    userA = (await users.createAnonymous(pool)).id;
    userB = (await users.createAnonymous(pool)).id;
    ({ restaurant, dish } = await asA(async (tx) => {
      const r = await restaurants.create(tx, {
        name: 'Selam',
        cuisine: 'Ethiopian',
        address: null,
      });
      const m = await menus.create(tx, { restaurantId: r.id, source: 'scan' });
      const [d] = await dishes.createMany(tx, m.id, [
        { nativeName: 'Misir Wat', price: '$13', confidence: 'high' },
        { nativeName: 'Gomen', price: null },
      ]);
      return { restaurant: r, dish: d! };
    }));
  });

  afterAll(async () => {
    await db?.drop();
  });

  describe('default deny without app.user_id', () => {
    it.each([
      'users',
      'restaurants',
      'menus',
      'dishes',
      'dish_feedback',
      'taste_profiles',
      'dish_matches',
    ])('sees no rows in %s', async (table) => {
      expect(await anonymous(`select * from ${table}`)).toEqual([]);
    });

    it('cannot insert anything', async () => {
      await expect(
        anonymous(`insert into restaurants (name, cuisine, created_by) values ('x', 'y', $1)`, [
          userA,
        ]),
      ).rejects.toThrow(/row-level security/);
      await expect(anonymous(`insert into users default values`)).rejects.toThrow(
        /row-level security/,
      );
    });

    it('gets no aggregate stats', async () => {
      expect(
        await anonymous(`select * from dish_feedback_stats(array[$1]::uuid[])`, [dish.id]),
      ).toEqual([]);
    });

    it('treats an empty app.user_id as unset', async () => {
      const rows = await withUserTx(
        userA,
        async (tx) => {
          await tx.query(`select set_config('app.user_id', '', true)`);
          return (await tx.query('select * from restaurants')).rows;
        },
        pool,
      );
      expect(rows).toEqual([]);
    });

    it('does not leak app.user_id past the transaction', async () => {
      await asA((tx) => tx.query('select 1'));
      expect(await anonymous('select * from restaurants')).toEqual([]);
    });
  });

  describe('users', () => {
    it('a diner sees only their own user row', async () => {
      expect(await asA((tx) => users.get(tx, userA))).toMatchObject({ id: userA });
      expect(await asA((tx) => users.get(tx, userB))).toBeNull();
    });

    it('cannot create a user row for someone else', async () => {
      await expect(
        asA((tx) => tx.query('insert into users (id) values (gen_random_uuid())')),
      ).rejects.toThrow(/row-level security/);
    });
  });

  describe('shared library', () => {
    it('another diner can read restaurants, menus and dishes', async () => {
      const list = await asB((tx) => restaurants.list(tx));
      expect(list).toEqual([expect.objectContaining({ id: restaurant.id, dishCount: 2 })]);
      expect(await asB((tx) => restaurants.get(tx, restaurant.id))).toMatchObject({
        createdBy: userA,
      });
      const menu = await asB((tx) => dishes.listByRestaurant(tx, restaurant.id));
      expect(menu.map((d) => d.nativeName)).toEqual(['Misir Wat', 'Gomen']);
      expect(menu[0]).toMatchObject({
        matchState: 'unrated',
        matchScore: null,
        matchCached: false,
      });
    });

    it('search matches name or cuisine literally', async () => {
      expect(await asB((tx) => restaurants.list(tx, { q: 'ethiop' }))).toHaveLength(1);
      expect(await asB((tx) => restaurants.list(tx, { q: 'sel' }))).toHaveLength(1);
      expect(await asB((tx) => restaurants.list(tx, { q: '%' }))).toHaveLength(0);
    });

    it('cannot create a restaurant on behalf of another diner', async () => {
      await expect(
        asB((tx) =>
          tx.query(
            `insert into restaurants (name, cuisine, created_by) values ('Fake', 'Thai', $1)`,
            [userA],
          ),
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it("cannot add a menu to another diner's restaurant", async () => {
      await expect(
        asB((tx) => menus.create(tx, { restaurantId: restaurant.id, source: 'manual' })),
      ).rejects.toThrow(/row-level security/);
    });

    it("cannot add dishes to another diner's menu", async () => {
      await expect(
        asB((tx) => dishes.createMany(tx, dish.menuId, [{ nativeName: 'Injected', price: null }])),
      ).rejects.toThrow(/row-level security/);
    });

    it("cannot change another diner's dish or restaurant", async () => {
      expect(await asB((tx) => dishes.applyDecode(tx, dish.id, DECODED))).toBeNull();
      const res = await asB((tx) =>
        tx.query(`update restaurants set name = 'Hijacked' where id = $1`, [restaurant.id]),
      );
      expect(res.rowCount).toBe(0);
      expect(await asA((tx) => dishes.get(tx, dish.id))).toMatchObject({
        anchor: null,
        decodedAt: null,
      });
    });

    it('the creator can save the decode pass', async () => {
      const decoded = await asA((tx) => dishes.applyDecode(tx, dish.id, DECODED));
      expect(decoded).toMatchObject({
        anchor: DECODED.anchor,
        dietaryTags: ['vegan', 'vegetarian'],
        source: 'ai_generated',
      });
      expect(decoded?.decodedAt).toBeInstanceOf(Date);
    });

    it('the app role cannot delete shared content or change dish provenance/counters', async () => {
      await expect(
        asA((tx) => tx.query('delete from dishes where id = $1', [dish.id])),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asA((tx) =>
          tx.query(`update dishes set source = 'restaurant_verified' where id = $1`, [dish.id]),
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asA((tx) => tx.query('update dishes set feedback_up = 100 where id = $1', [dish.id])),
      ).rejects.toThrow(/permission denied/);
    });
  });

  describe('dish_feedback', () => {
    it('is private per diner, one row per diner and dish', async () => {
      await asA((tx) => feedback.upsert(tx, { dishId: dish.id, accurate: true, liked: true }));
      const merged = await asA((tx) => feedback.upsert(tx, { dishId: dish.id, tastesLike: 'Dal' }));
      expect(merged).toMatchObject({
        userId: userA,
        accurate: true,
        liked: true,
        tastesLike: 'Dal',
      });
      await asB((tx) => feedback.upsert(tx, { dishId: dish.id, accurate: false, liked: false }));

      expect(await asA((tx) => feedback.listMine(tx, [dish.id]))).toEqual([
        expect.objectContaining({ userId: userA }),
      ]);
      expect(await asB((tx) => feedback.listMine(tx, [dish.id]))).toEqual([
        expect.objectContaining({ userId: userB }),
      ]);
    });

    it('cannot write feedback as another diner or touch theirs', async () => {
      await expect(
        asB((tx) =>
          tx.query('insert into dish_feedback (dish_id, user_id, accurate) values ($1, $2, true)', [
            dish.id,
            userA,
          ]),
        ),
      ).rejects.toThrow(/row-level security/);
      const upd = await asB((tx) =>
        tx.query('update dish_feedback set liked = false where user_id = $1', [userA]),
      );
      expect(upd.rowCount).toBe(0);
      const del = await asB((tx) =>
        tx.query('delete from dish_feedback where user_id = $1', [userA]),
      );
      expect(del.rowCount).toBe(0);
      expect(await asA((tx) => feedback.listMine(tx, [dish.id]))).toEqual([
        expect.objectContaining({ liked: true }),
      ]);
    });

    it('aggregates across all diners through counters and the stats function', async () => {
      expect(await asB((tx) => dishes.get(tx, dish.id))).toMatchObject({
        feedbackUp: 1,
        feedbackDown: 1,
      });
      const stats = await asB((tx) => feedback.stats(tx, [dish.id, restaurant.id]));
      expect(stats.get(dish.id)).toEqual({
        entries: 2,
        accurateUp: 1,
        accurateDown: 1,
        likedUp: 1,
        likedDown: 1,
        likedRate: 0.5,
      });
      // Unknown / no-feedback ids come back as zeros.
      expect(stats.get(restaurant.id)).toMatchObject({ entries: 0, likedRate: null });
    });
  });

  describe('taste_profiles', () => {
    it('is private per diner', async () => {
      await asA((tx) => tasteProfiles.upsert(tx, PROFILE));
      expect(await asA((tx) => tasteProfiles.get(tx))).toMatchObject({ userId: userA, ...PROFILE });
      expect(await asB((tx) => tasteProfiles.get(tx))).toBeNull();
      expect((await asB((tx) => tx.query('select * from taste_profiles'))).rows).toEqual([]);
      await expect(
        asB((tx) => tx.query('insert into taste_profiles (user_id) values ($1)', [userA])),
      ).rejects.toThrow(/row-level security/);
      const upd = await asB((tx) => tx.query('update taste_profiles set spice_tolerance = 0'));
      expect(upd.rowCount).toBe(0);
    });

    it('upsert replaces the profile', async () => {
      const next = { ...PROFILE, spiceTolerance: 3, favoriteIngredients: [] };
      expect(await asA((tx) => tasteProfiles.upsert(tx, next))).toMatchObject(next);
    });
  });

  describe('dish_matches', () => {
    it('is private per diner and surfaces on the dish list', async () => {
      await asA((tx) =>
        matches.upsertMany(tx, [
          { dishId: dish.id, matchScore: 80, matchState: 'preliminary', explanation: null },
        ]),
      );
      expect(await asA((tx) => dishes.getWithMatch(tx, dish.id))).toMatchObject({
        matchScore: 80,
        matchState: 'preliminary',
        matchCached: true,
      });
      expect(await asB((tx) => dishes.getWithMatch(tx, dish.id))).toMatchObject({
        matchScore: null,
        matchState: 'unrated',
        matchCached: false,
      });
      expect(await asB((tx) => matches.listMine(tx, [dish.id]))).toEqual([]);
      await expect(
        asB((tx) =>
          tx.query(
            `insert into dish_matches (dish_id, user_id, match_state) values ($1, $2, 'unrated')`,
            [dish.id, userA],
          ),
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it('never stores a score for unrated, nor a rated state without one', async () => {
      await expect(
        asB((tx) =>
          matches.upsertMany(tx, [
            { dishId: dish.id, matchScore: 50, matchState: 'unrated', explanation: null },
          ]),
        ),
      ).rejects.toThrow(/check constraint/);
      await expect(
        asB((tx) =>
          matches.upsertMany(tx, [
            { dishId: dish.id, matchScore: null, matchState: 'confident', explanation: null },
          ]),
        ),
      ).rejects.toThrow(/check constraint/);
    });

    it("new feedback on a dish clears every diner's cached match for it", async () => {
      await asB((tx) =>
        matches.upsertMany(tx, [
          { dishId: dish.id, matchScore: 0, matchState: 'preliminary', explanation: 'x' },
        ]),
      );
      await asB((tx) => feedback.upsert(tx, { dishId: dish.id, liked: true }));
      expect(await asA((tx) => matches.listMine(tx, [dish.id]))).toEqual([]);
      expect(await asB((tx) => matches.listMine(tx, [dish.id]))).toEqual([]);
    });

    it("a profile change clears only that diner's cached matches", async () => {
      const m = [
        { dishId: dish.id, matchScore: 70, matchState: 'preliminary' as const, explanation: null },
      ];
      await asA((tx) => matches.upsertMany(tx, m));
      await asB((tx) => matches.upsertMany(tx, m));
      await asB((tx) => tasteProfiles.upsert(tx, PROFILE));
      expect(await asA((tx) => matches.listMine(tx, [dish.id]))).toHaveLength(1);
      expect(await asB((tx) => matches.listMine(tx, [dish.id]))).toEqual([]);
    });
  });

  it('rolls back everything when the callback throws', async () => {
    await expect(
      asA(async (tx) => {
        await restaurants.create(tx, { name: 'Ghost', cuisine: 'None' });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await asA((tx) => restaurants.list(tx, { q: 'Ghost' }))).toEqual([]);
  });
});
