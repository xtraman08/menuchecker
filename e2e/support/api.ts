// Thin typed client over the API contract in docs/TEAM_PLAN.md, built on
// Playwright's request context so failures land in traces.
import { readFileSync } from 'node:fs';
import {
  expect,
  request as pwRequest,
  type APIRequestContext,
  type APIResponse,
} from '@playwright/test';
import { env } from './env.ts';

export type Confidence = 'high' | 'low' | 'manual';
export type MatchState = 'unrated' | 'preliminary' | 'confident';

export interface ParsedDish {
  tempId: string;
  nativeName: string;
  price: string | null;
  rawText: string;
  confidence: Confidence;
}

export interface ReviewedDish {
  nativeName: string;
  price: string | null;
  rawText?: string;
  confidence?: Confidence;
}

export interface DishCard {
  id: string;
  nativeName: string;
  photoUrl: string | null;
  anchor: string;
  description: string;
  spice: number;
  texture: string;
  adventurousness: number;
  note: string | null;
  price: string | null;
  source: 'ai_generated' | 'diner_refined' | 'restaurant_verified';
  confidence: 'high' | 'low';
  matchScore: number | null;
  matchState: MatchState;
  feedbackUp: number;
  feedbackDown: number;
  dietaryTags?: string[];
  matchExplanation?: string | null;
  matchExplanationKind?: 'dietary' | 'ingredients' | 'spice' | 'feedback' | null;
}

export interface Restaurant {
  id: string;
  name: string;
  address?: string | null;
  cuisine: string;
}

export type TasteProfile = {
  dietaryRestrictions: string[];
  spiceTolerance: number;
  avoidedIngredients: string[];
  favoriteIngredients: string[];
  cuisinesTried: string[];
};

export interface ScanResult {
  scanId: string;
  restaurantGuess?: { name: string; cuisine: string };
  dishes: ParsedDish[];
}

/** Asserts a JSON error envelope `{ error: { code, message } }`. */
export async function expectErrorEnvelope(res: APIResponse, status: number | number[]) {
  const statuses = Array.isArray(status) ? status : [status];
  expect(statuses, `unexpected status ${res.status()}: ${await res.text()}`).toContain(
    res.status(),
  );
  const body = await res.json();
  expect(body).toMatchObject({
    error: { code: expect.any(String), message: expect.any(String) },
  });
  return body.error as { code: string; message: string };
}

