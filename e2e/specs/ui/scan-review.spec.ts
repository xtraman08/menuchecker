// Real Claude API: scan a fixture -> review/edit -> save -> decoded cards -> shared library.
import { expect, test } from '@playwright/test';
import { uniqueName } from '../../support/api.ts';
import { hasAnthropicKey, NO_KEY_REASON } from '../../support/env.ts';
import { fixtureImage, MENU_DISHES, normalizeName } from '../../support/fixtures.ts';
import { startAsNewDiner } from '../../support/ui.ts';

test.skip(!hasAnthropicKey, NO_KEY_REASON);
test.describe.configure({ timeout: 420_000 });

test('scan a Turkish menu, correct it, save it, and share it', async ({ page, browser }) => {
  const library = await startAsNewDiner(page, 'skip');
  const scan = await library.startScan();
  const review = await scan.uploadFromLibrary(fixtureImage('turkish'));

  // Parsed rows with confidence badges and native names preserved.
  const names = (await review.names()).map(normalizeName);
  for (const n of MENU_DISHES.turkish.map(normalizeName)) {
    expect(names, `review rows: ${names.join(', ')}`).toContain(n);
  }
  for (const id of await review.tempIds()) {
    await expect(review.badge(id)).toContainText(/looks good|check this|manual entry/i);
  }

  // Edit: correct a name.
  const ezme = await review.tempIdWhere((n) => normalizeName(n) === 'ezme');
  await review.rename(ezme, 'Acılı Ezme');

  // Discard then restore one dish; discard another for good.
  const manti = await review.tempIdWhere((n) => normalizeName(n) === 'manti');
  await review.discard(manti);
  await review.restore(manti);
  const kunefe = await review.tempIdWhere((n) => normalizeName(n) === 'kunefe');
  await review.discard(kunefe);

  // Manual add.
  await review.addManual('Lahmacun', '₺110');
  const expectedCount = (await review.tempIds()).length;

  const restaurantName = uniqueName('E2E Lokanta');
  const restaurant = await review.save(restaurantName, 'Turkish');

  // Decoded cards: edited + manual dishes present, discarded one absent.
  await expect.poll(() => restaurant.cardCount(), { timeout: 60_000 }).toBe(expectedCount);
  const cardNames = await restaurant.cardNames();
  expect(cardNames).toContain('Acılı Ezme');
  expect(cardNames).toContain('Lahmacun');
  expect(cardNames.map(normalizeName)).toContain('manti');
  expect(cardNames.map(normalizeName)).not.toContain('kunefe');

  for (const name of cardNames) {
    const card = await restaurant.cardByName(name);
    await card.expectComprehension(name);
    await card.expectAiLabel();
    await card.expectUnrated();
  }

  // A second anonymous diner finds it in the shared library.
  const other = await browser.newContext();
  try {
    const otherLib = await startAsNewDiner(await other.newPage(), 'skip');
    await otherLib.search(restaurantName);
    await expect(otherLib.itemByName(restaurantName)).toBeVisible();
    const r = await otherLib.openByName(restaurantName);
    await expect.poll(() => r.cardCount()).toBe(cardNames.length);
    await (await r.cardByName('Lahmacun')).expectComprehension('Lahmacun');
  } finally {
    await other.close();
  }
});
