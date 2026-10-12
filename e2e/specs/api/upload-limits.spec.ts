// Upload validation and per-user rate limiting on POST /scans (CLAUDE.md §7).
// None of these requests should reach the model, so they run without an API key.
import { expect, request as pwRequest, test } from '@playwright/test';
import { ApiUser, expectErrorEnvelope } from '../../support/api.ts';
import { env } from '../../support/env.ts';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test.describe('scan upload validation', () => {
  let user: ApiUser;
  test.beforeAll(async () => {
    user = await ApiUser.create();
  });
  test.afterAll(async () => {
    await user?.dispose();
  });

  test('rejects an image larger than MAX_UPLOAD_BYTES with 413', async () => {
    const buffer = Buffer.concat([PNG_MAGIC, Buffer.alloc(env.maxUploadBytes + 64 * 1024)]);
    const res = await user.scanRaw({ name: 'huge.png', mimeType: 'image/png', buffer });
    await expectErrorEnvelope(res, 413);
  });

  test('rejects a non-image upload', async () => {
    const res = await user.scanRaw({
      name: 'menu.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Kitfo $18\nDoro Wat $17.50\n'),
    });
    await expectErrorEnvelope(res, [400, 415]);
  });

  test('rejects a request with no image part', async () => {
    const res = await user.ctx.post('/scans', { multipart: { note: 'no image here' } });
    await expectErrorEnvelope(res, [400, 415]);
  });

  test('rejects unauthenticated uploads', async () => {
    const anon = await pwRequest.newContext({ baseURL: env.apiUrl });
    try {
      const res = await anon.post('/scans', {
        multipart: { image: { name: 'm.png', mimeType: 'image/png', buffer: PNG_MAGIC } },
      });
      await expectErrorEnvelope(res, 401);
    } finally {
      await anon.dispose();
    }
  });
});

test.describe('scan rate limit', () => {
  test('a user is limited to RATE_LIMIT_SCAN_PER_HOUR scan attempts; other users are not', async () => {
    const limit = env.rateLimitScanPerHour;
    test.skip(limit > 200, `RATE_LIMIT_SCAN_PER_HOUR=${limit} is too high to exercise in a test`);
    const heavy = await ApiUser.create();
    const other = await ApiUser.create();
    try {
      // Requests without an image are rejected cheaply (no model call) but still
      // count as scan attempts for the per-user limiter.
      const statuses: number[] = [];
      for (let i = 0; i < limit + 2; i++) {
        const res = await heavy.ctx.post('/scans', { multipart: { note: `attempt ${i}` } });
        statuses.push(res.status());
        if (res.status() === 429) {
          await expectErrorEnvelope(res, 429);
          break;
        }
      }
      const first429 = statuses.indexOf(429);
      expect(first429, `statuses: ${statuses.join(',')}`).toBeGreaterThanOrEqual(0);
      expect(first429, 'limited before reaching the configured limit').toBeGreaterThanOrEqual(
        limit,
      );

      const otherRes = await other.ctx.post('/scans', { multipart: { note: 'other user' } });
      expect(otherRes.status(), 'limit must be per user, not global').not.toBe(429);
    } finally {
      await heavy.dispose();
      await other.dispose();
    }
  });
});