async function ok<T>(res: APIResponse, what: string): Promise<T> {
  if (!res.ok()) {
    throw new Error(`${what} failed: HTTP ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

/** An anonymous diner with its own request context and bearer token. */
export class ApiUser {
  private constructor(
    readonly ctx: APIRequestContext,
    readonly token: string,
    readonly userId: string,
  ) {}

  static async create(): Promise<ApiUser> {
    const anon = await pwRequest.newContext({ baseURL: env.apiUrl });
    const { token, userId } = await ok<{ token: string; userId: string }>(
      await anon.post('/auth/anonymous'),
      'POST /auth/anonymous',
    );
    await anon.dispose();
    const ctx = await pwRequest.newContext({
      baseURL: env.apiUrl,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    return new ApiUser(ctx, token, userId);
  }

  async dispose() {
    await this.ctx.dispose();
  }

  scanRaw(image: { name: string; mimeType: string; buffer: Buffer }) {
    return this.ctx.post('/scans', { multipart: { image }, timeout: 120_000 });
  }

  async scan(fixturePath: string): Promise<ScanResult> {
    const buffer = readFileSync(fixturePath);
    return ok(
      await this.scanRaw({ name: 'menu.png', mimeType: 'image/png', buffer }),
      'POST /scans',
    );
  }

  async createRestaurant(body: {
    name: string;
    address?: string;
    cuisine: string;
    dishes: ReviewedDish[];
  }) {
    return ok<{ restaurant: Restaurant; menuId: string; dishes: DishCard[] }>(
      await this.ctx.post('/restaurants', { data: body, timeout: 180_000 }),
      'POST /restaurants',
    );
  }

  async listRestaurants(q?: string) {
    return ok<Array<Restaurant & Record<string, unknown>>>(
      await this.ctx.get('/restaurants', { params: q ? { q } : undefined }),
      'GET /restaurants',
    );
  }

  async getRestaurant(id: string) {
    return ok<{ restaurant: Restaurant; dishes: DishCard[] }>(
      await this.ctx.get(`/restaurants/${id}`),
      `GET /restaurants/${id}`,
    );
  }

  async feedback(
    dishId: string,
    body: { accurate?: boolean; tastesLike?: string; liked?: boolean },
  ) {
    return ok<{ dish: DishCard }>(
      await this.ctx.post(`/dishes/${dishId}/feedback`, { data: body }),
      `POST /dishes/${dishId}/feedback`,
    );
  }

  getTasteProfileRaw() {
    return this.ctx.get('/me/taste-profile');
  }

  async putTasteProfile(profile: TasteProfile) {
    return ok<TasteProfile>(
      await this.ctx.put('/me/taste-profile', { data: profile }),
      'PUT /me/taste-profile',
    );
  }
}

/**
 * Fixed ids from db/seed (see db/README.md). Looked up by id, never by cuisine:
 * specs create their own Ethiopian/Turkish restaurants, which must not be mistaken for the seed.
 */
export const SEED_RESTAURANTS = {
  ethiopian: { id: '11111111-1111-4111-8111-111111111111', name: 'Selam Ethiopian Kitchen' },
  bistro: { id: '22222222-2222-4222-8222-222222222222', name: 'Le Petit Coin' },
} as const;

/** Returns a seeded restaurant with its dishes (per-user match fields for `user`). */
export async function findSeededRestaurant(user: ApiUser, which: keyof typeof SEED_RESTAURANTS) {
  const { id, name } = SEED_RESTAURANTS[which];
  const res = await user.ctx.get(`/restaurants/${id}`);
  if (res.status() === 404) {
    throw new Error(`Seeded restaurant ${name} (${id}) not found. Was db:seed run?`);
  }
  return ok<{ restaurant: Restaurant; dishes: DishCard[] }>(res, `GET /restaurants/${id}`);
}

export function dishByName(dishes: DishCard[], name: string | RegExp): DishCard {
  const re = typeof name === 'string' ? new RegExp(`^${name}$`, 'i') : name;
  const dish = dishes.find((d) => re.test(d.nativeName.trim()));
  if (!dish) {
    throw new Error(`No dish ${re} among: ${dishes.map((d) => d.nativeName).join(', ')}`);
  }
  return dish;
}

/** Contract invariants every decoded DishCard must satisfy (CLAUDE.md §3, TEAM_PLAN DishCard). */
export function expectDishCardInvariants(d: DishCard) {
  const label = `dish ${JSON.stringify(d.nativeName)}`;
  expect(d.id, label).toEqual(expect.any(String));
  expect(d.nativeName.trim().length, `${label} nativeName`).toBeGreaterThan(0);
  expect(d.anchor.trim().length, `${label} anchor`).toBeGreaterThan(0);
  expect(d.description.trim().length, `${label} description`).toBeGreaterThan(0);
  expect(Number.isInteger(d.spice), `${label} spice integer`).toBe(true);
  expect(d.spice, `${label} spice`).toBeGreaterThanOrEqual(0);
  expect(d.spice, `${label} spice`).toBeLessThanOrEqual(3);
  expect(Number.isInteger(d.adventurousness), `${label} adventurousness integer`).toBe(true);
  expect(d.adventurousness, `${label} adventurousness`).toBeGreaterThanOrEqual(1);
  expect(d.adventurousness, `${label} adventurousness`).toBeLessThanOrEqual(3);
  expect(typeof d.texture, `${label} texture`).toBe('string');
  expect(['ai_generated', 'diner_refined', 'restaurant_verified']).toContain(d.source);
  expect(['high', 'low']).toContain(d.confidence);
  expect(['unrated', 'preliminary', 'confident']).toContain(d.matchState);
  if (d.matchState === 'unrated') {
    expect(d.matchScore, `${label}: unrated must have null matchScore`).toBeNull();
  } else {
    expect(typeof d.matchScore, `${label} matchScore must be a number when not unrated`).toBe(
      'number',
    );
    expect(d.matchScore!).toBeGreaterThanOrEqual(0);
    expect(d.matchScore!).toBeLessThanOrEqual(100);
  }
  expect(d.feedbackUp).toBeGreaterThanOrEqual(0);
  expect(d.feedbackDown).toBeGreaterThanOrEqual(0);
}

/** Parses a menu price string ("$14", "14.50", "ETB 250", "₺120") into a number. */
export function parsePrice(price: string | null | undefined): number {
  if (!price) return 0;
  const m = price.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

export function uniqueName(prefix: string) {
  return `${prefix} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}
