// Renders the HTML menus in fixtures/src/ to PNG "photos" in fixtures/.
// Run with `npm run fixtures -w e2e` after `npm run install:browsers -w e2e`.
// Also writes fixtures/expected.json listing the dish names each image contains.
import { readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { FIXTURES_DIR } from '../support/env.ts';

const srcDir = path.join(FIXTURES_DIR, 'src');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 });
const expected: Record<string, { restaurant: string; dishes: string[] }> = {};

for (const file of readdirSync(srcDir).filter((f) => f.endsWith('.html'))) {
  const url = `file://${path.join(srcDir, file).replace(/\\/g, '/')}`;
  await page.goto(url);
  const out = file.replace(/\.html$/, '.png');
  await page.screenshot({ path: path.join(FIXTURES_DIR, out), fullPage: true });
  expected[out] = await page.evaluate(() => ({
    restaurant: document.querySelector('h1')?.textContent?.trim() ?? '',
    dishes: [...document.querySelectorAll('.item > span:first-child')].map(
      (s) => s.textContent?.trim() ?? '',
    ),
  }));
  console.log(`rendered ${out}`);
}

writeFileSync(path.join(FIXTURES_DIR, 'expected.json'), JSON.stringify(expected, null, 2) + '\n');
await browser.close();
