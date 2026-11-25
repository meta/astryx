// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TransferListEmptySearch.a11y.chromium.spec.ts
 * @input The checked-in Core/TransferList › Empty story in a built Storybook:
 *   its second list searches with a custom emptySearchText
 * @output Real-engine evidence that a search that matches nothing announces,
 *   once, the words the panels show, and never a count of zero; a search
 *   that matches announces its count
 * @position Browser binding for TransferList's empty-search announcement. jsdom
 *   proves the wiring; only a shipping engine shows the live region a screen
 *   reader reads
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

const politeRegion = '[data-astryx-live-region="polite"]';
const message = 'No field matches that search.';

declare global {
  interface Window {
    __politeTexts?: string[];
  }
}

test.beforeEach(async ({page}) => {
  await page.addInitScript(region => {
    window.__politeTexts = [];
    new MutationObserver(() => {
      const text = document.querySelector(region)?.textContent?.trim() ?? '';
      const texts = window.__politeTexts ?? [];
      if (text !== '' && texts.at(-1) !== text) {
        texts.push(text);
      }
    }).observe(document, {subtree: true, childList: true, characterData: true});
  }, politeRegion);
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-transferlist--empty&viewMode=story`,
    {waitUntil: 'load'},
  );
  await page.getByRole('searchbox', {name: 'Search report fields'}).waitFor();
});

test('announces the words the panels show for a search that matches nothing', async ({
  page,
}) => {
  await page.getByRole('searchbox', {name: 'Search report fields'}).fill('zzz');

  const list = page.getByRole('group', {name: 'Report fields'});
  await expect(list.getByText(message)).toHaveCount(2);
  await expect(page.locator(politeRegion)).toHaveText(message);
});

test('announces a count for a match, then the message once, and never a count of zero', async ({
  page,
}) => {
  const search = page.getByRole('searchbox', {name: 'Search report fields'});
  await search.fill('Own');
  await expect(page.locator(politeRegion)).toHaveText('2 items found.');
  await search.fill('zzz');
  await expect(page.locator(politeRegion)).toHaveText(message);

  await expect
    .poll(async () => page.evaluate(() => window.__politeTexts ?? []))
    .toEqual(['2 items found.', message]);
});
