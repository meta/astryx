// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope richtext/* ^(apps/storybook/stories/RichTextEditor\.stories|packages/richtext/src/__tests__/RichTextDisabledLinks) ^packages/richtext/src/

/**
 * @file RichTextDisabledLinks.a11y.chromium.spec.ts
 * @input The built Storybook's "Disabled with a link" RichTextEditor story.
 * @output Real-browser proof that a link in a disabled editor is inert: the
 *   pointer gets no link cursor, a click does not navigate, and Tab does not
 *   stop on the link.
 *
 * Run after building Storybook:
 *   pnpm storybook:build
 *   pnpm exec playwright test packages/richtext --project chromium
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORYBOOK_DIR = process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR;
const STORY = 'richtext-richtexteditor--disabled-with-link';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(STORYBOOK_DIR);
});

test.afterAll(async () => {
  await storybook?.close();
});

test('a link in a disabled editor shows no link cursor, does not navigate, and is not a tab stop', async ({
  page,
}) => {
  const url = `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story&globals=astryxTheme:neutral;colorMode:light`;
  await page.goto(url, {waitUntil: 'load'});
  const link = page.getByText('the guide');
  await expect(link).toBeVisible();

  // The element under the pointer decides the cursor the person sees.
  const hit = await link.evaluate(element => {
    const box = element.getBoundingClientRect();
    const target = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    );
    return {
      isLink: target?.closest('a') != null,
      cursor: target == null ? '' : getComputedStyle(target).cursor,
    };
  });
  expect(hit.isLink, 'the pointer does not reach the link').toBe(false);
  expect(hit.cursor).not.toBe('pointer');

  // Storybook rewrites the address while the story loads, so compare with
  // the address the page settled on.
  const before = page.url();
  await link.click({force: true});
  await expect(page).toHaveURL(before);
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(before);

  const tabStops: string[] = [];
  for (let step = 0; step < 6; step++) {
    await page.keyboard.press('Tab');
    tabStops.push(
      await page.evaluate(() => document.activeElement?.tagName ?? ''),
    );
  }
  expect(tabStops).not.toContain('A');
});
