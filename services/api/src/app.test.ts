import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { dishCardSchema, restaurantDetailSchema, scanResponseSchema, type TasteProfile } from '@fare/shared';
import { buildApp } from './app.js';
import type { Config } from './config.js';
import { LlmInputError, LlmOutputError, LlmUpstreamError } from './llm/index.js';
import { fakeDeps, multipart, testConfig } from './test/fakes.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function setup(over: Partial<Config> = {}) {
  const deps = fakeDeps();
  app = await buildApp(testConfig(over), deps);
  return { app, deps };
}

async function login(a: FastifyInstance) {
  const res = await a.inject({ method: 'POST', url: '/auth/anonymous' });
  const { token, userId } = res.json() as { token: string; userId: string };
  return { userId, headers: { authorization: `Bearer ${token}` } };
}

/** A small JPEG carrying EXIF incl. GPS coordinates. */
async function jpegWithExif(width = 64, height = 48) {
  return sharp({ create: { width, height, channels: 3, background: '#c33' } })
    .withExif({
      IFD0: { Copyright: 'secret-owner', Make: 'PhoneCo' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '51/1 30/1 0/1' },
    })
    .jpeg()
    .toBuffer();
}

const image = (data: Buffer, type = 'image/jpeg', field = 'image') => ({ field, filename: 'menu.jpg', type, data });

const createBody = {
  name: 'Queen of Sheba',
  cuisine: 'Ethiopian',
  dishes: [
    { nativeName: 'Kitfo', price: '$18', rawText: 'Kitfo 18', confidence: 'high' },
    { nativeName: 'Shiro', price: '$12', confidence: 'low' },
  ],
};

const profile: TasteProfile = {
  dietaryRestrictions: [],
  spiceTolerance: 2,
  avoidedIngredients: [],
  favoriteIngredients: ['beef'],
  cuisinesTried: ['Ethiopian'],
};

