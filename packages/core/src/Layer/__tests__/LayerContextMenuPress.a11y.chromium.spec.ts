// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/Layer

/**
 * @file LayerContextMenuPress.a11y.chromium.spec.ts
 * @input The `Core/Layer` ContextMenuPressOpensALayer story in a built
 *   Storybook, driven by real Chromium mouse input.
 * @output Real-engine proof that a light-dismissible layer, and a
 *   DropdownMenu opened through `isMenuOpen`, stay open after the release of
 *   the right-button press whose `contextmenu` opened them, also when that
 *   release lands away from the zone; and that a later press outside still
 *   dismisses them (spec:AST-003 FR11, FR12, FR13). Only a real engine runs
 *   the popover's light dismiss at that release; the unit suite
 *   (useLayer.test.tsx) covers the claim on a stub.
 * @position Run with `pnpm test:a11y-contract`.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
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

async function openStory(page: Page): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-layer--context-menu-press-opens-a-layer&viewMode=story`,
  );
  await expect(page.getByTestId('layer-zone')).toBeVisible();
}

/** A right-button press on `testId`'s center, released at `releaseOffset`. */
async function rightPress(
  page: Page,
  testId: string,
  releaseOffset = {x: 0, y: 0},
): Promise<void> {
  const box = await page.getByTestId(testId).boundingBox();
  if (box == null) {
    throw new Error(`${testId} has no box`);
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down({button: 'right'});
  await page.mouse.move(x + releaseOffset.x, y + releaseOffset.y, {steps: 4});
  await page.mouse.up({button: 'right'});
}

test('a layer opened by a right click stays open after that press’s release', async ({
  page,
}) => {
  await openStory(page);
  await rightPress(page, 'layer-zone');
  await expect(page.getByTestId('layer')).toBeVisible();
  // The layer stays open past the release's own task.
  await page.waitForTimeout(150);
  await expect(page.getByTestId('layer')).toBeVisible();

  // A later press outside is a gesture of its own and dismisses the layer.
  await page.mouse.click(4, 4);
  await expect(page.getByTestId('layer')).toBeHidden();
});

test('the opening press’s release keeps the layer open even away from the zone', async ({
  page,
}) => {
  await openStory(page);
  await rightPress(page, 'layer-zone', {x: 0, y: -60});
  await page.waitForTimeout(150);
  await expect(page.getByTestId('layer')).toBeVisible();
});

test('a DropdownMenu opened through isMenuOpen from a right click stays open after that press’s release', async ({
  page,
}) => {
  await openStory(page);
  await rightPress(page, 'menu-zone');
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await page.waitForTimeout(150);
  await expect(menu).toBeVisible();

  await page.mouse.click(4, 4);
  await expect(menu).toBeHidden();
});
