// Diner feedback from the card, and taste profile -> match states in the UI.
import { expect, test } from '@playwright/test';
import { ApiUser, dishByName, findSeededRestaurant } from '../../support/api.ts';
import { ProfilePage } from '../../pages/index.ts';
import { DIETARY_CAVEAT } from '../../support/testids.ts';
import { startAsNewDiner } from '../../support/ui.ts';

/** Gives a dish `n` more feedback entries from fresh diners (volume for match states). */
async function addRatings(dishName: string | RegExp, n = 3) {
  const raters = await Promise.all(Array.from({ length: n }, () => ApiUser.create()));
  try {
    const seeded = await findSeededRestaurant(raters[0]!, 'ethiopian');
    const dish = dishByName(seeded.dishes, dishName);
    for (const r of raters) await r.feedback(dish.id, { accurate: true, liked: true });
    return { seeded, dish };
  } finally {
    await Promise.all(raters.map((r) => r.dispose()));
  }
}

test('"was this accurate?" feedback updates the counts on the card', async ({ page }) => {
  const api = await ApiUser.create();
  const seeded = await findSeededRestaurant(api, 'ethiopian');
  await api.dispose();
  const doro = dishByName(seeded.dishes, /^doro w(a|o)t$/i);

  const library = await startAsNewDiner(page, 'skip');
  let restaurant = await library.open(seeded.restaurant.id);
  const [upBefore] = await restaurant.card(doro.id).feedbackCountValues();

  const feedback = await restaurant.card(doro.id).openFeedback();
  restaurant = await feedback.submit({ accurate: true, liked: true, tastesLike: 'chicken stew' });

  const card = restaurant.card(doro.id);
  await expect
    .poll(async () => (await card.feedbackCountValues())[0])
    .toBeGreaterThanOrEqual(upBefore + 1);
  // Persisted: survives a reload.
  await page.reload();
  await expect
    .poll(async () => (await card.feedbackCountValues())[0])
    .toBeGreaterThanOrEqual(upBefore + 1);
});

test('taste profile turns an unrated dish into a match score; skipping keeps it unrated', async ({
  browser,
}) => {
  const { seeded, dish: shiro } = await addRatings(/^shiro$/i);

  // Diner who skipped onboarding: still the honest "learning" state.
  const skipCtx = await browser.newContext();
  try {
    const lib = await startAsNewDiner(await skipCtx.newPage(), 'skip');
    const r = await lib.open(seeded.restaurant.id);
    await r.card(shiro.id).expectUnrated();
  } finally {
    await skipCtx.close();
  }

  // Diner who answered onboarding: a real score, shown alongside comprehension.
  const ctx = await browser.newContext();
  try {
    const lib = await startAsNewDiner(await ctx.newPage(), {
      spice: 2,
      diets: ['vegetarian'],
      favorites: ['chickpeas'],
    });
    const r = await lib.open(seeded.restaurant.id);
    const card = r.card(shiro.id);
    await card.expectComprehension(shiro.nativeName);
    await card.expectScored();

    // Default order is the menu's; sorting by match is an explicit action.
    expect(await r.cardIds()).toEqual(seeded.dishes.map((d) => d.id));
    await r.toggleSortByMatch();
    const sortedIds = await r.cardIds();
    expect([...sortedIds].sort()).toEqual(seeded.dishes.map((d) => d.id).sort());
    // Scored dishes first, highest score first; unrated (-1) after them.
    const scores = await Promise.all(sortedIds.map(async (id) => (await r.card(id).score()) ?? -1));
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  } finally {
    await ctx.close();
  }
});

test('editing the taste profile later re-computes matches (vegetarian -> Kitfo 0)', async ({
  page,
}) => {
  const { seeded, dish: kitfo } = await addRatings('Kitfo');

  const lib = await startAsNewDiner(page, { spice: 3, favorites: ['beef'] });
  let r = await lib.open(seeded.restaurant.id);
  await r.card(kitfo.id).expectScored();

  const profile = new ProfilePage(page);
  await profile.goto();
  await profile.set({ spice: 3, diets: ['vegetarian'] });

  await lib.goto();
  r = await lib.open(seeded.restaurant.id);
  await r.card(kitfo.id).expectComprehension('Kitfo');
  const card = r.card(kitfo.id);
  await expect(card.matchScore()).toHaveText(/\b0\b/);
  // A dietary conflict is explained, with an honest "verify with the restaurant" caveat.
  await expect(card.matchReason()).toBeVisible();
  await expect(card.matchCaveat()).toContainText(DIETARY_CAVEAT);
});

test('match indicator shows honest confidence labels for the seeded states', async ({ page }) => {
  // db/seed: Doro Wat has 10 diners of feedback (confident), Steak frites 3 (preliminary),
  // Injera none (unrated even with a profile).
  const api = await ApiUser.create();
  const eth = await findSeededRestaurant(api, 'ethiopian');
  const bistro = await findSeededRestaurant(api, 'bistro');
  await api.dispose();
  const doro = dishByName(eth.dishes, /^doro w(a|o)t$/i);
  const injera = dishByName(eth.dishes, /^injera$/i);
  const frites = dishByName(bistro.dishes, /steak frites/i);

  const lib = await startAsNewDiner(page, { spice: 2 });
  let r = await lib.open(eth.restaurant.id);
  await r.card(doro.id).expectScored();
  await expect(r.card(doro.id).matchState()).toContainText(/based on solid feedback/i);
  await expect(r.card(doro.id).source()).not.toContainText(/AI-written/i);
  await r.card(injera.id).expectUnrated();

  await lib.goto();
  r = await lib.open(bistro.restaurant.id);
  await r.card(frites.id).expectComprehension(frites.nativeName);
  await r.card(frites.id).expectScored();
  await expect(r.card(frites.id).matchState()).toContainText(/early estimate/i);
});
