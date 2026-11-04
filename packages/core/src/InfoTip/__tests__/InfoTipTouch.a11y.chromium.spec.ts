// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file InfoTipTouch.a11y.chromium.spec.ts
 * @input The built Storybook's Core/InfoTip stories in Chromium, with a fine
 *   and a coarse primary pointer
 * @output Proofs that under a coarse pointer the info button takes taps out
 *   toward 44 px and stops halfway to a neighbouring button, and grows nothing
 *   under a fine pointer (component:InfoTip AR1)
 * @position Browser test for InfoTip.tsx's hit area; the geometry itself is
 *   utils/hitArea.ts's, unit-tested there
 */

import {expect, test, type Browser, type Page} from '@playwright/test';
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

test('under a coarse pointer the info button takes taps out toward 44 px', async ({
  browser,
}) => {
  const page = await pageWith(browser, 'coarse');
  await openStory(page, 'default');
  const {button, box} = await infoButton(page);
  expect(box.width).toBeLessThan(MIN_TOUCH_TARGET);
  // The shared hit area measures in its next frame pass.
  await expect
    .poll(async () =>
      button.evaluate(element =>
        Number.parseFloat(
          getComputedStyle(element).getPropertyValue('--astryx-hit-inset-left'),
        ),
      ),
    )
    .toBeGreaterThan(0);
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const reach = MIN_TOUCH_TARGET / 2;
  for (const [dx, dy] of [
    [-(reach - 1), 0],
    [reach - 1, 0],
    [0, -(reach - 1)],
    [0, reach - 1],
  ]) {
    expect(
      await hitsButton(page, centerX + dx, centerY + dy),
      `a tap ${dx}, ${dy} px from the center`,
    ).toBe(true);
  }
  // No further than 44 px across.
  expect(await hitsButton(page, centerX - (reach + 2), centerY)).toBe(false);
  expect(await hitsButton(page, centerX + reach + 2, centerY)).toBe(false);
});

test('the hit area stops halfway to a neighbouring button', async ({
  browser,
}) => {
  const page = await pageWith(browser, 'coarse');
  await openStory(page, 'sizes');
  const buttons = page.locator('#storybook-root').getByRole('button');
  await expect(buttons).toHaveCount(4);
  const boxes = await Promise.all(
    [0, 1, 2, 3].map(async index => buttons.nth(index).boundingBox()),
  );
  for (const box of boxes) {
    expect(box, 'each info button has a layout box').not.toBeNull();
    expect(box?.width ?? 0).toBeGreaterThan(0);
  }
  await expect
    .poll(async () =>
      buttons
        .first()
        .evaluate(element =>
          Number.parseFloat(
            getComputedStyle(element).getPropertyValue(
              '--astryx-hit-inset-top',
            ),
          ),
        ),
    )
    .toBeGreaterThan(0);
  // Which of the four buttons a tap at (x, y) lands on, or -1.
  const hitIndex = async (x: number, y: number) =>
    page.evaluate(
      ([px, py]) => {
        const all = Array.from(
          document.querySelectorAll('#storybook-root button'),
        );
        const hit = document.elementFromPoint(px, py)?.closest('button');
        return hit == null ? -1 : all.indexOf(hit);
      },
      [x, y] as const,
    );
  for (let index = 0; index < 3; index += 1) {
    const left = boxes[index];
    const right = boxes[index + 1];
    if (left == null || right == null) {
      throw new Error('unreachable');
    }
    const gap = right.x - (left.x + left.width);
    expect(gap, 'the buttons sit apart').toBeGreaterThan(4);
    const middle = left.x + left.width + gap / 2;
    const y = left.y + left.height / 2;
    // Each side of the middle belongs to the nearer button.
    expect(await hitIndex(middle - 1, y)).toBe(index);
    expect(await hitIndex(middle + 1, y)).toBe(index + 1);
  }
});

test('under a fine pointer the info button grows nothing', async ({
  browser,
}) => {
  const page = await pageWith(browser, 'fine');
  await openStory(page, 'default');
  const {button, box} = await infoButton(page);
  // Give the shared hit area the frames it would take to measure.
  await page.evaluate(async () => {
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
  // Unset, or 0 where the shared hit area answers a fine pointer.
  expect(
    await button.evaluate(element =>
      Number.parseFloat(
        getComputedStyle(element).getPropertyValue('--astryx-hit-inset-left') ||
          '0',
      ),
    ),
  ).toBe(0);
  const centerY = box.y + box.height / 2;
  expect(await hitsButton(page, box.x + 1, centerY)).toBe(true);
  expect(await hitsButton(page, box.x - 2, centerY)).toBe(false);
});
