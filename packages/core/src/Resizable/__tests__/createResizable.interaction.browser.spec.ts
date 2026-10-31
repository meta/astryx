// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createResizable.interaction.browser.spec.ts
 * @input Uses @playwright/test and the interaction harness (a built
 *   Storybook): createResizable's story, a plain divider beside an embedded
 *   frame
 * @output Proves a createResizable handle holds its pointer for the whole
 *   drag: a drag that crosses an embedded frame keeps resizing, comes back,
 *   and ends at the release, in Chromium and WebKit
 * @position Interaction proof for packages/core/src/Resizable/createResizable.ts
 *   and resizeGesture.ts (component:Resizable FR3; spec:AST-107 FR6)
 *
 * Without pointer capture the browser hit-tests every move, and a move over
 * the frame goes to the frame's own document: the drag would stop the moment
 * the pointer crossed it.
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const STORY = 'core-hooks-createresizable--with-embedded-frame';

/** The separator's reported size. */
async function valueNow(handle: Locator): Promise<number> {
  return Number(await handle.getAttribute('aria-valuenow'));
}

/** The center of an element, in page coordinates. */
async function center(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error(`${String(locator)} has no box`);
  }
  return {x: box.x + box.width / 2, y: box.y + box.height / 2, box};
}

test('a drag on a createResizable handle keeps resizing across an embedded frame, and ends at the release', async ({
  page,
}) => {
  await openStory(page, storybook(), STORY);
  const handle = page.getByRole('separator', {name: 'Resize sidebar'});
  await expect(handle).toHaveAttribute('aria-valuenow', '160');
  const sidebar = page.getByTestId('sidebar');
  const frame = page.locator('iframe[title="Preview"]');

  const start = await center(page, handle);
  const frameBox = (await center(page, frame)).box;
  // Well inside the frame, and within the region's 320px maximum.
  const inside = frameBox.x + 60;
  expect(inside - start.x).toBeLessThan(320 - 160);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await expect(handle).toHaveAttribute('data-resizing', '');
  await page.mouse.move(inside, start.y, {steps: 8});
  // Over the frame, the moves still reach the handle that holds the pointer.
  expect(await valueNow(handle)).toBeCloseTo(160 + (inside - start.x), 0);
  expect((await sidebar.boundingBox())?.width).toBeCloseTo(
    160 + (inside - start.x),
    0,
  );

  // Back out of the frame, and release.
  await page.mouse.move(start.x + 20, start.y, {steps: 8});
  expect(await valueNow(handle)).toBeCloseTo(180, 0);
  await page.mouse.up();
  await expect(handle).not.toHaveAttribute('data-resizing');

  // After the release, the pointer is the page's again: a move over the
  // frame resizes nothing.
  await page.mouse.move(inside, start.y, {steps: 4});
  expect(await valueNow(handle)).toBeCloseTo(180, 0);
  expect(await page.evaluate(() => document.body.style.cursor)).toBe('');
});
