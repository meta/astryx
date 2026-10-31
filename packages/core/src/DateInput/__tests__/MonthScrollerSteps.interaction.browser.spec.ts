// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MonthScrollerSteps.interaction.browser.spec.ts
 * @input The built "Default" DateInput story, shown in a bottom sheet, the
 *   arrows clicked from the page, real mouse and trackpad input and the
 *   interaction harness
 * @output Interaction proofs for the month scroller's steps: after the month
 *   and year wheels close, a trackpad scroll still pages to the next month and
 *   Reset from four months on still rests on today's month; an arrow step
 *   through a stalled frame moves exactly one month; under a finger, a swipe
 *   that crosses the middle of a month as it lifts keeps scroll snapping on
 *   and rests on the next month.
 *   (A second arrow step late in the first one's scroll, which WebKit cuts
 *   short, is proven in MonthScrollerSettle.test.tsx: a loaded page's frames
 *   are too far apart to aim a click at a share of a 300 ms scroll.)
 * @position Interaction tests of MonthScroller.tsx
 *   (`*.interaction.browser.spec.ts`, run by `pnpm test:interaction`)
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  blockMainThread,
  drag,
  openStory,
  touchDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);
const STORY = 'core-dateinput--default';
const ARGS = {presentation: 'bottom-sheet'};

/** Waits until the scroller's offset has not moved for ten frames. */
async function waitForRest(viewport: Locator): Promise<number> {
  return viewport.evaluate(
    async element =>
      new Promise<number>(resolve => {
        let last = element.scrollLeft;
        let still = 0;
        const check = () => {
          const now = element.scrollLeft;
          still = now === last ? still + 1 : 0;
          last = now;
          if (still >= 10) {
            resolve(now);
          } else {
            requestAnimationFrame(check);
          }
        };
        requestAnimationFrame(check);
      }),
  );
}

/** The month the scroller rests on, as the pane's own grid names it. */
/**
 * Waits until a month's grid sits flush with the scroller's edge, the offset
 * unchanged, for ten frames: the end of the scroller's own settle
 * correction, however long the page takes to run it. (The panes' width can
 * be fractional, so the grid's own box is the measure, not the offset.)
 */
async function waitForRestOnMonth(viewport: Locator): Promise<number> {
  return viewport.evaluate(
    async element =>
      new Promise<number>(resolve => {
        let last = element.scrollLeft;
        let still = 0;
        const flush = () => {
          const edge = element.getBoundingClientRect().left;
          return [
            ...element.querySelectorAll<HTMLElement>('[role="grid"]'),
          ].some(
            grid => Math.abs(grid.getBoundingClientRect().left - edge) < 1,
          );
        };
        const check = () => {
          const now = element.scrollLeft;
          still = now === last && flush() ? still + 1 : 0;
          last = now;
          if (still >= 10) {
            resolve(now);
          } else {
            requestAnimationFrame(check);
          }
        };
        requestAnimationFrame(check);
      }),
  );
}

async function monthAtRest(viewport: Locator): Promise<string> {
  return viewport.evaluate(element => {
    const box = element.getBoundingClientRect();
    const middle = box.left + box.width / 2;
    for (const grid of element.querySelectorAll<HTMLElement>('[role="grid"]')) {
      const r = grid.getBoundingClientRect();
      if (r.left <= middle && r.right >= middle) {
        return grid.getAttribute('aria-label') ?? '';
      }
    }
    return '';
  });
}

async function openCalendar(page: Page) {
  await openStory(page, storybook(), STORY, ARGS);
  await page
    .getByRole('button', {name: /calendar/i})
    .first()
    .click();
  const viewport = page.locator('[data-scroller="months"]');
  await expect(viewport).toBeVisible();
  await waitForRest(viewport);
  return viewport;
}

test.use({hasTouch: false, isMobile: false});

/**
 * Waits until the scroller comes to rest, or until it has gone more than
 * `limit` past `from`: a scroller that runs on by itself never rests, and
 * the proof should fail where it ran, not at the test's timeout.
 */
async function waitForRestOrRun(
  viewport: Locator,
  from: number,
  limit: number,
): Promise<number> {
  return viewport.evaluate(
    async (element, {from, limit}) =>
      new Promise<number>(resolve => {
        let last = element.scrollLeft;
        let still = 0;
        const check = () => {
          const now = element.scrollLeft;
          still = now === last ? still + 1 : 0;
          last = now;
          if (still >= 10 || Math.abs(now - from) > limit) {
            resolve(now);
          } else {
            requestAnimationFrame(check);
          }
        };
        requestAnimationFrame(check);
      }),
    {from, limit},
  );
}

/**
 * A stalled frame right after an arrow (a 300 ms block of the main thread)
 * let the re-center that follows the step land after the scroll had ended,
 * and WebKit's re-snap after it then paged on by itself, a month every few
 * frames. The step moves exactly one month.
 */
