import { expect, type Page } from '@playwright/test';
import { LibraryPage, OnboardingPage } from '../pages/index.ts';
import { ROUTES } from './testids.ts';

/**
 * Opens the app as a brand-new anonymous diner (fresh browser context = no token)
 * and gets through onboarding, either skipping it or answering it.
 */
export async function startAsNewDiner(
  page: Page,
  onboarding: 'skip' | { spice: number; diets?: string[] } = 'skip',
): Promise<LibraryPage> {
  await page.goto(ROUTES.root);
  const ob = new OnboardingPage(page);
  if (onboarding === 'skip') {
    await ob.skip();
  } else {
    const saved = page.waitForResponse(
      (r) => r.url().includes('/me/taste-profile') && r.request().method() === 'PUT',
    );
    await ob.complete(onboarding);
    expect((await saved).ok(), 'onboarding PUT /me/taste-profile').toBe(true);
  }
  const lib = new LibraryPage(page);
  await expect(lib.screen()).toBeVisible();
  return lib;
}

/** Fails the test on uncaught page errors, which usually mean a broken web build. */
export function failOnPageErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return () => expect(errors, 'uncaught errors in the web app').toEqual([]);
}
