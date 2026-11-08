// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/Selector/ ^packages/core/src/privateAttributes/focusOwner ^packages/core/src/utils/focusOutline ^apps/storybook/stories/Selector

/**
 * @file FocusRingOwner.a11y.chromium.spec.ts
 * @input The built ghost and secondary Selector "Clearable" stories in real
 *   Chromium, focus moved with Tab, at desktop and phone widths
 * @output Browser evidence for `architecture:interaction-modality` INV3: each
 *   tab stop in a Selector trigger shows exactly one focus ring. The trigger
 *   box rings for the trigger button only; the clear button rings itself, and
 *   the box stays unringed
 * @position Regression proof for focusWithinOwner in Selector
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {ringedElements} from './focusRings';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

async function open(page: Page, story: string, width: number, args = '') {
  await page.setViewportSize({width, height: 600});
  await page.goto(
    `${storybook.origin}/iframe.html?id=${story}&viewMode=story${args}`,
  );
  await page
    .locator('#storybook-root button, #storybook-root a')
    .first()
    .waitFor();
}

/** Tabs through every stop, returning the rings painted at each. */
async function ringsAtEachStop(page: Page, stops: number) {
  const out: {focused: string; rings: string[]}[] = [];
  for (let i = 0; i < stops; i += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(
      () =>
        document.activeElement?.getAttribute('aria-label') ??
        (document.activeElement?.textContent ?? '').trim().slice(0, 30),
    );
    const rings = (await ringedElements(page)).map(ring => ring.description);
    out.push({focused, rings});
  }
  return out;
}

for (const width of [1280, 390]) {
  for (const variant of ['ghost', 'secondary']) {
    for (const component of ['selector']) {
      test(`at ${width} px, each tab stop in a ${variant} ${component} with a clear button shows one ring`, async ({
        page,
      }) => {
        await open(
          page,
          `core-${component}--clearable`,
          width,
          `&args=variant:${variant}`,
        );
        // The trigger, then its clear button.
        for (const {focused, rings} of await ringsAtEachStop(page, 2)) {
          expect(rings, `rings while "${focused}" is focused`).toHaveLength(1);
        }
      });
    }
  }
}
