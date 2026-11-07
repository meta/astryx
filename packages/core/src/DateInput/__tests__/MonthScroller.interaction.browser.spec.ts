// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MonthScroller.interaction.browser.spec.ts
 * @input The built "Default" DateInput story, shown in a bottom sheet, real
 *   mouse input and the interaction harness
 * @output Interaction proofs for the month scroller's arrows under Reduced
 *   Motion (`design:reduced-motion`): with a mouse the month changes at once,
 *   with no animated property. Under a finger the calendar is MonthPager,
 *   whose Reduced Motion dip MonthPager.interaction.browser.spec.ts proves.
 * @position Interaction tests of MonthScroller.tsx
 *   (`*.interaction.browser.spec.ts`, run by `pnpm test:interaction`)
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);
const STORY = 'core-dateinput--default';
const ARGS = {presentation: 'bottom-sheet'};

/** Opens the sheet's calendar and waits for its scroller to come to rest. */
async function openCalendar(
  page: Page,
  reducedMotion: 'reduce' | 'no-preference' = 'reduce',
) {
  await page.emulateMedia({reducedMotion});
  await openStory(page, storybook(), STORY, ARGS);
  await page
    .getByRole('button', {name: /calendar/i})
    .first()
    .click();
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
    const viewport = await openCalendar(page, 'no-preference');
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
    const viewport = await openCalendar(page);
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