describe('health, auth and errors', () => {
  it('GET /health', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('issues an anonymous token for a new user', async () => {
    const { app, deps } = await setup();
    const res = await app.inject({ method: 'POST', url: '/auth/anonymous' });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(deps.db.users.has(body.userId)).toBe(true);
    expect(app.jwt.verify<{ sub: string }>(body.token).sub).toBe(body.userId);
  });

  it('rejects missing, malformed and foreign-signed tokens with the uniform error shape', async () => {
    const { app } = await setup();
    const other = await buildApp(testConfig({ JWT_SECRET: 'another-secret-entirely' }), fakeDeps());
    const forged = other.jwt.sign({ sub: '6f1c1c9e-5b8a-4a51-9e0f-1d9b7a2b3c4d' });
    await other.close();
    for (const authorization of [undefined, 'Bearer nope', `Bearer ${forged}`, forged]) {
      const res = await app.inject({ method: 'GET', url: '/restaurants', headers: authorization ? { authorization } : {} });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: { code: 'UNAUTHORIZED', message: expect.any(String) } });
    }
  });

  it('unknown routes 404 with the error shape', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it('allows configured and localhost CORS origins, not others', async () => {
    const { app } = await setup();
    const pre = (origin: string) =>
      app.inject({
        method: 'OPTIONS',
        url: '/restaurants',
        headers: { origin, 'access-control-request-method': 'GET' },
      });
    expect((await pre('https://app.example.com')).headers['access-control-allow-origin']).toBe('https://app.example.com');
    expect((await pre('http://localhost:8081')).headers['access-control-allow-origin']).toBe('http://localhost:8081');
    expect((await pre('https://evil.example')).headers['access-control-allow-origin']).toBeUndefined();
  });

  it('does not allow localhost origins in production', async () => {
    const { app } = await setup({ NODE_ENV: 'production' });
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/restaurants',
      headers: { origin: 'http://localhost:8081', 'access-control-request-method': 'GET' },
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('POST /scans', () => {
  it('strips EXIF/GPS, re-encodes, and returns the parsed menu', async () => {
    const { app, deps } = await setup();
    const { headers } = await login(app);
    const mp = multipart([image(await jpegWithExif())]);
    const res = await app.inject({ method: 'POST', url: '/scans', payload: mp.payload, headers: { ...headers, ...mp.headers } });
    expect(res.statusCode).toBe(200);
    const body = scanResponseSchema.parse(res.json());
    expect(body.dishes[0]?.nativeName).toBe('Kitfo');

    const [sent, mime] = deps.llm.parseMenuImage.mock.calls[0] as unknown as [Buffer, string];
    expect(mime).toBe('image/jpeg');
    const meta = await sharp(sent).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(sent.includes(Buffer.from('secret-owner'))).toBe(false);
  });

  it('downsizes large photos to MAX_IMAGE_EDGE', async () => {
    const { app, deps } = await setup({ MAX_IMAGE_EDGE: 100 });
    const { headers } = await login(app);
    const mp = multipart([image(await jpegWithExif(400, 200))]);
    await app.inject({ method: 'POST', url: '/scans', payload: mp.payload, headers: { ...headers, ...mp.headers } });
    const [sent] = deps.llm.parseMenuImage.mock.calls[0] as unknown as [Buffer];
    const meta = await sharp(sent).metadata();
    expect([meta.width, meta.height]).toEqual([100, 50]);
  });

  it('requires auth', async () => {
    const { app } = await setup();
    const mp = multipart([image(await jpegWithExif())]);
    const res = await app.inject({ method: 'POST', url: '/scans', payload: mp.payload, headers: mp.headers });
    expect(res.statusCode).toBe(401);
  });

  it('rejects uploads over MAX_UPLOAD_BYTES with 413', async () => {
    const { app, deps } = await setup({ MAX_UPLOAD_BYTES: 1000 });
    const { headers } = await login(app);
    const mp = multipart([image(Buffer.alloc(5000, 1))]);
    const res = await app.inject({ method: 'POST', url: '/scans', payload: mp.payload, headers: { ...headers, ...mp.headers } });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(deps.llm.parseMenuImage).not.toHaveBeenCalled();
  });

  it('rejects disallowed types and non-image bytes with 415', async () => {
    const { app, deps } = await setup();
    const { headers } = await login(app);
    for (const part of [image(Buffer.from('hello'), 'text/plain'), image(Buffer.from('not really a jpeg'))]) {
      const mp = multipart([part]);
      const res = await app.inject({ method: 'POST', url: '/scans', payload: mp.payload, headers: { ...headers, ...mp.headers } });
      expect(res.statusCode).toBe(415);
      expect(res.json().error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    }
    expect(deps.llm.parseMenuImage).not.toHaveBeenCalled();
  });

  it('rejects a missing image, a wrong field, more than one file, and JSON bodies', async () => {
    const { app } = await setup();
    const { headers } = await login(app);
    const jpeg = await jpegWithExif();
    const cases = [
      multipart([image(jpeg, 'image/jpeg', 'photo')]),
      multipart([image(jpeg), image(jpeg)]),
    ];
    for (const mp of cases) {
      const res = await app.inject({ method: 'POST', url: '/scans', payload: mp.payload, headers: { ...headers, ...mp.headers } });
      expect([400, 413]).toContain(res.statusCode);
    }
    const json = await app.inject({ method: 'POST', url: '/scans', payload: {}, headers });
    expect(json.statusCode).toBe(415);
  });

  it('rate-limits scans per user per hour', async () => {
    const { app } = await setup({ RATE_LIMIT_SCAN_PER_HOUR: 2 });
    const a = await login(app);
    const b = await login(app);
    const jpeg = await jpegWithExif();
    const scan = (h: Record<string, string>) => {
      const mp = multipart([image(jpeg)]);
      return app.inject({ method: 'POST', url: '/scans', payload: mp.payload, headers: { ...h, ...mp.headers } });
    };
    expect((await scan(a.headers)).statusCode).toBe(200);
    expect((await scan(a.headers)).statusCode).toBe(200);
    const limited = await scan(a.headers);
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe('RATE_LIMITED');
    expect((await scan(b.headers)).statusCode).toBe(200);
  });

  it('maps llm failures to 502 / 400 without leaking internals', async () => {
    const { app, deps } = await setup();
    const { headers } = await login(app);
    const jpeg = await jpegWithExif();
    deps.llm.parseMenuImage.mockRejectedValueOnce(new LlmUpstreamError('anthropic 529 overloaded', 529));
    let mp = multipart([image(jpeg)]);
    let res = await app.inject({ method: 'POST', url: '/scans', payload: mp.payload, headers: { ...headers, ...mp.headers } });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toEqual({ code: 'UPSTREAM_ERROR', message: expect.not.stringContaining('529') });

    deps.llm.parseMenuImage.mockRejectedValueOnce(new LlmInputError('empty image'));
    mp = multipart([image(jpeg)]);
    res = await app.inject({ method: 'POST', url: '/scans', payload: mp.payload, headers: { ...headers, ...mp.headers } });
    expect(res.statusCode).toBe(400);
  });
});

describe('restaurants', () => {
  it('creates a restaurant, decodes dishes, and returns unrated cards', async () => {
    const { app, deps } = await setup();
    const { headers } = await login(app);
    const res = await app.inject({ method: 'POST', url: '/restaurants', payload: createBody, headers });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.restaurant.name).toBe('Queen of Sheba');
    expect(body.dishes).toHaveLength(2);
    for (const d of body.dishes) {
      dishCardSchema.parse(d);
      expect(d.matchState).toBe('unrated');
      expect(d.matchScore).toBeNull();
      expect(d.source).toBe('ai_generated');
    }
    expect(body.dishes.map((d: { nativeName: string }) => d.nativeName)).toEqual(['Kitfo', 'Shiro']);
    // Low parse confidence carries through to the card.
    expect(body.dishes.map((d: { confidence: string }) => d.confidence)).toEqual(['high', 'low']);
    expect(deps.llm.decodeDishes).toHaveBeenCalledWith({
      cuisine: 'Ethiopian',
      restaurantName: 'Queen of Sheba',
      dishes: [
        { nativeName: 'Kitfo', price: '$18', rawText: 'Kitfo 18' },
        { nativeName: 'Shiro', price: '$12', rawText: undefined },
      ],
    });
  });

  it('saves nothing when decoding fails', async () => {
    const { app, deps } = await setup();
    const { headers } = await login(app);
    deps.llm.decodeDishes.mockRejectedValueOnce(new LlmOutputError('bad output', ['x']));
    let res = await app.inject({ method: 'POST', url: '/restaurants', payload: createBody, headers });
    expect(res.statusCode).toBe(502);
    deps.llm.decodeDishes.mockResolvedValueOnce([]);
    res = await app.inject({ method: 'POST', url: '/restaurants', payload: createBody, headers });
    expect(res.statusCode).toBe(502);
    expect(deps.db.restaurants).toHaveLength(0);
  });

  it('validates the body', async () => {
    const { app, deps } = await setup();
    const { headers } = await login(app);
    for (const payload of [{}, { ...createBody, dishes: [] }, { ...createBody, name: '' }, { ...createBody, source: 'fax' }]) {
      const res = await app.inject({ method: 'POST', url: '/restaurants', payload, headers });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    }
    expect(deps.llm.decodeDishes).not.toHaveBeenCalled();
  });

  it('rate-limits decode per user', async () => {
    const { app } = await setup({ RATE_LIMIT_DECODE_PER_HOUR: 1 });
    const { headers } = await login(app);
    expect((await app.inject({ method: 'POST', url: '/restaurants', payload: createBody, headers })).statusCode).toBe(201);
    expect((await app.inject({ method: 'POST', url: '/restaurants', payload: createBody, headers })).statusCode).toBe(429);
  });

  it('shares the library across users and supports search', async () => {
    const { app } = await setup();
    const a = await login(app);
    const b = await login(app);
    await app.inject({ method: 'POST', url: '/restaurants', payload: createBody, headers: a.headers });
    await app.inject({ method: 'POST', url: '/restaurants', payload: { ...createBody, name: 'Le Bistro', cuisine: 'French' }, headers: a.headers });
    const all = await app.inject({ method: 'GET', url: '/restaurants', headers: b.headers });
    expect(all.json()).toHaveLength(2);
    const found = await app.inject({ method: 'GET', url: '/restaurants?q=ethiop', headers: b.headers });
    expect(found.json().map((r: { name: string }) => r.name)).toEqual(['Queen of Sheba']);
    expect(found.json()[0].dishCount).toBe(2);
  });

  it('GET /restaurants/:id returns cards; 404 / 400 on unknown or bad ids', async () => {
    const { app } = await setup();
    const { headers } = await login(app);
    const created = (await app.inject({ method: 'POST', url: '/restaurants', payload: createBody, headers })).json();
    const res = await app.inject({ method: 'GET', url: `/restaurants/${created.restaurant.id}`, headers });
    expect(res.statusCode).toBe(200);
    expect(restaurantDetailSchema.parse(res.json()).dishes).toHaveLength(2);
    const missing = await app.inject({ method: 'GET', url: '/restaurants/6f1c1c9e-5b8a-4a51-9e0f-1d9b7a2b3c4d', headers });
    expect(missing.statusCode).toBe(404);
    const bad = await app.inject({ method: 'GET', url: '/restaurants/not-a-uuid', headers });
    expect(bad.statusCode).toBe(400);
  });

  it('hides dishes whose decode never ran', async () => {
    const { app, deps } = await setup();
    const { headers } = await login(app);
    const created = (await app.inject({ method: 'POST', url: '/restaurants', payload: createBody, headers })).json();
    deps.db.addDish(deps.db.restaurants[0]!.menuIds[0]!, { anchor: null, description: null, spice: null });
    const res = await app.inject({ method: 'GET', url: `/restaurants/${created.restaurant.id}`, headers });
    expect(res.json().dishes).toHaveLength(2);
  });
});

describe('feedback, taste profile and matching', () => {
  async function seeded() {
    const ctx = await setup();
    const users = [await login(ctx.app), await login(ctx.app), await login(ctx.app), await login(ctx.app)];
    const created = (await ctx.app.inject({ method: 'POST', url: '/restaurants', payload: createBody, headers: users[0]!.headers })).json();
    return { ...ctx, users, restaurantId: created.restaurant.id as string, kitfoId: created.dishes[0].id as string };
  }

  it('records feedback and updates the accuracy counters', async () => {
    const { app, users, kitfoId } = await seeded();
    const post = (i: number, payload: object) =>
      app.inject({ method: 'POST', url: `/dishes/${kitfoId}/feedback`, payload, headers: users[i]!.headers });
    let res = await post(1, { accurate: true });
    expect(res.statusCode).toBe(200);
    expect(res.json().dish.feedbackUp).toBe(1);
    res = await post(2, { accurate: false, tastesLike: 'beef tartare' });
    expect(res.json().dish).toMatchObject({ feedbackUp: 1, feedbackDown: 1 });
    // Same diner changing their mind updates, not duplicates.
    res = await post(2, { accurate: true });
    expect(res.json().dish).toMatchObject({ feedbackUp: 2, feedbackDown: 0 });
  });

  it('validates feedback and 404s unknown dishes', async () => {
    const { app, users, kitfoId } = await seeded();
    const h = users[0]!.headers;
    expect((await app.inject({ method: 'POST', url: `/dishes/${kitfoId}/feedback`, payload: {}, headers: h })).statusCode).toBe(400);
    expect(
      (await app.inject({ method: 'POST', url: `/dishes/${kitfoId}/feedback`, payload: { liked: 'yes' }, headers: h })).statusCode,
    ).toBe(400);
    const res = await app.inject({
      method: 'POST',
      url: '/dishes/6f1c1c9e-5b8a-4a51-9e0f-1d9b7a2b3c4d/feedback',
      payload: { liked: true },
      headers: h,
    });
    expect(res.statusCode).toBe(404);
  });

  it('taste profile: 404 before onboarding, PUT/GET round-trip, validation', async () => {
    const { app } = await setup();
    const { headers } = await login(app);
    expect((await app.inject({ method: 'GET', url: '/me/taste-profile', headers })).statusCode).toBe(404);
    const put = await app.inject({ method: 'PUT', url: '/me/taste-profile', payload: profile, headers });
    expect(put.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/me/taste-profile', headers })).json()).toEqual(profile);
    const bad = await app.inject({ method: 'PUT', url: '/me/taste-profile', payload: { ...profile, spiceTolerance: 9 }, headers });
    expect(bad.statusCode).toBe(400);
  });

  it('moves a dish from unrated to preliminary to confident as signal accumulates', async () => {
    const { app, users, restaurantId, kitfoId } = await seeded();
    const me = users[0]!.headers;
    const kitfo = async () =>
      (await app.inject({ method: 'GET', url: `/restaurants/${restaurantId}`, headers: me })).json().dishes.find(
        (d: { id: string }) => d.id === kitfoId,
      );

    // Feedback but no profile: still unrated.
    for (const u of users.slice(1)) {
      await app.inject({ method: 'POST', url: `/dishes/${kitfoId}/feedback`, payload: { liked: true }, headers: u.headers });
    }
    expect(await kitfo()).toMatchObject({ matchState: 'unrated', matchScore: null });

    // Profile + 3 entries => preliminary with a real score (cache invalidated by the PUT).
    await app.inject({ method: 'PUT', url: '/me/taste-profile', payload: profile, headers: me });
    const prelim = await kitfo();
    expect(prelim.matchState).toBe('preliminary');
    expect(prelim.matchScore).toBeGreaterThan(50);
    expect(prelim.matchExplanation).toContain('beef');

    // A dietary restriction the dish doesn't carry => 0 with an explanation.
    await app.inject({ method: 'PUT', url: '/me/taste-profile', payload: { ...profile, dietaryRestrictions: ['vegetarian'] }, headers: me });
    expect(await kitfo()).toMatchObject({ matchScore: 0, matchExplanation: expect.stringContaining('vegetarian') });

    // Own feedback returns a recomputed card.
    const res = await app.inject({ method: 'POST', url: `/dishes/${kitfoId}/feedback`, payload: { liked: false }, headers: me });
    expect(res.json().dish).toMatchObject({ matchState: 'preliminary', matchScore: 0 });
  });

  it('reaches confident at 10 feedback entries', async () => {
    const { app, deps, users, restaurantId, kitfoId } = await seeded();
    for (let i = 0; i < 10; i++) deps.db.feedback.push({ dishId: kitfoId, userId: `u${i}`, liked: true });
    const me = users[0]!.headers;
    await app.inject({ method: 'PUT', url: '/me/taste-profile', payload: profile, headers: me });
    const dishes = (await app.inject({ method: 'GET', url: `/restaurants/${restaurantId}`, headers: me })).json().dishes;
    const kitfo = dishes.find((d: { id: string }) => d.id === kitfoId);
    expect(kitfo.matchState).toBe('confident');
    // Shiro has no feedback => still honestly unrated.
    expect(dishes.find((d: { id: string }) => d.id !== kitfoId)).toMatchObject({ matchState: 'unrated', matchScore: null });
  });
});
