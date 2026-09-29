// Privacy: a diner's taste profile, feedback and matches are visible only to them.
// Checked twice: through the API, and directly against Postgres as the runtime
// role `fare_app` to prove row-level security (not just route code) enforces it.
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { ApiUser, findSeededRestaurant, type TasteProfile } from '../../support/api.ts';
import { env } from '../../support/env.ts';

const marker = `rls-marker-${Date.now()}`;
const profileA: TasteProfile = {
  dietaryRestrictions: ['vegetarian'],
  spiceTolerance: 3,
  avoidedIngredients: [marker],
  favoriteIngredients: ['lentils'],
  cuisinesTried: ['ethiopian'],
};

let userA: ApiUser;
let userB: ApiUser;

test.beforeAll(async () => {
  userA = await ApiUser.create();
  userB = await ApiUser.create();
  await userA.putTasteProfile(profileA);
});

test.afterAll(async () => {
  await userA?.dispose();
  await userB?.dispose();
});

test.describe('RLS via the API', () => {
  test('user A reads back their own taste profile', async () => {
    const res = await userA.getTasteProfileRaw();
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject(profileA);
  });

  test("user B cannot see user A's taste profile", async () => {
    const res = await userB.getTasteProfileRaw();
    // B has no profile yet: either 404 or an empty/default profile, never A's data.
    expect([200, 404]).toContain(res.status());
    const text = await res.text();
    expect(text).not.toContain(marker);
    if (res.status() === 200) {
      const body = JSON.parse(text) as TasteProfile;
      expect(body.avoidedIngredients ?? []).not.toContain(marker);
    }
  });

  test("user B's profile write does not touch user A's profile", async () => {
    await userB.putTasteProfile({ ...profileA, avoidedIngredients: ['b-only'], spiceTolerance: 0 });
    const a = await (await userA.getTasteProfileRaw()).json();
    expect(a).toMatchObject(profileA);
  });
});

test.describe('RLS directly in Postgres (runtime role fare_app)', () => {
  let client: pg.Client;

  test.beforeAll(async () => {
    client = new pg.Client({ connectionString: env.databaseUrl });
    try {
      await client.connect();
    } catch (err) {
      throw new Error(
        `Cannot connect to Postgres at DATABASE_URL (${env.databaseUrl.replace(/:[^:@/]+@/, ':***@')}): ${err}`,
      );
    }
  });

  test.afterAll(async () => {
    await client?.end();
  });

  async function asUser<T>(userId: string | null, fn: () => Promise<T>): Promise<T> {
    await client.query('begin');
    try {
      if (userId) await client.query(`select set_config('app.user_id', $1, true)`, [userId]);
      return await fn();
    } finally {
      await client.query('rollback');
    }
  }

  test('runtime role cannot bypass RLS', async () => {
    const { rows } = await client.query(
      'select rolsuper, rolbypassrls from pg_roles where rolname = current_user',
    );
    expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  test('every table in the public schema has RLS enabled', async () => {
    const { rows } = await client.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and c.relname <> 'schema_migrations'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    const without = rows.filter((r) => !r.relrowsecurity).map((r) => r.relname);
    expect(without, 'tables without RLS').toEqual([]);
  });

  test('default deny: with no app.user_id, no table returns rows', async () => {
    await asUser(null, async () => {
      for (const table of [
        'users',
        'restaurants',
        'menus',
        'dishes',
        'taste_profiles',
        'dish_feedback',
        'dish_matches',
      ]) {
        const { rows } = await client.query(`select count(*)::int as n from ${table}`);
        expect(rows[0].n, `${table} rows visible without a user`).toBe(0);
      }
    });
  });

  test("user B's session cannot read or write user A's taste profile", async () => {
    await asUser(userB.userId, async () => {
      const { rows } = await client.query(
        'select count(*)::int as n from taste_profiles where user_id = $1',
        [userA.userId],
      );
      expect(rows[0].n).toBe(0);
      const upd = await client.query(
        'update taste_profiles set spice_tolerance = 0 where user_id = $1',
        [userA.userId],
      );
      expect(upd.rowCount).toBe(0);
    });
    await asUser(userB.userId, async () => {
      await expect(
        client.query(`insert into taste_profiles (user_id, spice_tolerance) values ($1, 1)`, [
          userA.userId,
        ]),
      ).rejects.toThrow();
    });
    await asUser(userA.userId, async () => {
      const { rows } = await client.query(
        'select count(*)::int as n from taste_profiles where user_id = $1',
        [userA.userId],
      );
      expect(rows[0].n).toBe(1);
    });
  });

  test("user B's session cannot see user A's dish feedback", async () => {
    const seeded = await findSeededRestaurant(userA, 'ethiopian');
    const dish = seeded.dishes[0]!;
    await userA.feedback(dish.id, { accurate: true, tastesLike: marker });
    await asUser(userB.userId, async () => {
      const { rows } = await client.query(
        'select count(*)::int as n from dish_feedback where user_id = $1',
        [userA.userId],
      );
      expect(rows[0].n).toBe(0);
    });
    await asUser(userA.userId, async () => {
      const { rows } = await client.query(
        'select count(*)::int as n from dish_feedback where user_id = $1',
        [userA.userId],
      );
      expect(rows[0].n).toBeGreaterThanOrEqual(1);
    });
  });
});
