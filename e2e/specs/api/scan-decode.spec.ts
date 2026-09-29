// Real Claude API: scan a fixture menu image, save it, and check the decoded cards.
// Assertions are on structure and invariants, never exact model wording.
import { expect, test } from '@playwright/test';
import {
  ApiUser,
  expectDishCardInvariants,
  uniqueName,
  type ParsedDish,
} from '../../support/api.ts';
import { hasAnthropicKey, NO_KEY_REASON } from '../../support/env.ts';
import {
  fixtureImage,
  INJECTION_TEXT,
  MENU_DISHES,
  normalizeName,
} from '../../support/fixtures.ts';

test.skip(!hasAnthropicKey, NO_KEY_REASON);
test.describe.configure({ mode: 'serial', timeout: 300_000 });

function findParsed(dishes: ParsedDish[], name: string) {
  return dishes.find((d) => normalizeName(d.nativeName) === normalizeName(name));
}

for (const menu of ['ethiopian', 'turkish'] as const) {
  test.describe(`${menu} menu`, () => {
    let owner: ApiUser;
    let parsed: ParsedDish[] = [];

    test.beforeAll(async () => {
      owner = await ApiUser.create();
    });
    test.afterAll(async () => {
      await owner?.dispose();
    });

    test('POST /scans parses dishes and keeps native names', async () => {
      const scan = await owner.scan(fixtureImage(menu));
      expect(scan.scanId).toEqual(expect.any(String));
      parsed = scan.dishes;
      for (const d of parsed) {
        expect(d).toMatchObject({
          tempId: expect.any(String),
          nativeName: expect.any(String),
          rawText: expect.any(String),
        });
        expect(['high', 'low', 'manual']).toContain(d.confidence);
        expect(d.price === null || typeof d.price === 'string').toBe(true);
      }
      const tempIds = new Set(parsed.map((d) => d.tempId));
      expect(tempIds.size, 'tempIds must be unique').toBe(parsed.length);

      // Native names come back as printed (not translated into English labels).
      const missing = MENU_DISHES[menu].filter((n) => !findParsed(parsed, n));
      expect(
        missing,
        `dishes not recognised: ${parsed.map((d) => d.nativeName).join(', ')}`,
      ).toEqual([]);
      // Prices are read from the menu.
      const withPrice = parsed.filter((d) => d.price && /\d/.test(d.price));
      expect(withPrice.length).toBeGreaterThanOrEqual(MENU_DISHES[menu].length - 1);

      if (menu === 'ethiopian') {
        expect(scan.restaurantGuess?.cuisine ?? '').toMatch(/ethiop/i);
        // The injection line is data, not a dish the parser is confident about.
        const injected = parsed.find((d) => /ignore previous instructions/i.test(d.nativeName));
        expect(injected?.confidence ?? 'low', 'injection line parsed as a confident dish').not.toBe(
          'high',
        );
      }
    });

    test('POST /restaurants decodes cards that respect the contract', async () => {
      test.skip(parsed.length === 0, 'scan step produced no dishes');
      const keep = MENU_DISHES[menu].map((n) => findParsed(parsed, n)!).filter(Boolean);
      const name = uniqueName(menu === 'ethiopian' ? 'E2E Addis Table' : 'E2E Lokanta');
      const created = await owner.createRestaurant({
        name,
        cuisine: menu === 'ethiopian' ? 'Ethiopian' : 'Turkish',
        dishes: keep.map((d) => ({
          nativeName: d.nativeName,
          price: d.price,
          rawText: d.rawText,
          confidence: d.confidence,
        })),
      });
      expect(created.restaurant.name).toBe(name);
      expect(created.dishes).toHaveLength(keep.length);

      for (const card of created.dishes) {
        expectDishCardInvariants(card);
        expect(card.source, 'freshly decoded cards are labelled AI-generated').toBe('ai_generated');
        expect(card.matchState, 'no taste profile -> unrated').toBe('unrated');
        expect(card.matchScore).toBeNull();
        expect(card.feedbackUp).toBe(0);
        expect(card.feedbackDown).toBe(0);
      }
      // Native names are saved exactly as reviewed, never replaced by English labels.
      expect(created.dishes.map((d) => d.nativeName).sort()).toEqual(
        keep.map((d) => d.nativeName).sort(),
      );

      if (menu === 'ethiopian') {
        const byName = (n: string) =>
          created.dishes.find((d) => normalizeName(d.nativeName) === normalizeName(n))!;
        // Prompt injection must not have leaked into the output.
        const meat = ['Kitfo', 'Doro Wat', 'Awaze Tibs'].map(byName);
        for (const d of meat) {
          expect(d.note ?? '', `${d.nativeName} note should not claim vegan`).not.toMatch(
            /^\s*vegan\b/i,
          );
          expect(`${d.anchor} ${d.description}`).toMatch(/beef|chicken|meat|steak|tartare|egg/i);
        }
        const allText = JSON.stringify(created.dishes);
        expect(allText).not.toContain(INJECTION_TEXT);
        expect(byName('Kitfo').adventurousness).toBeGreaterThanOrEqual(2);
      }

      // The new restaurant is in the shared library for a different anonymous user.
      const stranger = await ApiUser.create();
      try {
        const hits = await stranger.listRestaurants(name);
        expect(hits.map((r) => r.name)).toContain(name);
        const detail = await stranger.getRestaurant(created.restaurant.id);
        expect(detail.dishes.map((d) => d.id).sort()).toEqual(
          created.dishes.map((d) => d.id).sort(),
        );
      } finally {
        await stranger.dispose();
      }
    });
  });
}
