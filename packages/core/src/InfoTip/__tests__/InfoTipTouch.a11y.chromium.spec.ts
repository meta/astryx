// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file InfoTipTouch.a11y.chromium.spec.ts
 * @input The built Storybook's Core/InfoTip stories in Chromium, with a fine
 *   and a coarse primary pointer
 * @output Proofs that under a coarse pointer the info button takes taps
 *   toward 44 px up and down and none sideways, and grows nothing under a
 *   fine pointer (component:InfoTip AR1)
 * @position Browser test for InfoTip.tsx's touch band
 *   (internal/touchHitArea.stylex.ts)
 */

import {
  expect,
  test,
  type Browser,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const MIN_TOUCH_TARGET = 44;
let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

async function pageWith(
  browser: Browser,
  pointer: 'coarse' | 'fine',
): Promise<Page> {
  const context = await browser.newContext(
    pointer === 'coarse'
      ? {hasTouch: true, isMobile: true, viewport: {width: 402, height: 874}}
      : {viewport: {width: 1024, height: 768}},
  );
  return context.newPage();
}

async function openStory(page: Page, story: string): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-infotip--${story}&viewMode=story&globals=astryxTheme:neutral;colorMode:light;direction:ltr`,
    {waitUntil: 'load'},
  );
  // The story has rendered once its button is in the document, however long
  // a loaded machine takes to boot the preview.
  await page
    .locator('#storybook-root')
    .getByRole('button')
    .first()
    .waitFor({state: 'attached'});
}

/** The one info button, present and painted, and its box. */
async function infoButton(page: Page) {
  const button = page.getByRole('button', {name: /./});
  await expect(button).toHaveCount(1);
  const box = await button.boundingBox();
  expect(box, 'the info button has a layout box').not.toBeNull();
  if (box == null) {
    throw new Error('unreachable');
  }
  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeGreaterThan(0);
  return {button, box};
}

/** Whether a tap at (x, y) would land on the info button. */
async function hitsButton(page: Page, x: number, y: number): Promise<boolean> {
  return page.evaluate(
    ([px, py]) => {
      const hit = document.elementFromPoint(px, py);
      return hit?.closest('button') != null;
    },
    [x, y] as const,
  );
}

/** How far the button's band reaches past its box on each side, px. */
async function bandReach(page: Page) {
  return page
    .locator('#storybook-root')
    .getByRole('button')
    .first()
    .evaluate(element => {
      const band = getComputedStyle(element, '::after');
      const read = (side: 'top' | 'right' | 'bottom' | 'left') =>
        band.position === 'absolute'
          ? Math.max(0, -(Number.parseFloat(band[side]) || 0))
          : 0;
      return {
        top: read('top'),
        right: read('right'),
        bottom: read('bottom'),
        left: read('left'),
      };
    });
}

test('under a coarse pointer the info button takes taps toward 44 px up and down, and none sideways', async ({
  browser,
}) => {
  const page = await pageWith(browser, 'coarse');
  await openStory(page, 'default');
  const {box} = await infoButton(page);
  expect(box.height).toBeLessThan(MIN_TOUCH_TARGET);
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const reach = MIN_TOUCH_TARGET / 2;
  expect(await hitsButton(page, centerX, centerY - (reach - 1))).toBe(true);
  expect(await hitsButton(page, centerX, centerY + (reach - 1))).toBe(true);
  // No further than 44 px tall.
  expect(await hitsButton(page, centerX, centerY - (reach + 2))).toBe(false);
  // It sits in running text, so it grows no room sideways.
  expect(await hitsButton(page, box.x - 2, centerY)).toBe(false);
  expect(await hitsButton(page, box.x + box.width + 2, centerY)).toBe(false);
});

test('in a divided List row’s end slot the info button grows no taller, and the row’s divider stays on the row', async ({
  browser,
}) => {
  const page = await pageWith(browser, 'coarse');
  await openStory(page, 'in-a-divided-list');
  const buttons = page.locator('#storybook-root').getByRole('button');
  await expect(buttons).toHaveCount(2);
  const box = await buttons.first().boundingBox();
  expect(box?.height ?? 0).toBeGreaterThan(0);
  const reach = await bandReach(page);
  const inheritedDivider = await buttons
    .first()
    .evaluate(element =>
      getComputedStyle(element)
        .getPropertyValue('--_hit-border-block-end')
        .trim(),
    );
  // The row's divider width stays on the row's own band.
  expect(inheritedDivider).toBe('');
  // In the row's end slot the row's edge is the boundary: the row takes the
  // taps above and below the button.
  expect(reach.top).toBeCloseTo(0, 1);
  expect(reach.bottom).toBeCloseTo(0, 1);
});

test('under a fine pointer the info button grows nothing', async ({
  browser,
}) => {
  const page = await pageWith(browser, 'fine');
  await openStory(page, 'default');
  const {box} = await infoButton(page);
  expect(await bandReach(page)).toEqual({top: 0, right: 0, bottom: 0, left: 0});
  const centerY = box.y + box.height / 2;
  expect(await hitsButton(page, box.x + 1, centerY)).toBe(true);
  expect(await hitsButton(page, box.x - 2, centerY)).toBe(false);
});
