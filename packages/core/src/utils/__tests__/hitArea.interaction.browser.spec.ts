// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hitArea.interaction.browser.spec.ts
 * @input The built Switch story, a phone-sized touch context and a mouse
 *   context, and a layer held at half size while the switch's first
 *   measurement runs
 * @output Proves that a control measured while its layer opens from a smaller
 *   scale keeps the insets of the size the layer settles at, under a finger,
 *   and that a mouse page writes no insets
 * @position The browser layer of utils/hitArea.ts; the pure model is
 *   hitArea.test.ts
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

/** The switch's written insets, in the order top, right, bottom, left. */
async function insets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>(
      '#storybook-root [role="switch"]',
    )?.parentElement;
    return ['top', 'right', 'bottom', 'left'].map(
      side =>
        surface?.style.getPropertyValue(`--astryx-hit-inset-${side}`) ?? '',
    );
  });
}

/** Waits for two frames, the time a pending measurement takes. */
async function frames(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

/**
 * Holds the story's root at half size from the first frame, as a layer that
 * opens from a smaller scale is during its first measurement.
 */
async function holdHalfSize(page: Page): Promise<void> {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.id = 'opening-layer';
      style.textContent =
        '#storybook-root { transform: scale(0.5); transform-origin: 0 0; }';
      document.head.append(style);
    });
  });
}

test('a switch measured while its layer opens from half size keeps the insets of the settled layout', async ({
  page,
}) => {
  await holdHalfSize(page);
  await openStory(page, storybook(), 'core-switch--default');
  await page.waitForFunction(
    () =>
      (document
        .querySelector<HTMLElement>('#storybook-root [role="switch"]')
        ?.parentElement?.style.getPropertyValue('--astryx-hit-inset-top') ??
        '') !== '',
  );
  // The layer settles at full size. Nothing about the switch's own box
  // changes, so nothing measures it again.
  await page.evaluate(() => document.getElementById('opening-layer')?.remove());
  await frames(page);
  const settled = await insets(page);
  // A measurement of the settled page: a window resize measures every control.
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await frames(page);
  expect(settled).toEqual(await insets(page));
});

test('a mouse page writes no insets, at half size or settled', async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: false,
    isMobile: false,
    deviceScaleFactor: 1,
    viewport: {width: 480, height: 320},
  });
  try {
    const page = await context.newPage();
    await holdHalfSize(page);
    await openStory(page, storybook(), 'core-switch--default');
    await frames(page);
    expect(await insets(page)).toEqual(['', '', '', '']);
    await page.evaluate(() =>
      document.getElementById('opening-layer')?.remove(),
    );
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await frames(page);
    expect(await insets(page)).toEqual(['', '', '', '']);
  } finally {
    await context.close();
  }
});
