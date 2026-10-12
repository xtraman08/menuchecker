// Page objects for the Expo web build. All selectors come from support/testids.ts.
import { expect, type Locator, type Page } from '@playwright/test';
import { parsePrice } from '../support/api.ts';
import {
  ADVENTUROUSNESS_LABELS,
  AI_SOURCE_LABEL,
  ROUTES,
  SPICE_LABELS,
  T,
  UNRATED_TEXT,
} from '../support/testids.ts';

/** Ids (suffixes) of every element whose testid starts with `prefix`, in DOM order. */
async function idsWithPrefix(scope: Page | Locator, prefix: string): Promise<string[]> {
  return scope
    .locator(`[data-testid^="${prefix}"]`)
    .evaluateAll(
      (els, p) => els.map((e) => e.getAttribute('data-testid')!.slice(p.length)),
      prefix,
    );
}

/** Index of the first label contained in the element's text. */
async function labelIndex(loc: Locator, labels: readonly string[]): Promise<number> {
  const text = (await loc.innerText()).toLowerCase();
  const i = labels.findIndex((l) => text.includes(l.toLowerCase()));
  if (i < 0) throw new Error(`none of ${labels.join(' / ')} in ${JSON.stringify(text)}`);
  return i;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Taste profile form shared by onboarding and /profile. */
export interface ProfileInput {
  spice: number;
  diets?: string[];
  favorites?: string[];
  avoided?: string[];
  cuisines?: string[];
}

async function fillProfileForm(page: Page, p: ProfileInput) {
  const f = T.profileForm;
  await page.getByTestId(f.spice(p.spice)).click();
  await expect(page.getByTestId(f.spice(p.spice))).toHaveAttribute('aria-selected', 'true');
  for (const d of p.diets ?? []) await page.getByTestId(f.diet(d)).click();
  for (const c of p.cuisines ?? []) await page.getByTestId(f.cuisine(c)).click();
  for (const fav of p.favorites ?? []) {
    await page.getByTestId(f.favInput).fill(fav);
    await page.getByTestId(f.favAdd).click();
  }
  for (const a of p.avoided ?? []) {
    await page.getByTestId(f.avoidInput).fill(a);
    await page.getByTestId(f.avoidAdd).click();
  }
}

const isProfilePut = (r: { url(): string; request(): { method(): string } }) =>
  r.url().includes('/me/taste-profile') && r.request().method() === 'PUT';

export class OnboardingPage {
  constructor(readonly page: Page) {}
  readonly screen = () => this.page.getByTestId(T.onboarding.screen);

  async skip() {
    await expect(this.screen()).toBeVisible();
    await this.page.getByTestId(T.onboarding.skip).click();
  }

  async complete(profile: ProfileInput) {
    await expect(this.screen()).toBeVisible();
    await fillProfileForm(this.page, profile);
    const saved = this.page.waitForResponse(isProfilePut);
    await this.page.getByTestId(T.onboarding.save).click();
    expect((await saved).ok(), 'onboarding PUT /me/taste-profile').toBe(true);
  }
}

export class ProfilePage {
  constructor(readonly page: Page) {}
  readonly screen = () => this.page.getByTestId(T.profile.screen);

  async goto() {
    await this.page.goto(ROUTES.profile);
    await expect(this.screen()).toBeVisible();
  }

  async set(profile: ProfileInput) {
    await fillProfileForm(this.page, profile);
    const saved = this.page.waitForResponse(isProfilePut);
    await this.page.getByTestId(T.profile.save).click();
    expect((await saved).ok(), 'PUT /me/taste-profile').toBe(true);
    await expect(this.page.getByTestId(T.profile.saved)).toBeVisible();
  }
}

export class LibraryPage {
  constructor(readonly page: Page) {}
  readonly screen = () => this.page.getByTestId(T.library.screen);

  async goto() {
    await this.page.goto(ROUTES.library);
    await expect(this.screen()).toBeVisible();
  }

  async search(q: string) {
    await this.page.getByTestId(T.library.search).fill(q);
  }

  /** The library row for a restaurant, by its server id. */
  item(id: string) {
    return this.page.getByTestId(T.library.item(id));
  }

  /** The library row whose name matches, when the id isn't known. */
  itemByName(name: string) {
    return this.page
      .locator(`[data-testid^="${T.library.itemNamePrefix}"]`)
      .filter({ hasText: name });
  }

  async open(id: string) {
    await this.item(id).click();
    const r = new RestaurantPage(this.page);
    await expect(r.screen()).toBeVisible();
    return r;
  }

  async openByName(name: string) {
    await this.itemByName(name).first().click();
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

  async openProfile() {
    await this.page.getByTestId(T.library.profileButton).click();
    const p = new ProfilePage(this.page);
    await expect(p.screen()).toBeVisible();
    return p;
  }
}

export class DishCardPO {
  constructor(
    readonly page: Page,
    readonly id: string,
  ) {}
  root = () => this.page.getByTestId(T.card.root(this.id));
  name = () => this.page.getByTestId(T.card.name(this.id));
  anchor = () => this.page.getByTestId(T.card.anchor(this.id));
  description = () => this.page.getByTestId(T.card.description(this.id));
  source = () => this.page.getByTestId(T.card.source(this.id));
  match = () => this.page.getByTestId(T.card.match(this.id));
  matchUnrated = () => this.page.getByTestId(T.card.matchUnrated(this.id));
  matchScore = () => this.page.getByTestId(T.card.matchScore(this.id));
  matchState = () => this.page.getByTestId(T.card.matchState(this.id));
  matchReason = () => this.page.getByTestId(T.card.matchReason(this.id));
  matchCaveat = () => this.page.getByTestId(T.card.matchCaveat(this.id));
  feedbackCounts = () => this.page.getByTestId(T.card.feedbackCounts(this.id));
  photoOrPlaceholder = () =>
    this.page
      .getByTestId(T.card.photo(this.id))
      .or(this.page.getByTestId(T.card.photoPlaceholder(this.id)));

  /** 0..3 from "No heat / Mild / Medium / Hot". */
  spice = () => labelIndex(this.page.getByTestId(T.card.spice(this.id)), SPICE_LABELS);
  /** 1..3 from "Familiar / A little new / Adventurous". */
  adventurousness = async () =>
    1 +
    (await labelIndex(
      this.page.getByTestId(T.card.adventurousness(this.id)),
      ADVENTUROUSNESS_LABELS,
    ));

  async price() {
    return parsePrice(await this.page.getByTestId(T.card.price(this.id)).innerText());
  }

  /** [accurate, notAccurate] from "N diners found this accurate, M didn't"; [0,0] when absent. */
  async feedbackCountValues(): Promise<[number, number]> {
    if ((await this.feedbackCounts().count()) === 0) return [0, 0];
    const nums = (await this.feedbackCounts().innerText()).match(/\d+/g) ?? [];
    return [Number(nums[0] ?? 0), Number(nums[1] ?? 0)];
  }

  async score(): Promise<number | null> {
    if ((await this.matchScore().count()) === 0) return null;
    const m = (await this.matchScore().innerText()).match(/\d+/);
    return m ? Number(m[0]) : null;
  }

  async addToOrder() {
    await this.page.getByTestId(T.card.add(this.id)).click();
  }

  async openFeedback() {
    await this.page.getByTestId(T.card.feedback(this.id)).click();
    const f = new FeedbackPage(this.page);
    await expect(f.screen()).toBeVisible();
    return f;
  }

  /** Comprehension content is always visible on the card, without a tap (CLAUDE.md §2.1-2.4). */
  async expectComprehension(nativeName: string) {
    await expect(this.name()).toBeVisible();
    expect(norm(await this.name().innerText())).toBe(norm(nativeName));
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
    await expect(this.matchUnrated()).toBeVisible();
    await expect(this.matchUnrated()).toContainText(UNRATED_TEXT);
    await expect(this.matchScore()).toHaveCount(0);
  }

  async expectScored() {
    await expect(this.matchScore()).toBeVisible();
    await expect(this.matchScore()).toHaveText(/\b\d{1,3}\b/);
    await expect(this.matchState()).toBeVisible();
    await expect(this.matchUnrated()).toHaveCount(0);
  }

  async expectAiLabel() {
    await expect(this.source()).toBeVisible();
    await expect(this.source()).toContainText(AI_SOURCE_LABEL);
  }
}

export class RestaurantPage {
  constructor(readonly page: Page) {}
  readonly screen = () => this.page.getByTestId(T.restaurant.screen);

  goto(id: string) {
    return this.page.goto(ROUTES.restaurant(id));
  }

  /** Dish ids in on-screen order. */
  cardIds() {
    return idsWithPrefix(this.page, T.card.namePrefix);
  }

  cardCount() {
    return this.page.locator(`[data-testid^="${T.card.namePrefix}"]`).count();
  }

  async cardNames(): Promise<string[]> {
    return (await this.page.locator(`[data-testid^="${T.card.namePrefix}"]`).allInnerTexts()).map(
      (n) => n.trim(),
    );
  }

  card(id: string) {
    return new DishCardPO(this.page, id);
  }

  /** Card by native name (for restaurants created in the test, whose ids we don't know). */
  async cardByName(nativeName: string): Promise<DishCardPO> {
    const ids = await this.cardIds();
    const names = await this.cardNames();
    const i = names.findIndex((n) => norm(n) === norm(nativeName));
    if (i < 0) throw new Error(`no card named ${nativeName}; cards: ${names.join(', ')}`);
    return this.card(ids[i]!);
  }

  async toggleSortByMatch() {
    await this.page.getByTestId(T.restaurant.sortToggle).click();
    await expect(this.page.getByTestId(T.restaurant.sortToggle)).toContainText(/sorted by/i);
  }

  shortlistBar = () => this.page.getByTestId(T.shortlist.bar);
  async shortlistTotal() {
    return parsePrice(await this.page.getByTestId(T.shortlist.total).innerText());
  }
  async shortlistCount() {
    const m = (await this.page.getByTestId(T.shortlist.count).innerText()).match(/\d+/);
    return m ? Number(m[0]) : 0;
  }
}

export class FeedbackPage {
  constructor(readonly page: Page) {}
  readonly screen = () => this.page.getByTestId(T.feedback.screen);

  async submit(answers: { accurate?: boolean; liked?: boolean; tastesLike?: string }) {
    const f = T.feedback;
    if (answers.accurate !== undefined)
      await this.page.getByTestId(answers.accurate ? f.accurateYes : f.accurateNo).click();
    if (answers.liked !== undefined)
      await this.page.getByTestId(answers.liked ? f.likedYes : f.likedNo).click();
    if (answers.tastesLike !== undefined)
      await this.page.getByTestId(f.tastesLike).fill(answers.tastesLike);
    const posted = this.page.waitForResponse(
      (r) => /\/dishes\/[^/]+\/feedback/.test(r.url()) && r.request().method() === 'POST',
    );
    await this.page.getByTestId(f.submit).click();
    expect((await posted).ok(), 'POST /dishes/:id/feedback').toBe(true);
    await expect(this.page.getByTestId(f.success)).toBeVisible();
    await this.page.getByTestId(f.done).click();
    const r = new RestaurantPage(this.page);
    await expect(r.screen()).toBeVisible();
    return r;
  }
}

export class ScanPage {
  constructor(readonly page: Page) {}
  readonly screen = () => this.page.getByTestId(T.scan.screen);

  /** Picks an image through the web file chooser and waits for the review screen. */
  async uploadFromLibrary(filePath: string) {
    const [chooser] = await Promise.all([
      this.page.waitForEvent('filechooser'),
      this.page.getByTestId(T.scan.library).click(),
    ]);
    await chooser.setFiles(filePath);
    const review = new ReviewPage(this.page);
    await expect(review.screen().or(this.page.getByTestId(T.scan.error))).toBeVisible({
      timeout: 180_000,
    });
    await expect(this.page.getByTestId(T.scan.error), 'scan error shown').toHaveCount(0);
    return review;
  }
}

export class ReviewPage {
  constructor(readonly page: Page) {}
  readonly screen = () => this.page.getByTestId(T.review.screen);

  /** tempIds of the active (non-discarded) rows, in order. */
  tempIds() {
    return idsWithPrefix(this.page, T.review.namePrefix);
  }

  async names(): Promise<string[]> {
    return this.page
      .locator(`[data-testid^="${T.review.namePrefix}"]`)
      .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value ?? ''));
  }

  /** tempId of the active row whose name input satisfies `match`. */
  async tempIdWhere(match: (name: string) => boolean): Promise<string> {
    const [ids, names] = [await this.tempIds(), await this.names()];
    const i = names.findIndex(match);
    if (i < 0) throw new Error(`no review row matched; rows: ${names.join(', ')}`);
    return ids[i]!;
  }

  badge(tempId: string) {
    return this.page.getByTestId(T.review.badge(tempId));
  }

  async rename(tempId: string, newName: string) {
    await this.page.getByTestId(T.review.name(tempId)).fill(newName);
  }

  async discard(tempId: string) {
    await this.page.getByTestId(T.review.discard(tempId)).click();
    await expect(this.page.getByTestId(T.review.discarded(tempId))).toBeVisible();
    await expect(this.page.getByTestId(T.review.item(tempId))).toHaveCount(0);
  }

  async restore(tempId: string) {
    await this.page.getByTestId(T.review.restore(tempId)).click();
    await expect(this.page.getByTestId(T.review.item(tempId))).toBeVisible();
    await expect(this.page.getByTestId(T.review.discarded(tempId))).toHaveCount(0);
  }

  async addManual(name: string, price: string): Promise<string> {
    const before = new Set(await this.tempIds());
    await this.page.getByTestId(T.review.addManual).click();
    await expect.poll(async () => (await this.tempIds()).length).toBe(before.size + 1);
    const tempId = (await this.tempIds()).find((id) => !before.has(id))!;
    expect(tempId).toMatch(/^manual-\d+$/);
    await this.page.getByTestId(T.review.name(tempId)).fill(name);
    await this.page.getByTestId(T.review.price(tempId)).fill(price);
    await expect(this.badge(tempId)).toContainText(/manual entry/i);
    return tempId;
  }

  async save(restaurantName: string, cuisine: string) {
    await this.page.getByTestId(T.review.restaurantName).fill(restaurantName);
    await this.page.getByTestId(T.review.cuisine).fill(cuisine);
    await this.page.getByTestId(T.review.save).click();
    const r = new RestaurantPage(this.page);
    await expect(r.screen().or(this.page.getByTestId(T.review.saveError))).toBeVisible({
      timeout: 240_000,
    });
    await expect(this.page.getByTestId(T.review.saveError), 'save error shown').toHaveCount(0);
    return r;
  }
}
