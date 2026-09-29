// Real Claude API: scan a fixture -> review/edit -> save -> decoded cards -> shared library.
import { expect, test } from '@playwright/test';
import { uniqueName } from '../../support/api.ts';
import { hasAnthropicKey, NO_KEY_REASON } from '../../support/env.ts';
import { fixtureImage, MENU_DISHES, normalizeName } from '../../support/fixtures.ts';
import { T } from '../../support/testids.ts';
import { startAsNewDiner } from '../../support/ui.ts';

test.skip(!hasAnthropicKey, NO_KEY_REASON);
test.describe.configure({ timeout: 420_000 });

test('scan a Turkish menu, correct it, save it, and share it', async ({ page, browser }) => {
  const library = await startAsNewDiner(page, 'skip');
  const scan = await library.startScan();
  const review = await scan.uploadFromLibrary(fixtureImage('turkish'));

  // Parsed rows with confidence badges and native names preserved.
  const printed = MENU_DISHES.turkish.map(normalizeName);
  await expect(review.rows().first()).toBeVisible();
  const names = await review.names();
  for (const n of printed) {
    expect(names.map(normalizeName), `review rows: ${names.join(', ')}`).toContain(n);
  }
  const badges = await review.rows().getByTestId(T.review.badge).allInnerTexts();
  for (const b of badges) expect(b).toMatch(/looks good|check this|manual entry/i);

  // Edit: fix a name (simulate an OCR slip correction).
  const ezme = await review.rowWhere((n) => normalizeName(n) === 'ezme');
  await review.rename(ezme, 'Acılı Ezme');

  // Discard then restore one dish; discard another for good.
  const manti = await review.rowWhere((n) => normalizeName(n) === 'manti');
  await review.discard(manti);
  await expect(manti.getByTestId(T.review.restore)).toBeVisible();
  await review.restore(manti);
  await expect(manti.getByTestId(T.review.discard)).toBeVisible();
  const kunefe = await review.rowWhere((n) => normalizeName(n) === 'kunefe');
  await review.discard(kunefe);

  // Manual add.
  await review.addManual('Lahmacun', '₺110');

  const restaurantName = uniqueName('E2E Lokanta');
  const restaurant = await review.save(restaurantName, 'Turkish');

  // Decoded cards: edited + manual dishes present, discarded one absent.
  const cardNames = (await restaurant.cardNames()).map((n) => n.trim());
  expect(cardNames).toContain('Acılı Ezme');
  expect(cardNames).toContain('Lahmacun');
  expect(cardNames.map(normalizeName)).toContain('manti');
  expect(cardNames.map(normalizeName)).not.toContain('kunefe');
  expect(cardNames).toHaveLength(MENU_DISHES.turkish.length); // 6 - 1 discarded + 1 manual

  for (const name of cardNames) {
    const card = restaurant.card(name);
    await card.expectComprehension(name);
    await card.expectAiGeneratedLabel();
    await card.expectUnrated();
  }

  // A second anonymous diner finds it in the shared library.
  const other = await browser.newContext();
  try {
    const otherPage = await other.newPage();
    const otherLib = await startAsNewDiner(otherPage, 'skip');
    await otherLib.search(restaurantName);
    await expect(otherLib.row(restaurantName)).toBeVisible();
    const r = await otherLib.open(restaurantName);
    await expect(r.cards()).toHaveCount(cardNames.length);
    await r.card('Lahmacun').expectComprehension('Lahmacun');
  } finally {
    await other.close();
  }
});
