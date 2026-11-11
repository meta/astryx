// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchHitArea.interaction.browser.spec.ts
 * @input The built "Touch reach" Button story on a phone-sized touch context,
 *   real touch input, and counters on layout reads and observers
 * @output Browser proofs of the touch band (spec:AST-094 FR42): a 24 px
 *   button takes taps 10 px past its edge and not 11 px; a group's 4 px gap
 *   splits at its middle; a tap on a link right before an InfoTip opens the
 *   link, not the tip; and a page reads no layout and starts no observer for
 *   hit areas before a press
 * @position Browser layer of utils/touchHitArea.ts and
 *   internal/touchHitArea.stylex.ts; the unit layer is touchHitArea.test.tsx
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  openStory,
  tap,
  touchDriver,
  withStorybook,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);
const STORY = 'core-button--touch-reach';

async function tapAt(
  driver: TouchDriver,
  at: {x: number; y: number},
): Promise<void> {
  if (driver.engine === 'webkit') {
    await driver.tap(at);
  } else {
    await driver.play(tap(at, {holdMs: 50}));
  }
}

async function boxOf(page: Page, testId: string) {
  return page
    .locator('#storybook-root')
    .getByTestId(testId)
    .evaluate(element => {
      const r = element.getBoundingClientRect();
      return {left: r.left, top: r.top, right: r.right, bottom: r.bottom};
    });
}

/** The test id of the button a tap at (x, y) lands on, or null. */
async function buttonAt(page: Page, x: number, y: number) {
  return page.evaluate(
    ([px, py]) =>
      document.elementFromPoint(px, py)?.closest('button')?.dataset.testid ??
      null,
    [x, y] as const,
  );
}

test.describe('the touch band (spec:AST-094 FR42), under a finger', () => {
  test('a 24 px button takes taps 10 px past its edge, 44 px in all, and not 11 px', async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    const lone = await boxOf(page, 'lone');
    expect(lone.bottom - lone.top).toBeCloseTo(24, 0);
    const x = (lone.left + lone.right) / 2;
    expect(await buttonAt(page, x, lone.top - 9.5)).toBe('lone');
    expect(await buttonAt(page, x, lone.top - 10.5)).toBeNull();
    expect(await buttonAt(page, x, lone.bottom + 9.5)).toBe('lone');
    expect(await buttonAt(page, x, lone.bottom + 10.5)).toBeNull();
    expect(
      await buttonAt(page, lone.left - 9.5, (lone.top + lone.bottom) / 2),
    ).toBe('lone');
    // A real finger 9 px above the edge presses it.
    const driver = await touchDriver(page);
    await tapAt(driver, {x: Math.round(x), y: Math.round(lone.top) - 9});
    await expect(
      page.locator('#storybook-root output[aria-label="Reach taps"]'),
    ).toHaveText('Lone 1, Link 0');
  });

  test('a group’s 4 px gap splits at its middle', async ({page}) => {
    await openStory(page, storybook(), STORY);
    const bold = await boxOf(page, 'bold');
    const italic = await boxOf(page, 'italic');
    const gap = italic.left - bold.right;
    expect(gap).toBeCloseTo(4, 0);
    const middle = bold.right + gap / 2;
    const y = (bold.top + bold.bottom) / 2;
    expect(await buttonAt(page, middle - 0.5, y)).toBe('bold');
    expect(await buttonAt(page, middle + 0.5, y)).toBe('italic');
  });

  test('a tap on a link right before an InfoTip opens the link, not the tip', async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    const link = page.locator('#storybook-root').getByRole('link');
    const tip = page
      .locator('#storybook-root')
      .getByRole('button', {name: 'Pricing help'});
    const linkBox = await link.boundingBox();
    if (linkBox == null) {
      throw new Error('the link has no box');
    }
    const driver = await touchDriver(page);
    // The link's last letter, beside the tip.
    await tapAt(driver, {
      x: Math.floor(linkBox.x + linkBox.width - 2),
      y: Math.round(linkBox.y + linkBox.height / 2),
    });
    await expect(
      page.locator('#storybook-root output[aria-label="Reach taps"]'),
    ).toHaveText('Lone 0, Link 1');
    await expect(tip).toHaveAttribute('aria-expanded', 'false');
  });

  test('reads no layout and starts no observer for hit areas before a press', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const counts = {reads: 0, observers: 0};
      Object.defineProperty(window, '__hitAreaCounts', {value: counts});
      const isHitArea = () =>
        (new Error().stack ?? '').includes('touchHitArea');
      const read = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () {
        if (isHitArea()) {
          counts.reads += 1;
        }
        return read.call(this);
      };
      for (const name of [
        'MutationObserver',
        'ResizeObserver',
        'IntersectionObserver',
      ] as const) {
        const Original = window[name] as unknown as new (
          ...args: never[]
        ) => object;
        Object.defineProperty(window, name, {
          configurable: true,
          value: class extends Original {
            constructor(...args: never[]) {
              super(...args);
              if (isHitArea()) {
                counts.observers += 1;
              }
            }
          },
        });
      }
    });
    await openStory(page, storybook(), STORY);
    await page.evaluate(() => window.scrollBy(0, 200));
    await page.evaluate(
      async () =>
        new Promise<void>(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect(
      await page.evaluate(
        () => (window as unknown as {__hitAreaCounts: object}).__hitAreaCounts,
      ),
    ).toEqual({reads: 0, observers: 0});
    // A finger on the band reads the pressed control at the tap's click.
    const lone = await boxOf(page, 'lone');
    const driver = await touchDriver(page);
    await tapAt(driver, {
      x: Math.round((lone.left + lone.right) / 2),
      y: Math.round(lone.top) - 6,
    });
    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            (window as unknown as {__hitAreaCounts: {reads: number}})
              .__hitAreaCounts.reads,
        ),
      )
      .toBeGreaterThan(0);
  });
});
