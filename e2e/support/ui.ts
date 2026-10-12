import { expect, type Page } from '@playwright/test';
import { LibraryPage, OnboardingPage, type ProfileInput } from '../pages/index.ts';
import { ROUTES, T } from './testids.ts';

/**
 * Opens the app as a brand-new anonymous diner (fresh browser context = no token)
 * and gets through onboarding, either skipping it or answering it.
 */
export async function startAsNewDiner(
  page: Page,
  onboarding: 'skip' | ProfileInput = 'skip',
): Promise<LibraryPage> {
  await page.goto(ROUTES.root);
  const ob = new OnboardingPage(page);
  if (onboarding === 'skip') await ob.skip();
  else await ob.complete(onboarding);
  const lib = new LibraryPage(page);
  await expect(lib.screen()).toBeVisible();
  // The e2e stack must talk to the real API, never the app's built-in mock.
  await expect(page.getByTestId(T.library.mockNotice)).toHaveCount(0);
  return lib;
}

/** Fails the test on uncaught page errors, which usually mean a broken web build. */
export function failOnPageErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return () => expect(errors, 'uncaught errors in the web app').toEqual([]);
}
