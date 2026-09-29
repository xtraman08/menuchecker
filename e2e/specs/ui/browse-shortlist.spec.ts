// Onboarding -> library -> seeded Ethiopian restaurant -> instant-knowledge cards -> shortlist.
import { expect, test } from '@playwright/test';
import { ApiUser, dishByName, findSeededRestaurant, parsePrice } from '../../support/api.ts';
import { failOnPageErrors, startAsNewDiner } from '../../support/ui.ts';

test('browse the seeded Ethiopian menu and build a shortlist', async ({ page }) => {
  const noErrors = failOnPageErrors(page);
  const api = await ApiUser.create();
  const seeded = await findSeededRestaurant(api, /ethiop/i);
  await api.dispose();
  const kitfo = dishByName(seeded.dishes, 'Kitfo');
  const shiro = dishByName(seeded.dishes, 'Shiro');

  const library = await startAsNewDiner(page, 'skip');
  await expect(library.row(seeded.restaurant.name)).toBeVisible();

  // Search narrows the shared library.
  await library.search(seeded.restaurant.name.slice(0, 5));
  await expect(library.row(seeded.restaurant.name)).toBeVisible();
  const restaurant = await library.open(seeded.restaurant.name);

  // Every dish from the API is on the menu, in the same (non-match-sorted) order.
  await expect(restaurant.cards()).toHaveCount(seeded.dishes.length);
  expect((await restaurant.cardNames()).map((n) => n.trim())).toEqual(
    seeded.dishes.map((d) => d.nativeName),
  );

  const card = restaurant.card('Kitfo');
  await card.expectComprehension('Kitfo');
  expect(await card.spice()).toBe(kitfo.spice);
  // Diner skipped onboarding: honest "still learning" state, never a number.
  await card.expectUnrated();
  if (kitfo.source === 'ai_generated') await card.expectAiGeneratedLabel();
  else await expect(card.sourceLabel()).not.toContainText(/ai[- ]generated/i);

  // Shortlist with running total.
  await card.addToOrder();
  await restaurant.card('Shiro').addToOrder();
  await expect(restaurant.shortlistBar()).toBeVisible();
  expect(await restaurant.shortlistCount()).toBe(2);
  const expected = parsePrice(kitfo.price) + parsePrice(shiro.price);
  expect(await restaurant.shortlistTotal()).toBeCloseTo(expected, 2);

  noErrors();
});

test('every seeded card shows comprehension before any match signal', async ({ page }) => {
  const api = await ApiUser.create();
  const seeded = await findSeededRestaurant(api, /ethiop/i);
  await api.dispose();

  const library = await startAsNewDiner(page, 'skip');
  const restaurant = await library.open(seeded.restaurant.name);
  for (const d of seeded.dishes) {
    const card = restaurant.card(d.nativeName);
    await card.expectComprehension(d.nativeName);
    await card.expectUnrated();
  }
});
