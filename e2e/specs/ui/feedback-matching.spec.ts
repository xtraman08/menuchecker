// Diner feedback from the card, and taste profile -> match states in the UI.
import { expect, test } from '@playwright/test';
import { ApiUser, dishByName, findSeededRestaurant } from '../../support/api.ts';
import { TasteProfilePage } from '../../pages/index.ts';
import { T } from '../../support/testids.ts';
import { startAsNewDiner } from '../../support/ui.ts';

test('"was this accurate?" feedback updates the counter on the card', async ({ page }) => {
  const api = await ApiUser.create();
  const seeded = await findSeededRestaurant(api, /ethiop/i);
  await api.dispose();
  const doro = dishByName(seeded.dishes, /^doro w(a|o)t$/i);

  const library = await startAsNewDiner(page, 'skip');
  const restaurant = await library.open(seeded.restaurant.name);
  const card = restaurant.card(doro.nativeName);
  const before = await card.upCount();

  const posted = page.waitForResponse(
    (r) => r.url().includes(`/dishes/${doro.id}/feedback`) && r.request().method() === 'POST',
  );
  await card.el(T.card.accurateYes).click();
  expect((await posted).ok()).toBe(true);
  await expect.poll(() => card.upCount()).toBeGreaterThanOrEqual(before + 1);

  // Persisted: survives a reload.
  await page.reload();
  await expect
    .poll(() => restaurant.card(doro.nativeName).upCount())
    .toBeGreaterThanOrEqual(before + 1);
});

test('taste profile turns an unrated dish into a match score; skipping keeps it unrated', async ({
  browser,
}) => {
  // Give a seeded dish enough feedback volume (>= 3 entries) from other diners.
  const raters = await Promise.all([1, 2, 3].map(() => ApiUser.create()));
  const seeded = await findSeededRestaurant(raters[0]!, /ethiop/i);
  const target = dishByName(seeded.dishes, /^shiro$/i);
  for (const r of raters) await r.feedback(target.id, { accurate: true, liked: true });
  await Promise.all(raters.map((r) => r.dispose()));

  // Diner who skipped onboarding: still honest "learning" state.
  const skipCtx = await browser.newContext();
  try {
    const skipPage = await skipCtx.newPage();
    const lib = await startAsNewDiner(skipPage, 'skip');
    const r = await lib.open(seeded.restaurant.name);
    await r.card(target.nativeName).expectUnrated();
  } finally {
    await skipCtx.close();
  }

  // Diner who answered onboarding: a real score, shown alongside comprehension.
  const ctx = await browser.newContext();
  try {
    const page = await ctx.newPage();
    const lib = await startAsNewDiner(page, { spice: 2, diets: ['vegetarian'] });
    const r = await lib.open(seeded.restaurant.name);
    const card = r.card(target.nativeName);
    await card.expectComprehension(target.nativeName);
    await expect(
      card.el(T.card.matchPreliminary).or(card.el(T.card.matchConfident)).first(),
    ).toBeVisible();
    await expect(card.el(T.card.matchUnrated)).toHaveCount(0);
    await expect(card.matchScore()).toHaveText(/\b\d{1,3}\b/);

    // Kitfo conflicts with "vegetarian" -> hard 0 once it has a score, never hidden.
    const kitfo = r.card('Kitfo');
    await kitfo.expectComprehension('Kitfo');

    // Sort by match is an explicit action and reorders the list; default order is the menu's.
    const defaultOrder = (await r.cardNames()).map((n) => n.trim());
    expect(defaultOrder).toEqual(seeded.dishes.map((d) => d.nativeName));
    await page.getByTestId(T.restaurant.sortByMatch).click();
    await expect(r.cards()).toHaveCount(seeded.dishes.length);
    // Scored dishes come first, highest score first; unrated ones after them.
    const scores = await r.cards().evaluateAll(
      (cards, scoreId) =>
        cards.map((c) => {
          const s = c.querySelector(`[data-testid="${scoreId}"]`)?.textContent ?? '';
          const m = s.match(/\d+/);
          return m ? Number(m[0]) : -1;
        }),
      T.card.matchScore,
    );
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  } finally {
    await ctx.close();
  }
});

test('editing the taste profile later re-computes matches', async ({ page }) => {
  const raters = await Promise.all([1, 2, 3].map(() => ApiUser.create()));
  const seeded = await findSeededRestaurant(raters[0]!, /ethiop/i);
  const kitfo = dishByName(seeded.dishes, 'Kitfo');
  for (const r of raters) await r.feedback(kitfo.id, { liked: true });
  await Promise.all(raters.map((r) => r.dispose()));

  const lib = await startAsNewDiner(page, { spice: 3 });
  let r = await lib.open(seeded.restaurant.name);
  await expect(r.card('Kitfo').matchScore()).toBeVisible();

  const tp = new TasteProfilePage(page);
  await tp.goto();
  await tp.set({ spice: 3, diets: ['vegetarian'] });

  await lib.goto();
  r = await lib.open(seeded.restaurant.name);
  await expect(r.card('Kitfo').matchScore()).toHaveText(/\b0\b/);
});
