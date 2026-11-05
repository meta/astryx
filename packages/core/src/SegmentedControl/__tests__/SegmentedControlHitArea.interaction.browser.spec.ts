// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SegmentedControlHitArea.interaction.browser.spec.ts
 * @input The built "Below a button" SegmentedControl story and real touch
 *   input on a phone-sized touch context
 * @output Browser proofs that a segment's touch target grows toward 44 px
 *   through an invisible band, stops halfway to a neighbor, and changes no
 *   box (spec:AST-094 FR42)
 * @position Browser layer of SegmentedControlItem's hit band and
 *   useSegmentedTouchTracking's lift bounds; the band itself is
 *   utils/touchHitArea.stylex.ts
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

/** The large segment's own height, px: the band adds none. */
const LG_SEGMENT_HEIGHT = 32;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

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

/** Waits until utils/hitArea has written every enabled segment's insets. */
async function waitForHitArea(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '#storybook-root [role="radio"]',
      ),
    ].every(
      segment =>
        segment.style.getPropertyValue('--astryx-hit-inset-top') !== '',
    ),
  );
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const box = (element: Element) => {
      const r = element.getBoundingClientRect();
      return {left: r.left, top: r.top, right: r.right, bottom: r.bottom};
    };
    const inset = (element: HTMLElement, side: string) =>
      Number.parseFloat(
        element.style.getPropertyValue(`--astryx-hit-inset-${side}`) || '0',
      );
    const week = document.querySelector<HTMLElement>(
      '#storybook-root [data-value="week"]',
    )!;
    const button = [
      ...document.querySelectorAll<HTMLElement>('#storybook-root button'),
    ].find(element => element.textContent?.includes('Refresh'))!;
    return {
      week: box(week),
      button: box(button),
      insets: {top: inset(week, 'top'), bottom: inset(week, 'bottom')},
    };
  });
}

const centerX = (box: Box) => (box.left + box.right) / 2;

test.describe('SegmentedControl touch target (spec:AST-094 FR42), under a finger', () => {
  test('a segment’s hit area grows toward 44 px tall, and its box does not change', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-segmentedcontrol--below-a-button');
    await waitForHitArea(page);
    const {week, button, insets} = await measure(page);
    expect(week.bottom - week.top).toBe(LG_SEGMENT_HEIGHT);
    // Below: nothing near, so the band reaches the full 44 px share.
    expect(insets.bottom).toBe((44 - LG_SEGMENT_HEIGHT) / 2);
    // Above: the band stops at half the gap to the button.
    expect(insets.top).toBeLessThanOrEqual((week.top - button.bottom) / 2);
    expect(insets.top).toBeGreaterThan(0);
  });

  test('a tap on the band below a segment selects it', async ({page}) => {
    await openStory(page, storybook(), 'core-segmentedcontrol--below-a-button');
    await waitForHitArea(page);
    const driver = await touchDriver(page);
    const {week, insets} = await measure(page);
    const week$ = page.locator('#storybook-root [data-value="week"]');
    await expect(week$).toHaveAttribute('aria-checked', 'false');
    await tapAt(driver, {x: centerX(week), y: week.bottom + insets.bottom - 2});
    await expect(week$).toHaveAttribute('aria-checked', 'true');
  });

  test('a tap on the band above a segment selects it; a tap past the band, nearer the button, selects nothing; a tap on the button is the button’s', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-segmentedcontrol--below-a-button');
    await waitForHitArea(page);
    const driver = await touchDriver(page);
    const {week, button, insets} = await measure(page);
    const week$ = page.locator('#storybook-root [data-value="week"]');
    const day$ = page.locator('#storybook-root [data-value="day"]');
    const refreshed = page.getByText(/Refreshed \d+ times/);

    // Past the band, in the button's half of the gap: neither takes it.
    await tapAt(driver, {x: centerX(week), y: week.top - insets.top - 2});
    await page.waitForTimeout(400);
    await expect(day$).toHaveAttribute('aria-checked', 'true');
    await expect(refreshed).toHaveText('Refreshed 0 times');

    // On the button: the button's tap, and the selection does not move.
    await tapAt(driver, {x: centerX(week), y: button.bottom - 4});
    await expect(refreshed).toHaveText('Refreshed 1 times');
    await expect(day$).toHaveAttribute('aria-checked', 'true');

    // On the band above the segment: the segment's tap.
    await tapAt(driver, {x: centerX(week), y: week.top - insets.top + 1});
    await expect(week$).toHaveAttribute('aria-checked', 'true');
    await expect(refreshed).toHaveText('Refreshed 1 times');
  });
});
