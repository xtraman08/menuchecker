// Page objects for the Expo web build. All selectors come from support/testids.ts.
import { expect, type Locator, type Page } from '@playwright/test';
import { parsePrice } from '../support/api.ts';
import { ROUTES, T } from '../support/testids.ts';

const byPrefix = (scope: Page | Locator, prefix: string) =>
  scope.locator(`[data-testid^="${prefix}"]`);

/** First number in an element's aria-label, falling back to its text. */
async function numberIn(loc: Locator): Promise<number> {
  const label = (await loc.getAttribute('aria-label')) ?? '';
  const text = label || (await loc.innerText());
  const m = text.match(/\d+(?:\.\d+)?/);
  if (!m) throw new Error(`no number in ${JSON.stringify(text)}`);
  return Number(m[0]);
}

export class OnboardingPage {
  constructor(readonly page: Page) {}
  readonly screen = () => this.page.getByTestId(T.onboarding.screen);

  async skip() {
    await expect(this.screen()).toBeVisible();
    await this.page.getByTestId(T.onboarding.skip).click();
  }

  async complete(opts: { spice: number; diets?: string[] }) {
    await expect(this.screen()).toBeVisible();
    await this.page.getByTestId(T.onboarding.spice(opts.spice)).click();
    for (const d of opts.diets ?? []) await this.page.getByTestId(T.onboarding.diet(d)).click();
    await this.page.getByTestId(T.onboarding.save).click();
  }
}

export class LibraryPage {
  constructor(readonly page: Page) {}
  readonly screen = () => this.page.getByTestId(T.library.screen);
  readonly rows = () => byPrefix(this.page, T.library.rowPrefix);

  async goto() {
    await this.page.goto(ROUTES.library);
    await expect(this.screen()).toBeVisible();
  }

  async search(q: string) {
    await this.page.getByTestId(T.library.search).fill(q);
  }

  row(name: string | RegExp) {
    return this.rows().filter({ hasText: name });
  }

  async open(name: string | RegExp) {
    await this.row(name).first().click();
    const r = new RestaurantPage(this.page);
    await expect(r.screen()).toBeVisible();
    return r;
  }

  async startScan() {
    await this.page.getByTestId(T.library.scanButton).click();
    const s = new ScanPage(this.page);
    await expect(s.screen()).toBeVisible();
    return s;
  }

  async openTasteProfile() {
    await this.page.getByTestId(T.library.tasteProfileButton).click();
    const tp = new TasteProfilePage(this.page);
    await expect(tp.screen()).toBeVisible();
    return tp;
  }
}

export class DishCardPO {
  constructor(readonly root: Locator) {}
  el(id: string) {
    return this.root.getByTestId(id);
  }
  nativeName = () => this.el(T.card.nativeName);
  anchor = () => this.el(T.card.anchor);
  description = () => this.el(T.card.description);
  sourceLabel = () => this.el(T.card.sourceLabel);
  match = () => this.el(T.card.match);
  matchScore = () => this.el(T.card.matchScore);
  photoOrPlaceholder = () => this.el(T.card.photo).or(this.el(T.card.photoPlaceholder));

  spice = () => numberIn(this.el(T.card.spice));
  adventurousness = () => numberIn(this.el(T.card.adventurousness));
  upCount = () => numberIn(this.el(T.card.upCount));
  downCount = () => numberIn(this.el(T.card.downCount));
  async price() {
    return parsePrice(await this.el(T.card.price).innerText());
  }

  async addToOrder() {
    await this.el(T.card.addToOrder).click();
  }

  /** Comprehension content is always visible on the card, without a tap (CLAUDE.md §2.1-2.4). */
  async expectComprehension(nativeName: string | RegExp) {
    await expect(this.nativeName()).toHaveText(nativeName);
    await expect(this.photoOrPlaceholder().first()).toBeVisible();
    await expect(this.anchor()).toBeVisible();
    await expect(this.anchor()).not.toHaveText(/^\s*$/);
    await expect(this.description()).toBeVisible();
    const spice = await this.spice();
    expect(spice).toBeGreaterThanOrEqual(0);
    expect(spice).toBeLessThanOrEqual(3);
    const adv = await this.adventurousness();
    expect(adv).toBeGreaterThanOrEqual(1);
    expect(adv).toBeLessThanOrEqual(3);
    await expect(this.match()).toBeVisible();
  }

  async expectUnrated() {
    await expect(this.el(T.card.matchUnrated)).toBeVisible();
    await expect(this.el(T.card.matchUnrated)).toContainText(/still learning your taste/i);
    await expect(this.matchScore()).toHaveCount(0);
  }

  async expectAiGeneratedLabel() {
    await expect(this.sourceLabel()).toBeVisible();
    await expect(this.sourceLabel()).toContainText(/ai[- ]generated/i);
  }
}

