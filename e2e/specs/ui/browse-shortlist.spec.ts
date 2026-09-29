// Onboarding -> library -> seeded Ethiopian restaurant -> instant-knowledge cards -> shortlist.
import { expect, test } from '@playwright/test';
import { ApiUser, dishByName, findSeededRestaurant, parsePrice } from '../../support/api.ts';
import { failOnPageErrors, startAsNewDiner } from '../../support/ui.ts';

async function seededEthiopian() {
  const api = await ApiUser.create();
  try {
    return await findSeededRestaurant(api, 'ethiopian');
  } finally {
    await api.dispose();
  }
}

test('browse the seeded Ethiopian menu and build a shortlist', async ({ page }) => {
  const noErrors = failOnPageErrors(page);
  const seeded = await seededEthiopian();
  const kitfo = dishByName(seeded.dishes, 'Kitfo');
  const shiro = dishByName(seeded.dishes, 'Shiro');

  const library = await startAsNewDiner(page, 'skip');
  await expect(library.item(seeded.restaurant.id)).toBeVisible();

  // Search narrows the shared library and still finds it.
  await library.search(seeded.restaurant.name.slice(0, 5));
  await expect(library.item(seeded.restaurant.id)).toBeVisible();
  const restaurant = await library.open(seeded.restaurant.id);

  // Every dish from the API is on the menu, in the same (non-match-sorted) order.
  await expect.poll(() => restaurant.cardCount()).toBe(seeded.dishes.length);
  expect(await restaurant.cardIds()).toEqual(seeded.dishes.map((d) => d.id));

  const card = restaurant.card(kitfo.id);
  await card.expectComprehension('Kitfo');
  expect(await card.spice()).toBe(kitfo.spice);
  expect(await card.adventurousness()).toBe(kitfo.adventurousness);
  // Diner skipped onboarding: honest "still learning" state, never a number.
  await card.expectUnrated();
  if (kitfo.source === 'ai_generated') await card.expectAiLabel();

  // Shortlist with running total.
  await card.addToOrder();
  await restaurant.card(shiro.id).addToOrder();
  await expect(restaurant.shortlistBar()).toBeVisible();
  expect(await restaurant.shortlistCount()).toBe(2);
  const expected = parsePrice(kitfo.price) + parsePrice(shiro.price);
  expect(await restaurant.shortlistTotal()).toBeCloseTo(expected, 2);

  noErrors();
});

test('every seeded card shows comprehension before any match signal', async ({ page }) => {
  const seeded = await seededEthiopian();
  const library = await startAsNewDiner(page, 'skip');
  const restaurant = await library.open(seeded.restaurant.id);
  for (const d of seeded.dishes) {
    const card = restaurant.card(d.id);
    await card.expectComprehension(d.nativeName);
    await card.expectUnrated();
  }
});
