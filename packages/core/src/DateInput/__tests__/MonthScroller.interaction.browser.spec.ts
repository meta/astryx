// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MonthScroller.interaction.browser.spec.ts
 * @input The built "Default" DateInput story, shown in a bottom sheet,
 *   real touch and mouse input and the interaction harness
 * @output Interaction proofs for the month scroller's arrows under Reduced
 *   Motion (`design:reduced-motion`): with a mouse the month changes at once,
 *   with no animated property; on a touch screen through a short opacity
 *   dip, the scroll landing at its middle with no travel
 * @position Interaction tests of MonthScroller.tsx
 *   (`*.interaction.browser.spec.ts`, run by `pnpm test:interaction`)
 */

import {expect, test, type Page} from '@playwright/test';
import {
  openStory,
  touchDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);
const STORY = 'core-dateinput--default';
const ARGS = {presentation: 'bottom-sheet'};

/** Opens the sheet's calendar and waits for its scroller to come to rest. */
async function openCalendar(
  page: Page,
  input: 'mouse' | 'touch',
  reducedMotion: 'reduce' | 'no-preference' = 'reduce',
) {
  await page.emulateMedia({reducedMotion});
  await openStory(page, storybook(), STORY, ARGS);
  const opener = page.getByRole('button', {name: /calendar/i}).first();
  if (input === 'mouse') {
    await opener.click();
  } else {
    const box = await opener.boundingBox();
    if (box == null) {
      throw new Error('no opener');
    }
    const driver = await touchDriver(page);
    await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  }
  const viewport = page.locator('[data-scroller="months"]');
  await expect(viewport).toBeVisible();
  // The sheet's own entrance, and the scroller's first snap, settle first.
  await viewport.evaluate(
    async element =>
      new Promise<void>(resolve => {
        let last = element.scrollLeft;
        let still = 0;
        const check = () => {
          const now = element.scrollLeft;
          still = now === last ? still + 1 : 0;
          last = now;
          if (still >= 10) {
            resolve();
          } else {
            requestAnimationFrame(check);
          }
        };
        requestAnimationFrame(check);
      }),
  );
  return viewport;
}

test.describe('with a mouse', () => {
  test.use({hasTouch: false, isMobile: false});

  test('without Reduced Motion an arrow still scrolls the month', async ({
    page,
  }) => {
    const viewport = await openCalendar(page, 'mouse', 'no-preference');
    const before = await viewport.evaluate(element => element.scrollLeft);
    const offsets = await viewport.evaluate(
      async element =>
        new Promise<number[]>(resolve => {
          const seen: number[] = [];
          const t0 = performance.now();
          const tick = () => {
            seen.push(element.scrollLeft);
            if (performance.now() - t0 < 800) {
              requestAnimationFrame(tick);
            } else {
              resolve(seen);
            }
          };
          requestAnimationFrame(tick);
          (
            document.querySelector(
              'button[aria-label="Next month"]',
            ) as HTMLButtonElement
          ).click();
        }),
    );
    // Today's smooth scroll: the offsets pass through the month in between.
    expect(offsets[offsets.length - 1]).not.toBe(before);
    expect(new Set(offsets).size).toBeGreaterThan(3);
  });

  test('under Reduced Motion an arrow changes the month at once', async ({
    page,
  }) => {
    const viewport = await openCalendar(page, 'mouse');
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    const before = await viewport.evaluate(element => element.scrollLeft);
    await page.getByRole('button', {name: 'Next month'}).click();
    // design:reduced-motion DR3: immediate, no animated property.
    const after = await viewport.evaluate(element => element.scrollLeft);
    expect(after).not.toBe(before);
    expect(
      await viewport.evaluate(element => element.getAnimations().length),
    ).toBe(0);
    // And it stays: the scroller does not move on by itself afterwards.
    const offsets = await viewport.evaluate(
      async element =>
        new Promise<number[]>(resolve => {
          const seen: number[] = [];
          const t0 = performance.now();
          const tick = () => {
            seen.push(element.scrollLeft);
            if (performance.now() - t0 < 500) {
              requestAnimationFrame(tick);
            } else {
              resolve(seen);
            }
          };
          requestAnimationFrame(tick);
        }),
    );
    expect(new Set(offsets)).toEqual(new Set([after]));
  });
});

test('on a touch screen, under Reduced Motion an arrow dips the calendar and changes the month without travel', async ({
  page,
}) => {
  const viewport = await openCalendar(page, 'touch');
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(true);
  // Every frame's opacity and scroll offset, with the page's clock, from the
  // tap on.
  await viewport.evaluate(element => {
    const log: [number, number, number][] = [];
    (window as unknown as {dip: typeof log}).dip = log;
    const t0 = performance.now();
    const tick = () => {
      log.push([
        performance.now() - t0,
        Number(getComputedStyle(element).opacity),
        element.scrollLeft,
      ]);
      if (performance.now() - t0 < 800) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
  const before = await viewport.evaluate(element => element.scrollLeft);
  await page.getByRole('button', {name: 'Next month'}).tap();
  await page.waitForFunction(
    () => {
      const log = (window as unknown as {dip?: unknown[]}).dip;
      const last = log?.[log.length - 1] as [number] | undefined;
      return last != null && last[0] >= 800;
    },
    undefined,
    {timeout: 10_000},
  );
  const log = await page.evaluate(
    () => (window as unknown as {dip: [number, number, number][]}).dip,
  );
  const offsets = [...new Set(log.map(([, , left]) => left))];
  const after = log[log.length - 1][2];
  // design:reduced-motion DR2: the month changes with no travel, one jump
  // from the old offset to the new one, at the dip's darkest point, and the
  // scroller stays there.
  expect(after).not.toBe(before);
  expect(offsets.every(left => left === before || left === after)).toBe(true);
  const dimmed = log.filter(([, opacity]) => opacity < 0.99);
  expect(dimmed.length).toBeGreaterThan(0);
  expect(Math.min(...log.map(([, opacity]) => opacity))).toBeLessThan(0.5);
  // The dip lasts at most the cross-fade's 200 ms, a frame either side.
  const span = dimmed[dimmed.length - 1][0] - dimmed[0][0];
  expect(span).toBeLessThanOrEqual(200 + 2 * 17);
  expect(log[log.length - 1][1]).toBe(1);
});
