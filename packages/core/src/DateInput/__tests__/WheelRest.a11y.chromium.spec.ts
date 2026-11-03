// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file WheelRest.a11y.chromium.spec.ts
 * @input The built TimeInput bottom-sheet story with bounds, and real
 *   Chromium touch input (CDP) on a phone profile
 * @output Browser evidence that a wheel dragged onto a row outside the bounds
 *   comes to rest on the nearest row inside them and commits it
 * @position Real-engine proof for Wheel.tsx's rest rule: native scrolling,
 *   CSS snapping and the browser's own end-of-scroll signal, none of which
 *   jsdom has. Wheel.test.tsx holds the rule itself.
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

test.use({
  hasTouch: true,
  isMobile: true,
  viewport: {width: 390, height: 844},
  deviceScaleFactor: 3,
});

const sleep = async (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));

async function openHourWheel(page: Page) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-timeinput--bottom-sheet-with-min-max&viewMode=story`,
  );
  const field = page.getByRole('combobox', {name: 'Appointment time'});
  await expect(field).toHaveValue('10:00 AM');
  await field.tap();
  const hours = page.getByRole('listbox', {name: 'Hour'});
  await expect(hours).toBeVisible();
  // Let the sheet finish presenting, so the drag lands on a wheel at rest.
  await sleep(800);
  return {field, hours};
}

/** A slow one-finger drag: no fling, so the wheel snaps where it is let go. */
async function drag(page: Page, wheel: Locator, dy: number) {
  const box = await wheel.boundingBox();
  if (box == null) {
    throw new Error('no rendered bounds');
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{x, y, id: 1}],
  });
  const steps = 30;
  for (let i = 1; i <= steps; i++) {
    await sleep(16);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{x, y: y + (dy * i) / steps, id: 1}],
    });
  }
  // Hold still before lifting, so the release carries no velocity.
  await sleep(200);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
}

const selectedHour = (hours: Locator) =>
  hours.locator('[role="option"][aria-selected="true"]');

/**
 * Chromium starts a touch scroll only after the finger has travelled its slop,
 * so a drag moves the content that much less than the finger. Each drag adds
 * this much so the wheel snaps to the intended row.
 */
const SCROLL_SLOP_ALLOWANCE = 16;

test('a wheel dragged below the minimum comes to rest on the minimum', async ({
  page,
}) => {
  const {field, hours} = await openHourWheel(page);
  const row = await hours
    .locator('[role="option"]')
    .first()
    .evaluate(el => el.getBoundingClientRect().height);
  // 10 → 7: three rows down, past 9 AM.
  await drag(page, hours, 3 * row + SCROLL_SLOP_ALLOWANCE);

  await expect(selectedHour(hours)).toHaveText('9', {timeout: 3000});
  await expect(field).toHaveValue('9:00 AM');
});

test('a wheel dragged onto a row inside the bounds commits that row', async ({
  page,
}) => {
  const {field, hours} = await openHourWheel(page);
  const row = await hours
    .locator('[role="option"]')
    .first()
    .evaluate(el => el.getBoundingClientRect().height);
  // 10 → 11: one row up, still inside the bounds.
  await drag(page, hours, -(row + SCROLL_SLOP_ALLOWANCE));

  await expect(selectedHour(hours)).toHaveText('11', {timeout: 3000});
  await expect(field).toHaveValue('11:00 AM');
});

test('under reduced motion an arrow key step lands under its cross-fade, never at full opacity', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  const {field, hours} = await openHourWheel(page);
  await hours.focus();
  // Record every frame from before the key until well after the 200 ms dip.
  // Each frame holds where the rows are drawn and how opaque they are. The
  // rows are the band copy's strip where the column has one, and its first
  // row otherwise.
  const frames = hours.evaluate(
    async column =>
      new Promise<{at: number; opacity: number}[]>(resolve => {
        const seen: {at: number; opacity: number}[] = [];
        const sample = () => {
          const strip = column.querySelector<HTMLElement>('[data-wheel-strip]');
          const rows =
            strip ?? column.querySelector<HTMLElement>('[role="option"]');
          const faded = strip?.parentElement ?? column;
          seen.push({
            at: Math.round(
              (rows?.getBoundingClientRect().top ?? 0) -
                column.getBoundingClientRect().top,
            ),
            opacity: Number(getComputedStyle(faded).opacity),
          });
          if (seen.length < 45) {
            requestAnimationFrame(sample);
          } else {
            resolve(seen);
          }
        };
        requestAnimationFrame(sample);
      }),
  );
  await sleep(50);
  await page.keyboard.press('ArrowDown');
  const seen = await frames;

  // The rows never move while they are fully visible: they land under the
  // dip (design:reduced-motion DR2), then fade back in on 11.
  const start = seen[0].at;
  const moved = seen.find(frame => frame.at !== start);
  expect(moved, JSON.stringify(seen)).toBeDefined();
  expect(moved?.opacity, JSON.stringify(seen)).toBeLessThan(1);
  expect(seen.at(-1)?.opacity).toBe(1);
  await expect(selectedHour(hours)).toHaveText('11');
  await expect(field).toHaveValue('11:00 AM');
});

test('a meridiem change past the maximum turns the hour wheel onto it, frame by frame (component:DateInput FR14)', async ({
  page,
}) => {
  const {field, hours} = await openHourWheel(page);
  const meridiem = page.getByRole('listbox', {name: 'AM/PM'});
  const labels = await hours.locator('[role="option"]').allTextContents();
  const row = await hours
    .locator('[role="option"]')
    .first()
    .evaluate(el => el.getBoundingClientRect().height);
  const from = labels.indexOf('10') * row;
  const to = labels.indexOf('5') * row;
  // The hour wheel's scroll position on every frame, from before the tap.
  await hours.evaluate(scroller => {
    const tops: number[] = [];
    (window as unknown as {hourTops: number[]}).hourTops = tops;
    const sample = () => {
      tops.push(scroller.scrollTop);
      if (tops.length < 150) {
        requestAnimationFrame(sample);
      }
    };
    requestAnimationFrame(sample);
  });
  // 10 PM is past the 5 PM maximum: the field clamps to it.
  await meridiem.getByRole('option', {name: 'PM'}).tap();
  await expect(field).toHaveValue('5:00 PM', {timeout: 3000});
  await sleep(1000);
  const tops = await page.evaluate(
    () => (window as unknown as {hourTops: number[]}).hourTops,
  );
  // From 10 onto 5 through the rows between, as UIDatePicker turns onto its
  // maximum, never a jump, and only ever one way.
  expect(Math.abs(tops[0] - from)).toBeLessThan(1);
  expect(Math.abs(tops[tops.length - 1] - to)).toBeLessThan(1);
  const between = tops.filter(top => top < from - 2 && top > to + 2);
  expect(between.length).toBeGreaterThanOrEqual(4);
  for (let i = 1; i < tops.length; i++) {
    expect(tops[i]).toBeLessThanOrEqual(tops[i - 1] + 0.5);
  }
});
