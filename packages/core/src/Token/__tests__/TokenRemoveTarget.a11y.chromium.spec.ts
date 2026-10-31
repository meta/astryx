// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file TokenRemoveTarget.a11y.chromium.spec.ts
 * @input The `Core/PowerSearch` Pre-set Filters story in a built Storybook and
 *   real mouse input, in both text directions.
 * @output Real-engine proof that a Token's enlarged remove target stays on its
 *   X: a press on the end of the value beside it runs the token's own action,
 *   and a press just outside the visible X still removes.
 * @position Run with `pnpm test:a11y-contract`. jsdom has no hit testing, so
 *   the remove target's reach is only observable here.
 */

import {expect, test, type Page} from '@playwright/test';
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

const STORY = 'core-powersearch--with-preset-filters';
const REMOVE_BUTTONS = '#storybook-root button[aria-label^="Remove "]';

async function open(page: Page, direction: 'ltr' | 'rtl') {
  await page.setViewportSize({width: 900, height: 600});
  await page.goto(
    `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story&globals=direction:${direction}`,
  );
  await expect(page.locator(REMOVE_BUTTONS)).toHaveCount(2);
  const remove = page.locator(REMOVE_BUTTONS).first();
  const value = page
    .locator('#storybook-root')
    .getByText('Open', {exact: true})
    .first();
  const x = await remove.boundingBox();
  const v = await value.boundingBox();
  if (x == null || v == null) {
    throw new Error('the Status token has no visible value or remove button');
  }
  return {remove, x, v};
}

for (const direction of ['ltr', 'rtl'] as const) {
  test(`a press on the end of the value opens its editor (${direction})`, async ({
    page,
  }) => {
    const {x, v} = await open(page, direction);
    // Two pixels inside the value's inline-end edge, level with the X.
    const px = direction === 'ltr' ? v.x + v.width - 2 : v.x + 2;
    const py = x.y + x.height / 2;
    // Precondition: the point is on the value, not on the visible X.
    expect(px < x.x || px > x.x + x.width).toBe(true);

    await page.mouse.click(px, py);

    await expect(page.getByRole('combobox', {name: 'Field'})).toBeVisible();
    await expect(page.locator(REMOVE_BUTTONS)).toHaveCount(2);
  });

  test(`a press just outside the visible X still removes (${direction})`, async ({
    page,
  }) => {
    const {x} = await open(page, direction);
    // Two pixels past the X's inline-end edge: outside the 16px glyph, inside
    // the enlarged target.
    const px = direction === 'ltr' ? x.x + x.width + 2 : x.x - 2;
    const py = x.y + x.height / 2;

    await page.mouse.click(px, py);

    await expect(page.locator(REMOVE_BUTTONS)).toHaveCount(1);
    await expect(page.getByRole('combobox', {name: 'Field'})).toHaveCount(0);
  });
}
