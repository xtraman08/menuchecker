import { expect, test } from '@playwright/test';
import { ApiUser, expectErrorEnvelope } from '../../support/api.ts';

test.describe('health & anonymous auth', () => {
  test('GET /health returns ok', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test('POST /auth/anonymous issues a distinct token and userId per call', async ({ request }) => {
    const a = await (await request.post('/auth/anonymous')).json();
    const b = await (await request.post('/auth/anonymous')).json();
    for (const r of [a, b]) {
      expect(r).toMatchObject({ token: expect.any(String), userId: expect.any(String) });
      expect(r.token.length).toBeGreaterThan(10);
    }
    expect(a.userId).not.toBe(b.userId);
    expect(a.token).not.toBe(b.token);
  });

  test('protected routes reject missing and forged tokens with the error envelope', async ({
    request,
  }) => {
    await expectErrorEnvelope(await request.get('/me/taste-profile'), 401);
    await expectErrorEnvelope(await request.get('/restaurants'), 401);
    await expectErrorEnvelope(
      await request.get('/me/taste-profile', {
        headers: { Authorization: 'Bearer not-a-real.jwt.token' },
      }),
      401,
    );
    // A syntactically valid JWT signed with the wrong secret must also be rejected.
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: '00000000-0000-0000-0000-000000000000',
        userId: '00000000-0000-0000-0000-000000000000',
      }),
    ).toString('base64url');
    await expectErrorEnvelope(
      await request.get('/me/taste-profile', {
        headers: { Authorization: `Bearer ${header}.${payload}.c2lnbmF0dXJl` },
      }),
      401,
    );
  });

  test('a fresh anonymous user can read the shared library', async () => {
    const user = await ApiUser.create();
    try {
      const list = await user.listRestaurants();
      expect(Array.isArray(list)).toBe(true);
      expect(list.length, 'seeded restaurants should be visible to every user').toBeGreaterThan(0);
    } finally {
      await user.dispose();
    }
  });
});