test('an arrow step through a stalled frame moves exactly one month', async ({
  page,
}) => {
  const viewport = await openCalendar(page);
  const title = page.getByRole('button', {name: /Choose month and year/});
  const from = await viewport.evaluate(element => element.scrollLeft);
  const width = await viewport.evaluate(element => element.clientWidth);
  const box = await page
    .getByRole('button', {name: 'Next month'})
    .boundingBox();
  if (box == null) {
    throw new Error('no Next month button');
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await blockMainThread(page, 300);
  const at = await waitForRestOrRun(viewport, from, 2 * width);
  expect(Math.round((at - from) / width)).toBe(1);
  await waitForRestOnMonth(viewport);
  expect(
    Math.round(((await viewport.evaluate(e => e.scrollLeft)) - from) / width),
  ).toBe(1);
  await expect(title).toHaveAccessibleName(
    new RegExp(await monthAtRest(viewport)),
  );
});

/**
 * Closing the month and year wheels re-asserts the month shown, a steer that
 * moves nothing. A trackpad scroll after it is the user's: it pages to the
 * next month and stays there, the title following.
 */
test('after the month and year wheels close, a trackpad scroll to the next month stays there', async ({
  page,
}) => {
  const viewport = await openCalendar(page);
  const toggle = page.getByRole('button', {name: /Choose month and year/});
  const start = await monthAtRest(viewport);
  expect(start).not.toBe('');
  const toggleBox = await toggle.boundingBox();
  if (toggleBox == null) {
    throw new Error('no month and year toggle');
  }
  const clickToggle = async () =>
    page.mouse.click(
      toggleBox.x + toggleBox.width / 2,
      toggleBox.y + toggleBox.height / 2,
    );
  await clickToggle();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await clickToggle();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await waitForRest(viewport);

  const box = await viewport.boundingBox();
  if (box == null) {
    throw new Error('no month scroller');
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  // A horizontal trackpad scroll of 70 % of a month, as one wheel event: a
  // burst of small ones reaches a loaded page far enough apart to count as
  // separate gestures, each snapping back on its own.
  await page.mouse.wheel(box.width * 0.7, 0);
  // Past the scroller's own settle correction too, which ends on a month's
  // boundary.
  await waitForRestOnMonth(viewport);
  const next = await monthAtRest(viewport);
  expect(next).not.toBe(start);
  await expect(toggle).toHaveAccessibleName(new RegExp(next));
});

/**
 * Reset from four months on is a far jump, mounting today's month before the
 * scroller moves. After the month and year wheels close, whose re-assert is a
 * steer that moved nothing, the jump still rests on today's month, the title
 * with it.
 */
test('after the month and year wheels close, Reset from four months on rests on today’s month', async ({
  page,
}) => {
  const viewport = await openCalendar(page);
  const toggle = page.getByRole('button', {name: /Choose month and year/});
  const today = await monthAtRest(viewport);
  expect(today).not.toBe('');
  const clickCentre = async (name: string | RegExp) => {
    const box = await page.getByRole('button', {name}).boundingBox();
    if (box == null) {
      throw new Error(`no ${String(name)} button`);
    }
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  };
  for (let step = 0; step < 4; step++) {
    await clickCentre('Next month');
    await waitForRest(viewport);
  }
  expect(await monthAtRest(viewport)).not.toBe(today);
  await clickCentre(/Choose month and year/);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await clickCentre(/Choose month and year/);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await waitForRest(viewport);

  await clickCentre('Reset');
  // Past the scroller's own settle correction too, which ends on a month's
  // boundary.
  await waitForRestOnMonth(viewport);
  expect(await monthAtRest(viewport)).toBe(today);
  await expect(toggle).toHaveAccessibleName(new RegExp(today));
});

test.describe('under a finger', () => {
  test.use({hasTouch: true, isMobile: true});

  /**
   * A swipe whose last move crosses the middle of the month makes the
   * scroller re-center as the finger lifts. The finger drives that scroll, so
   * the re-center leaves scroll snapping on (turning it off drops the snap
   * target iOS tracks for the gesture, and the swipe coasted past the month),
   * and the swipe comes to rest on the next month.
   */
  test('a swipe that crosses the middle of a month as it lifts keeps snapping on and rests on the next month', async ({
    page,
  }) => {
    const viewport = await openCalendar(page);
    const start = await monthAtRest(viewport);
    const box = await viewport.boundingBox();
    if (box == null) {
      throw new Error('no month scroller');
    }
    // Every change of the scroller's inline scroll-snap-type from here on.
    await viewport.evaluate(element => {
      const changes: string[] = [];
      (window as unknown as {snapChanges: string[]}).snapChanges = changes;
      new MutationObserver(() => {
        changes.push((element as HTMLElement).style.scrollSnapType || 'on');
      }).observe(element, {attributes: true, attributeFilter: ['style']});
    });
    const driver = await touchDriver(page);
    const y = box.y + box.height / 2;
    const from = {x: box.x + box.width * 0.8, y};
    // 55 % of a month toward the next one, the middle crossed by the last
    // move, lifting a quarter frame after it.
    await driver.play(
      drag(from, {x: from.x - box.width * 0.55, y}, {durationMs: 300}),
    );
    await waitForRestOnMonth(viewport);
    const rest = await monthAtRest(viewport);
    expect(rest).not.toBe('');
    expect(rest).not.toBe(start);
    // Snapping was never turned off while the finger drove the scroll.
    expect(
      await page.evaluate(
        () => (window as unknown as {snapChanges: string[]}).snapChanges,
      ),
    ).not.toContain('none');
  });
});
