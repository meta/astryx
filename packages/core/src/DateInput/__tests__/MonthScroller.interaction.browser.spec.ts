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

import {expect, test, type Locator, type Page} from '@playwright/test';
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
    // Today's smooth scroll travels: at least one frame shows the scroller
    // between the two months. This counts positions, not frames. In WebKit's CI
    // container each frame of this scroll takes 67 to 83 ms. So its 220 to 258
    // ms show two or three frames in between, and a slower frame leaves two.
    const end = offsets[offsets.length - 1];
    expect(end).not.toBe(before);
    expect(
      offsets.filter(
        left => Math.min(before, end) < left && left < Math.max(before, end),
      ),
      `the offsets each frame showed: ${offsets.join(', ')}`,
    ).not.toHaveLength(0);
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

/**
 * Records, as each is created, the animations made on `target`: what each
 * animates, its keyframes' opacity, and its duration in ms. Read at creation, a
 * dip is read on a loaded machine too. There, frames come too far apart to show
 * a 200 ms dip's darkest frame.
 */
async function recordCreatedRuns(target: Locator): Promise<void> {
  await target.evaluate(element => {
    const runs: CreatedRun[] = [];
    (window as unknown as {createdRuns: CreatedRun[]}).createdRuns = runs;
    const original = Element.prototype.animate;
    Element.prototype.animate = function (
      this: Element,
      ...args: Parameters<Element['animate']>
    ) {
      const animation = original.apply(this, args);
      if (this === element) {
        const effect = animation.effect as KeyframeEffect;
        const frames = effect.getKeyframes();
        runs.push({
          properties: [
            ...new Set(
              frames.flatMap(frame =>
                Object.keys(frame).filter(
                  key =>
                    ![
                      'offset',
                      'easing',
                      'composite',
                      'computedOffset',
                    ].includes(key),
                ),
              ),
            ),
          ],
          opacities: frames.map(frame => Number(frame.opacity)),
          duration: Number(effect.getTiming().duration),
        });
      }
      return animation;
    };
  });
}

type CreatedRun = {properties: string[]; opacities: number[]; duration: number};

test('on a touch screen, under Reduced Motion an arrow dips the calendar and changes the month without travel', async ({
  page,
}) => {
  const viewport = await openCalendar(page, 'touch');
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(true);
  // The dip is read as it is created; the page's frames record where the
  // scroller stands, from the tap until the dip is over.
  await recordCreatedRuns(viewport);
  await viewport.evaluate(element => {
    const w = window as unknown as {offsets: number[]; offsetsDone?: boolean};
    w.offsets = [];
    const tick = () => {
      w.offsets.push(element.scrollLeft);
      if (w.offsetsDone !== true) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
  const before = await viewport.evaluate(element => element.scrollLeft);
  await page.getByRole('button', {name: 'Next month'}).tap();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (window as unknown as {createdRuns: CreatedRun[]}).createdRuns.length,
      ),
    )
    .toBeGreaterThan(0);
  // The dip is over, however long a loaded machine takes to end it.
  await expect
    .poll(async () =>
      viewport.evaluate(element => element.getAnimations().length),
    )
    .toBe(0);
  // design:reduced-motion DR2: one opacity dip, dark at its middle and back
  // at its end, in at most the cross-fade's 200 ms. It plays as two halves,
  // so the month changes between them.
  const runs = await page.evaluate(
    () => (window as unknown as {createdRuns: CreatedRun[]}).createdRuns,
  );
  expect(runs).toHaveLength(2);
  const [fadeOut, fadeIn] = runs;
  expect(fadeOut.properties).toEqual(['opacity']);
  expect(fadeIn.properties).toEqual(['opacity']);
  expect(fadeOut.opacities).toEqual([1, 0]);
  expect(fadeIn.opacities).toEqual([0, 1]);
  expect(fadeOut.duration + fadeIn.duration).toBeLessThanOrEqual(200);
  // The month changes with no travel: one jump from the old offset to the
  // new one, and the scroller stays there.
  const after = await viewport.evaluate(element => element.scrollLeft);
  expect(after).not.toBe(before);
  const offsets = await page.evaluate(() => {
    const w = window as unknown as {offsets: number[]; offsetsDone?: boolean};
    w.offsetsDone = true;
    return w.offsets;
  });
  expect(
    offsets.every(left => left === before || left === after),
    `the offsets each frame showed: ${offsets.join(', ')}`,
  ).toBe(true);
  expect(
    await viewport.evaluate(element =>
      Number(getComputedStyle(element).opacity),
    ),
  ).toBe(1);
});
