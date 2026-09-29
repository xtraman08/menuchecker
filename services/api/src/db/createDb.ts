// Implements the HTTP layer's DbPort (src/ports.ts) on top of the repositories.
import type { Restaurant, RestaurantSummary } from '@fare/shared';
import type pg from 'pg';
import type { CachedMatch, DbPort, DishRecord, UserTx } from '../ports.js';
import { createPool } from './pool.js';
import * as dishes from './repositories/dishes.js';
import * as feedback from './repositories/feedback.js';
import * as matches from './repositories/matches.js';
import * as menus from './repositories/menus.js';
import * as restaurants from './repositories/restaurants.js';
import * as tasteProfiles from './repositories/tasteProfiles.js';
import * as users from './repositories/users.js';
import { withUserTx, type Tx } from './tx.js';
import type { DishRow, RestaurantRow, TasteProfileRow } from './types.js';

export interface Db extends DbPort {
  pool: pg.Pool;
  close(): Promise<void>;
}

function toRestaurant(r: RestaurantRow): Restaurant {
  return {
    id: r.id,
    name: r.name,
    address: r.address,
    cuisine: r.cuisine,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
  };
}

function toDish(d: DishRow): DishRecord {
  return {
    id: d.id,
    nativeName: d.nativeName,
    price: d.price,
    photoUrl: d.photoUrl,
    anchor: d.anchor,
    description: d.description,
    spice: d.spice,
    texture: d.texture,
    adventurousness: d.adventurousness,
    note: d.note,
    ingredients: d.ingredients,
    dietaryTags: d.dietaryTags,
    source: d.source,
    confidence: d.confidence,
    feedbackUp: d.feedbackUp,
    feedbackDown: d.feedbackDown,
  };
}

function toProfile(p: TasteProfileRow) {
  return {
    dietaryRestrictions: p.dietaryRestrictions,
    spiceTolerance: p.spiceTolerance,
    avoidedIngredients: p.avoidedIngredients,
    favoriteIngredients: p.favoriteIngredients,
    cuisinesTried: p.cuisinesTried,
  };
}

function userTx(tx: Tx): UserTx {
  return {
    async createRestaurant(input) {
      return toRestaurant(await restaurants.create(tx, input));
    },
    async listRestaurants(q) {
      const rows = await restaurants.list(tx, { q });
      return rows.map((r): RestaurantSummary => ({ ...r, createdAt: r.createdAt.toISOString() }));
    },
    async getRestaurant(id) {
      const r = await restaurants.get(tx, id);
      return r ? toRestaurant(r) : null;
    },
    async createMenu(restaurantId, source) {
      const m = await menus.create(tx, { restaurantId, source });
      return { id: m.id };
    },
    async createDishes(menuId, rows) {
      return (await dishes.createMany(tx, menuId, rows)).map(toDish);
    },
    async listDishesForRestaurant(restaurantId) {
      return (await dishes.listByRestaurant(tx, restaurantId)).map(toDish);
    },
    async getDish(id) {
      const d = await dishes.get(tx, id);
      return d ? toDish(d) : null;
    },
    async upsertFeedback(input) {
      await feedback.upsert(tx, input);
    },
    async ownLiked(dishIds) {
      const out = new Map<string, boolean>();
      for (const f of await feedback.listMine(tx, dishIds))
        if (f.liked !== null) out.set(f.dishId, f.liked);
      return out;
    },
    async feedbackStats(dishIds) {
      return feedback.stats(tx, dishIds);
    },
    async getTasteProfile() {
      const p = await tasteProfiles.get(tx);
      return p ? toProfile(p) : null;
    },
    async upsertTasteProfile(profile) {
      return toProfile(await tasteProfiles.upsert(tx, profile));
    },
    async getMatches(dishIds) {
      const out = new Map<string, CachedMatch>();
      for (const m of await matches.listMine(tx, dishIds)) {
        out.set(m.dishId, {
          dishId: m.dishId,
          matchScore: m.matchScore,
          matchState: m.matchState,
          explanation: m.explanation,
          explanationKind: m.explanationKind,
        });
      }
      return out;
    },
    async upsertMatches(ms) {
      await matches.upsertMany(tx, ms);
    },
  };
}

/** The production DbPort: a fare_app pool with every call scoped by RLS. */
export function createDb(
  connectionString: string,
  pool: pg.Pool = createPool(connectionString),
): Db {
  return {
    pool,
    async createAnonymousUser() {
      return (await users.createAnonymous(pool)).id;
    },
    withUserTx(userId, fn) {
      return withUserTx(userId, (tx) => fn(userTx(tx)), pool);
    },
    async ping() {
      try {
        await pool.query('select 1');
        return true;
      } catch {
        return false;
      }
    },
    close: () => pool.end(),
  };
}
