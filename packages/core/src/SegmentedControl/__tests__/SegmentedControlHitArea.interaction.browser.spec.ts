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
 *   internal/touchHitArea.stylex.ts
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  drag,
  openStory,
  tap,
  touchDriver,
  withStorybook,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

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
    // The first segment sits under the button, so a tap between them is
    // a tap between two targets.
    const segment = document.querySelector<HTMLElement>(
      '#storybook-root [data-value="day"]',
    )!;
    const button = [
      ...document.querySelectorAll<HTMLElement>('#storybook-root button'),
    ].find(element => element.textContent?.includes('Refresh'))!;
    return {
      segment: box(segment),
      button: box(button),
      insets: {top: inset(segment, 'top'), bottom: inset(segment, 'bottom')},
    };
  });
}

const centerX = (box: Box) => (box.left + box.right) / 2;

test.describe('SegmentedControl touch target (spec:AST-094 FR42), under a finger', () => {
  test('a segment’s hit area grows toward 44 px tall without growing its box', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-segmentedcontrol--below-a-button');
    await waitForHitArea(page);
    const {segment, button, insets} = await measure(page);
    // The theme sets the segment's height; the band adds none to its box.
    const height = segment.bottom - segment.top;
    expect(height).toBeLessThan(44);
    // Below: nothing near, so the band reaches the full 44 px share.
    expect(insets.bottom).toBe((44 - height) / 2);
    // Above: the band stops at half the gap to the button.
    expect(insets.top).toBeLessThanOrEqual((segment.top - button.bottom) / 2);
    expect(insets.top).toBeGreaterThan(0);
  });

  test('a drag that lifts past a segment’s band, in the button’s half of the gap, commits nothing', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-segmentedcontrol--below-a-button');
    await waitForHitArea(page);
    const driver = await touchDriver(page);
    const {segment, button, insets} = await measure(page);
    const month$ = page.locator('#storybook-root [data-value="month"]');
    const x = Math.min(centerX(segment), (button.left + button.right) / 2);
    const from = {x, y: (segment.top + segment.bottom) / 2};
    const to = {x, y: segment.top - insets.top - 2};
    await driver.play(drag(from, to, {durationMs: 160}));
    await page.waitForTimeout(400);
    await expect(month$).toHaveAttribute('aria-checked', 'true');
  });

  test('a tap on the band below a segment selects it', async ({page}) => {
    await openStory(page, storybook(), 'core-segmentedcontrol--below-a-button');
    await waitForHitArea(page);
    const driver = await touchDriver(page);
    const {segment, insets} = await measure(page);
    const segment$ = page.locator('#storybook-root [data-value="day"]');
    await expect(segment$).toHaveAttribute('aria-checked', 'false');
    await tapAt(driver, {
      x: centerX(segment),
      y: segment.bottom + insets.bottom - 2,
    });
    await expect(segment$).toHaveAttribute('aria-checked', 'true');
  });

  test('a tap on the band above a segment selects it; a tap past the band, nearer the button, is not the segment’s; a tap on the button is the button’s', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-segmentedcontrol--below-a-button');
    await waitForHitArea(page);
    const driver = await touchDriver(page);
    const {segment, button, insets} = await measure(page);
    const day$ = page.locator('#storybook-root [data-value="day"]');
    const month$ = page.locator('#storybook-root [data-value="month"]');
    const refreshed = page.getByText(/Refreshed \d+ times/);
    // Under the button and over the first segment, so both are near.
    const x = Math.min(centerX(segment), (button.left + button.right) / 2);

    // Past the band, in the button's half of the gap: the segment does not
    // take it.
    await tapAt(driver, {x, y: segment.top - insets.top - 2});
    await page.waitForTimeout(400);
    await expect(day$).toHaveAttribute('aria-checked', 'false');
    await expect(month$).toHaveAttribute('aria-checked', 'true');

    // On the button: the button's tap, and the selection does not move.
    const before = Number(
      (await refreshed.textContent())?.match(/\d+/)?.[0] ?? '0',
    );
    await tapAt(driver, {x, y: button.bottom - 4});
    await expect(refreshed).toHaveText(`Refreshed ${before + 1} times`);
    await expect(month$).toHaveAttribute('aria-checked', 'true');

    // On the band above the segment: the segment's tap.
    await tapAt(driver, {x, y: segment.top - insets.top + 1});
    await expect(day$).toHaveAttribute('aria-checked', 'true');
    await expect(refreshed).toHaveText(`Refreshed ${before + 1} times`);
  });
});