export class RestaurantPage {
  constructor(readonly page: Page) {}
  readonly screen = () => this.page.getByTestId(T.restaurant.screen);
  readonly cards = () => byPrefix(this.page, T.restaurant.cardPrefix);

  card(nativeName: string | RegExp) {
    const exact =
      typeof nativeName === 'string'
        ? new RegExp(`^\\s*${nativeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i')
        : nativeName;
    return new DishCardPO(
      this.cards()
        .filter({ has: this.page.getByTestId(T.card.nativeName).filter({ hasText: exact }) })
        .first(),
    );
  }

  async cardNames(): Promise<string[]> {
    return this.cards().getByTestId(T.card.nativeName).allInnerTexts();
  }

  shortlistBar = () => this.page.getByTestId(T.shortlist.bar);
  async shortlistTotal() {
    return parsePrice(await this.page.getByTestId(T.shortlist.total).innerText());
  }
  async shortlistCount() {
    return numberIn(this.page.getByTestId(T.shortlist.count));
  }
}

export class ScanPage {
  constructor(readonly page: Page) {}
  readonly screen = () => this.page.getByTestId(T.scan.screen);

  /** Picks an image through the web file chooser and waits for the review screen. */
  async uploadFromLibrary(filePath: string) {
    const chooser = this.page.waitForEvent('filechooser');
    await this.page.getByTestId(T.scan.pickLibrary).click();
    await (await chooser).setFiles(filePath);
    const review = new ReviewPage(this.page);
    await expect(review.screen()).toBeVisible({ timeout: 180_000 });
    return review;
  }
}

export class ReviewPage {
  constructor(readonly page: Page) {}
  readonly screen = () => this.page.getByTestId(T.review.screen);
  readonly rows = () => byPrefix(this.page, T.review.rowPrefix);

  /** Row whose name input value satisfies `match` (input values aren't visible to hasText). */
  async rowWhere(match: (name: string) => boolean): Promise<Locator> {
    const names = await this.names();
    const i = names.findIndex(match);
    if (i < 0) throw new Error(`no review row matched; rows: ${names.join(', ')}`);
    return this.rows().nth(i);
  }

  async names(): Promise<string[]> {
    return this.rows()
      .getByTestId(T.review.nameInput)
      .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value ?? e.textContent ?? ''));
  }

  rowAt(i: number) {
    return this.rows().nth(i);
  }

  async rename(row: Locator, newName: string) {
    await row.getByTestId(T.review.nameInput).fill(newName);
  }

  async discard(row: Locator) {
    await row.getByTestId(T.review.discard).click();
  }

  async restore(row: Locator) {
    await row.getByTestId(T.review.restore).click();
  }

  async addManual(name: string, price: string) {
    const before = await this.rows().count();
    await this.page.getByTestId(T.review.addManual).click();
    await expect(this.rows()).toHaveCount(before + 1);
    const row = this.rows().last();
    await row.getByTestId(T.review.nameInput).fill(name);
    await row.getByTestId(T.review.priceInput).fill(price);
    await expect(row.getByTestId(T.review.badge)).toContainText(/manual entry/i);
    return row;
  }

  async save(restaurantName: string, cuisine: string) {
    await this.page.getByTestId(T.review.restaurantName).fill(restaurantName);
    await this.page.getByTestId(T.review.cuisine).fill(cuisine);
    await this.page.getByTestId(T.review.save).click();
    const r = new RestaurantPage(this.page);
    await expect(r.screen()).toBeVisible({ timeout: 240_000 });
    return r;
  }
}

export class TasteProfilePage {
  constructor(readonly page: Page) {}
  readonly screen = () => this.page.getByTestId(T.tasteProfile.screen);

  async goto() {
    await this.page.goto(ROUTES.tasteProfile);
    await expect(this.screen()).toBeVisible();
  }

  async set(opts: { spice: number; diets?: string[]; favorites?: string; avoided?: string }) {
    await this.page.getByTestId(T.tasteProfile.spice(opts.spice)).click();
    for (const d of opts.diets ?? []) await this.page.getByTestId(T.tasteProfile.diet(d)).click();
    if (opts.favorites !== undefined)
      await this.page.getByTestId(T.tasteProfile.favoriteInput).fill(opts.favorites);
    if (opts.avoided !== undefined)
      await this.page.getByTestId(T.tasteProfile.avoidedInput).fill(opts.avoided);
    const saved = this.page.waitForResponse(
      (r) => r.url().includes('/me/taste-profile') && r.request().method() === 'PUT',
    );
    await this.page.getByTestId(T.tasteProfile.save).click();
    expect((await saved).ok()).toBe(true);
  }
}
