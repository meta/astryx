// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MobileNavWidth.a11y.chromium.spec.ts
 * @input Built MobileNav stories and real Chromium touch input in phone
 *   contexts
 * @output Browser evidence that the drawer is never wider than 85% of the
 *   viewport: on a 320 px phone it leaves a 48 px strip of the page, and a
 *   tap on the strip closes it; on a 402 px phone it keeps its 320 px width
 * @position Chromium proof for MobileNav's width cap (`dynamicStyles.width`
 *   in MobileNav.tsx); the jsdom layer is MobileNav.test.tsx
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

/** Opens the default story's drawer with a tap and waits for the slide-in. */
async function openNav(page: Page) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-mobilenav--default&viewMode=story`,
  );
  await page.getByRole('button', {name: 'Open Navigation'}).tap();
  const nav = page.getByRole('dialog');
  await expect(nav).toBeVisible();
  const drawer = nav.locator('[tabindex="-1"]').first();
  await drawer.evaluate(async element => {
    await Promise.all(element.getAnimations().map(async a => a.finished));
  });
  const box = await drawer.boundingBox();
  const viewport = page.viewportSize();
  if (box == null || viewport == null) {
    throw new Error('the drawer did not render');
  }
  // The backdrop strip is on whichever side the drawer left free.
  const strip =
    box.x > 0.5
      ? {from: 0, to: box.x}
      : {from: box.x + box.width, to: viewport.width};
  return {nav, box, strip, viewport};
}

test.describe('on a 320 px phone', () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: {width: 320, height: 568},
    deviceScaleFactor: 1,
  });

  test('the drawer leaves a strip of the page, and a tap on it closes the drawer', async ({
    page,
  }) => {
    const {nav, box, strip, viewport} = await openNav(page);

    // 85% of 320 px: the default 320 px drawer is capped at 272 px.
    expect(box.width).toBeCloseTo(272, 0);
    expect(strip.to - strip.from).toBeCloseTo(48, 0);

    // The strip is backdrop (the dialog itself), not drawer.
    const at = {x: (strip.from + strip.to) / 2, y: viewport.height / 2};
    expect(
      await page.evaluate(
        ({x, y}) => document.elementFromPoint(x, y)?.tagName.toLowerCase(),
        at,
      ),
    ).toBe('dialog');

    await page.touchscreen.tap(at.x, at.y);
    await expect(nav).toBeHidden();
  });
});

test.describe('on a 402 px phone', () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: {width: 402, height: 714},
    deviceScaleFactor: 1,
  });

  test('the drawer keeps its 320 px width', async ({page}) => {
    const {box, strip} = await openNav(page);

    // 85% of 402 px is 341.7 px: the cap does not bind.
    expect(box.width).toBeCloseTo(320, 0);
    expect(strip.to - strip.from).toBeCloseTo(82, 0);
  });
});
