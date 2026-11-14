// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SegmentedControlHitArea.interaction.browser.spec.ts
 * @input The built "Below a button" SegmentedControl story and real touch
 *   input on a phone-sized touch context
 * @output Browser proofs that a segment's touch target grows toward 44 px
 *   through an invisible band that never takes a tap from another target's
 *   visible box, and changes no box (spec:AST-094 FR42)
 * @position Browser layer of SegmentedControlItem's hit band and of a held
 *   drag past it. The band itself is internal/touchHitArea.stylex.ts
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

async function measure(page: Page) {
  return page.evaluate(() => {
    const box = (element: Element) => {
      const r = element.getBoundingClientRect();
      return {left: r.left, top: r.top, right: r.right, bottom: r.bottom};
    };
    const inset = (element: HTMLElement, side: 'top' | 'bottom') =>
      Math.max(
        0,
        -(Number.parseFloat(getComputedStyle(element, '::after')[side]) || 0),
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
    const {segment, button, insets} = await measure(page);
    // The theme sets the segment's height; the band adds none to its box.
    const height = segment.bottom - segment.top;
    expect(height).toBeLessThan(44);
    // The band reaches the full 44 px on both sides. Where it lies over the
    // button's box, the button keeps the tap.
    expect(insets.bottom).toBeCloseTo((44 - height) / 2, 1);
    expect(insets.top).toBeCloseTo((44 - height) / 2, 1);
    expect(button.bottom).toBeLessThan(segment.top);
  });

  test('a drag that lifts past a segment’s band, in the button’s half of the gap, still selects that segment and leaves the button alone', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-segmentedcontrol--below-a-button');
    const driver = await touchDriver(page);
    const {segment, button, insets} = await measure(page);
    const day$ = page.locator('#storybook-root [data-value="day"]');
    const refreshed = page.getByText(/Refreshed \d+ times/);
    const count = async () =>
      Number((await refreshed.textContent())?.match(/\d+/)?.[0] ?? '0');
    const before = await count();
    const x = Math.min(centerX(segment), (button.left + button.right) / 2);
    const y = (segment.top + segment.bottom) / 2;
    // Sideways inside the segment first, past the pan's start: the drag then
    // holds the finger, so the page does not take it for a scroll.
    const start = {x: Math.min(x + 24, segment.right - 4), y};
    if (start.x - x < 16) {
      throw new Error('the segment is too narrow to start a sideways drag');
    }
    const sideways = drag(start, {x, y}, {durationMs: 120}).slice(0, -1);
    const lastT = sideways[sideways.length - 1].t;
    const up = drag(
      {x, y},
      {x, y: segment.top - insets.top - 2},
      {
        durationMs: 160,
      },
    )
      .slice(1)
      .map(frame => ({...frame, t: frame.t + lastT}));
    await driver.play([...sideways, ...up]);
    await expect(day$).toHaveAttribute('aria-checked', 'true');
    expect(await count()).toBe(before);
  });

  test('a tap on the band below a segment selects it', async ({page}) => {
    await openStory(page, storybook(), 'core-segmentedcontrol--below-a-button');
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

  test('a tap on the band above a segment selects it; a tap on the button is the button’s, also under the segment’s band', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-segmentedcontrol--below-a-button');
    const driver = await touchDriver(page);
    const {segment, button} = await measure(page);
    const day$ = page.locator('#storybook-root [data-value="day"]');
    const month$ = page.locator('#storybook-root [data-value="month"]');
    const refreshed = page.getByText(/Refreshed \d+ times/);
    // Under the button and over the first segment, so both are near.
    const x = Math.min(centerX(segment), (button.left + button.right) / 2);

    // On the button's lower edge, where the segment's band can lie: the
    // button's visible box wins, and the selection does not move.
    const before = Number(
      (await refreshed.textContent())?.match(/\d+/)?.[0] ?? '0',
    );
    await tapAt(driver, {x, y: Math.floor(button.bottom) - 1});
    await expect(refreshed).toHaveText(`Refreshed ${before + 1} times`);
    await expect(month$).toHaveAttribute('aria-checked', 'true');

    // On the band above the segment, over empty space: the segment's tap.
    await tapAt(driver, {x, y: segment.top - 2});
    await expect(day$).toHaveAttribute('aria-checked', 'true');
    await expect(refreshed).toHaveText(`Refreshed ${before + 1} times`);
  });
});
