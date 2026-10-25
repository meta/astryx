// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file MenuPressShadowRoot.a11y.chromium.spec.ts
 * @input The `a11y/Menu press in a shadow root` story in a built Storybook and
 *   real mouse input.
 * @output Real-engine proof that a menu rendered inside a shadow root acts on
 *   the row under a released pointer (module:DropdownMenu/useMenuPress FR1).
 * @position Run with `pnpm test:a11y-contract`. Only a real engine resolves a
 *   point inside a shadow root to the shadow host at the document level.
 */

import {expect, test} from '@playwright/test';
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

const STORY = 'a11y-menu-press-in-a-shadow-root--selector-in-shadow-root';

test('a mouse click on an option inside a shadow root selects it', async ({
  page,
}) => {
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  // Playwright's role locators pierce open shadow roots.
  await page.getByRole('combobox', {name: 'Fruit'}).click();
  const option = page.getByRole('option', {name: 'Banana'});
  await expect(option).toBeVisible();
  const box = await option.boundingBox();
  if (box == null) {
    throw new Error('the Banana option has no layout box');
  }

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await expect(page.getByTestId('selected-value')).toHaveText('Banana');
});
