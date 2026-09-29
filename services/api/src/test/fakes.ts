// In-memory stand-ins for the db and llm modules, mirroring the DB triggers
// (feedback counters, match invalidation) so route tests exercise real flows.
import { randomUUID } from 'node:crypto';
import type { Restaurant, TasteProfile } from '@fare/shared';
import { vi } from 'vitest';
import type { Config } from '../config.js';
import type { DecodedDish, ParseMenuResult } from '../llm/index.js';
import type { CachedMatch, DbPort, Deps, DishRecord, FeedbackStats, UserTx } from '../ports.js';

interface FeedbackRow {
  dishId: string;
  userId: string;
  accurate?: boolean;
  tastesLike?: string;
  liked?: boolean;
}

export class FakeDb implements DbPort {
  users = new Set<string>();
  restaurants: (Restaurant & { menuIds: string[] })[] = [];
  dishes = new Map<string, DishRecord & { menuId: string }>();
  feedback: FeedbackRow[] = [];
  profiles = new Map<string, TasteProfile>();
  matches = new Map<string, CachedMatch>(); // key `${userId}:${dishId}`

  async createAnonymousUser(): Promise<string> {
    const id = randomUUID();
    this.users.add(id);
    return id;
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {}

  addDish(menuId: string, d: Partial<DishRecord> = {}): DishRecord {
    const dish: DishRecord & { menuId: string } = {
      id: randomUUID(),
      menuId,
      nativeName: 'Shiro',
      price: '$12',
      photoUrl: null,
      anchor: 'Similar to hummus — a warm, spiced chickpea stew',
      description: 'Ground chickpeas simmered with berbere.',
      spice: 1,
      texture: 'Smooth, saucy',
      adventurousness: 1,
      note: 'Vegan',
      ingredients: ['chickpeas', 'berbere', 'onion'],
      dietaryTags: ['vegan'],
      source: 'ai_generated',
      confidence: 'high',
      feedbackUp: 0,
      feedbackDown: 0,
      ...d,
    };
    this.dishes.set(dish.id, dish);
    return dish;
  }

  withUserTx<T>(userId: string, fn: (tx: UserTx) => Promise<T>): Promise<T> {
    const db = this;
    const mine = (dishId: string) => `${userId}:${dishId}`;
    const invalidateDish = (dishId: string) => {
      for (const k of [...db.matches.keys()]) if (k.endsWith(`:${dishId}`)) db.matches.delete(k);
    };
    const tx: UserTx = {
      async createRestaurant(input) {
        const r = { id: randomUUID(), ...input, createdBy: userId, createdAt: new Date().toISOString(), menuIds: [] };
        db.restaurants.push(r);
        const { menuIds: _m, ...out } = r;
        return out;
      },
      async listRestaurants(q) {
        return db.restaurants
          .filter((r) => !q || `${r.name} ${r.cuisine}`.toLowerCase().includes(q.toLowerCase()))
          .map((r) => ({
            id: r.id,
            name: r.name,
            address: r.address,
            cuisine: r.cuisine,
            createdAt: r.createdAt,
            dishCount: [...db.dishes.values()].filter((d) => d.menuId === r.menuIds.at(-1)).length,
          }));
      },
      async getRestaurant(id) {
        const r = db.restaurants.find((x) => x.id === id);
        if (!r) return null;
        const { menuIds: _m, ...out } = r;
        return out;
      },
      async createMenu(restaurantId) {
        const id = randomUUID();
        db.restaurants.find((r) => r.id === restaurantId)!.menuIds.push(id);
        return { id };
      },
      async createDishes(menuId, rows) {
        return rows.map(({ rawText: _raw, ...d }) =>
          db.addDish(menuId, { ...d, photoUrl: null, source: 'ai_generated', feedbackUp: 0, feedbackDown: 0 }),
        );
      },
      async listDishesForRestaurant(restaurantId) {
        const menuId = db.restaurants.find((r) => r.id === restaurantId)?.menuIds.at(-1);
        return [...db.dishes.values()].filter((d) => d.menuId === menuId);
      },
      async getDish(id) {
        const d = db.dishes.get(id);
        return d ? { ...d } : null;
      },
      async upsertFeedback({ dishId, ...fields }) {
        let row = db.feedback.find((f) => f.dishId === dishId && f.userId === userId);
        if (!row) db.feedback.push((row = { dishId, userId }));
        for (const [k, v] of Object.entries(fields)) if (v !== undefined) (row as unknown as Record<string, unknown>)[k] = v;
        const dish = db.dishes.get(dishId)!;
        const rows = db.feedback.filter((f) => f.dishId === dishId);
        dish.feedbackUp = rows.filter((f) => f.accurate === true).length;
        dish.feedbackDown = rows.filter((f) => f.accurate === false).length;
        invalidateDish(dishId);
      },
      async ownLiked(dishIds) {
        const m = new Map<string, boolean>();
        for (const f of db.feedback)
          if (f.userId === userId && dishIds.includes(f.dishId) && f.liked !== undefined) m.set(f.dishId, f.liked);
        return m;
      },
      async feedbackStats(dishIds) {
        const m = new Map<string, FeedbackStats>();
        for (const id of dishIds) {
          const rows = db.feedback.filter((f) => f.dishId === id);
          if (rows.length)
            m.set(id, {
              entries: rows.length,
              likedUp: rows.filter((f) => f.liked === true).length,
              likedDown: rows.filter((f) => f.liked === false).length,
            });
        }
        return m;
      },
      async getTasteProfile() {
        return db.profiles.get(userId) ?? null;
      },
      async upsertTasteProfile(p) {
        db.profiles.set(userId, p);
        for (const k of [...db.matches.keys()]) if (k.startsWith(`${userId}:`)) db.matches.delete(k);
        return p;
      },
      async getMatches(dishIds) {
        const m = new Map<string, CachedMatch>();
        for (const id of dishIds) {
          const c = db.matches.get(mine(id));
          if (c) m.set(id, c);
        }
        return m;
      },
      async upsertMatches(ms) {
        for (const m of ms) db.matches.set(mine(m.dishId), m);
      },
    };
    return fn(tx);
  }
}

export const decoded = (over: Partial<DecodedDish> = {}): DecodedDish => ({
  anchor: 'Similar to steak tartare — minced raw beef with spiced butter',
  description: 'Finely minced beef warmed in niter kibbeh.',
  spice: 2,
  texture: 'Soft, buttery',
  adventurousness: 3,
  note: null,
  ingredients: ['beef', 'niter kibbeh', 'mitmita'],
  dietaryTags: ['gluten_free'],
  confidence: 'high',
  ...over,
});

export function fakeLlm() {
  return {
    parseMenuImage: vi.fn(
      async (): Promise<ParseMenuResult> => ({
        restaurantGuess: { name: 'Queen of Sheba', cuisine: 'Ethiopian' },
        dishes: [{ tempId: 't1', nativeName: 'Kitfo', price: '$18', rawText: 'Kitfo $18', confidence: 'high' }],
      }),
    ),
    decodeDishes: vi.fn(async (input: { dishes: unknown[] }) => input.dishes.map(() => decoded())),
  };
}

export function testConfig(over: Partial<Config> = {}): Config {
  return {
    NODE_ENV: 'test',
    API_PORT: 0,
    API_HOST: '127.0.0.1',
    LOG_LEVEL: 'silent',
    JWT_SECRET: 'test-secret-please-change',
    CORS_ORIGINS: 'https://app.example.com',
    RATE_LIMIT_SCAN_PER_HOUR: 20,
    RATE_LIMIT_DECODE_PER_HOUR: 30,
    RATE_LIMIT_GLOBAL_PER_MINUTE: 1000,
    MAX_UPLOAD_BYTES: 8_000_000,
    MAX_IMAGE_EDGE: 2000,
    ...over,
  };
}

export function fakeDeps(): Deps & { db: FakeDb; llm: ReturnType<typeof fakeLlm> } {
  return { db: new FakeDb(), llm: fakeLlm() as never };
}

/** Builds a multipart/form-data body for fastify.inject. */
export function multipart(files: { field: string; filename: string; type: string; data: Buffer }[]) {
  const boundary = `----fare${randomUUID()}`;
  const chunks: Buffer[] = [];
  for (const f of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${f.field}"; filename="${f.filename}"\r\nContent-Type: ${f.type}\r\n\r\n`,
      ),
      f.data,
      Buffer.from('\r\n'),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}
