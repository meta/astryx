// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CarouselSnapPagingButtons.interaction.browser.spec.ts
 * @input The Core/Carousel three-up snap paging story in paging mode, the
 *   scroll-right button, real touches from the interaction harness, and a
 *   per-frame page sampler
 * @output Proves an edge button press at rest moves the row through the
 *   paging. The press holds the row and lands on the next page. A still touch
 *   that catches the move leaves the row on a page after the lift. The press
 *   reads the row before its first write, so its own task lays out nothing.
 * @position Interaction proofs for Carousel's scroll calls under snap paging,
 *   run in Chromium and WebKit
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  countBetween,
  openStory,
  tap,
  touchDriver,
  traceRendering,
  withStorybook,
} from '@astryxdesign/interaction-harness';

import {nearestStop} from '../../SnapPaging/snapPagingValue';

const storybook = withStorybook(test);

async function open(page: Page) {
  await openStory(page, storybook(), 'core-carousel--snap-paging-three-up', {
    mode: 'paging',
  });
  const scroller = page.getByRole('region').getByRole('group').first();
  const next = page.getByRole('button', {name: 'Scroll right'});
  await expect(scroller).toBeVisible();
  await expect(next).toBeEnabled();
  return {scroller, next};
}

/** Each item's snap stop at rest, from the row's start. */
const stopsOf = async (scroller: Locator) =>
  scroller.evaluate(el => {
    const box = el.getBoundingClientRect();
    const end = el.scrollWidth - el.clientWidth;
    return Array.from(el.children).map(child => {
      const start = child.getBoundingClientRect().left - box.left;
      return Math.min(start + Math.abs(el.scrollLeft), end);
    });
  });

/** Whether any item carries the paging's translate. */
const isHeld = async (scroller: Locator) =>
  scroller.evaluate(el =>
    Array.from(el.children).some(
      child => (child as HTMLElement).style.translate !== '',
    ),
  );

// Records on every frame whether the paging holds the row.
async function sampleHeld(scroller: Locator): Promise<void> {
  await scroller.evaluate(row => {
    const held: boolean[] = [];
    (window as unknown as {__held: boolean[]}).__held = held;
    const tick = () => {
      held.push(
        Array.from(row.children).some(
          child => (child as HTMLElement).style.translate !== '',
        ),
      );
      if (held.length < 300) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
}

async function settled(scroller: Locator): Promise<void> {
  await expect.poll(async () => isHeld(scroller)).toBe(false);
}

test('a scroll-right press at rest moves the row through the paging, onto the next page', async ({
  page,
}) => {
  const {scroller, next} = await open(page);
  const stops = await stopsOf(scroller);
  await sampleHeld(scroller);
  await next.click();
  // Long enough for the paging's move to start and end.
  await page.waitForTimeout(700);
  await settled(scroller);
  const held = await page.evaluate(
    () => (window as unknown as {__held: boolean[]}).__held,
  );
  expect(held.filter(Boolean).length, JSON.stringify(held)).toBeGreaterThan(0);
  const at = await scroller.evaluate(el => Math.abs(el.scrollLeft));
  expect(Math.abs(at - nearestStop(stops, at)), String(at)).toBeLessThan(0.5);
  expect(at).toBeGreaterThan(0.5);
});

test('a still touch that catches the press move leaves the row on a page after the lift', async ({
  page,
}) => {
  const {scroller, next} = await open(page);
  const stops = await stopsOf(scroller);
  await next.click();
  await page.waitForTimeout(120);
  const box = await scroller.boundingBox();
  if (box == null) {
    throw new Error('no scroller');
  }
  const point = {x: box.x + box.width / 2, y: box.y + box.height / 2};
  const driver = await touchDriver(page);
  // A touch that lands and lifts without moving, held 300 ms.
  await driver.play(tap(point, {holdMs: 300}));
  await page.waitForTimeout(700);
  await settled(scroller);
  const at = await scroller.evaluate(el => Math.abs(el.scrollLeft));
  expect(Math.abs(at - nearestStop(stops, at)), String(at)).toBeLessThan(0.5);
});

test('a press reads the row before its first write, so its own task lays out nothing', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
  const {next} = await open(page);
  // The press's own task: from the click's first listener to its last.
  await page.evaluate(() => {
    const press = {from: 0, to: 0};
    (window as unknown as {__press: typeof press}).__press = press;
    document.addEventListener(
      'click',
      () => {
        press.from = performance.timeOrigin + performance.now();
      },
      {capture: true},
    );
    window.addEventListener('click', () => {
      press.to = performance.timeOrigin + performance.now();
    });
  });
  const trace = await traceRendering(page, async () => {
    await next.click();
    await page.waitForTimeout(100);
  });
  const press = await page.evaluate(
    () => (window as unknown as {__press: {from: number; to: number}}).__press,
  );
  const during = countBetween(trace, press.from, press.to);
  expect(press.to, JSON.stringify(press)).toBeGreaterThan(press.from);
  expect(during.Layout ?? 0, JSON.stringify(during)).toBe(0);
});
