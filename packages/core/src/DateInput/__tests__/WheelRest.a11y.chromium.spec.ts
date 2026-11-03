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

/** A frame the page drew: when (ms, shown in a failure) and the wheel's position. */
interface DrawnFrame {
  at: number;
  y: number;
}

/**
 * Judges a turn by the frames the page drew, not by how many it drew. A
 * loaded page draws fewer frames in the same turn, and they all still pass.
 * The turn starts on `from` and comes to rest on `to`. It moves one way only.
 * At least two drawn frames carry it: one shows the wheel between the two
 * rows, and a later one lands. A jump lands on the first frame it draws.
 */
function expectAnimatedTurn(
  frames: ReadonlyArray<DrawnFrame>,
  from: number,
  to: number,
): void {
  const record = JSON.stringify(frames);
  const way = Math.sign(to - from);
  expect(Math.abs(frames[0].y - from), record).toBeLessThan(1);
  expect(Math.abs(frames[frames.length - 1].y - to), record).toBeLessThan(1);
  for (let i = 1; i < frames.length; i++) {
    expect(way * (frames[i].y - frames[i - 1].y), record).toBeGreaterThan(-0.5);
  }
  const isOnFrom = (frame: DrawnFrame) => Math.abs(frame.y - from) <= 2;
  const isOnTo = (frame: DrawnFrame) => Math.abs(frame.y - to) <= 2;
  let leave = 0;
  while (leave + 1 < frames.length && isOnFrom(frames[leave + 1])) {
    leave += 1;
  }
  const arrive = frames.findIndex(isOnTo);
  const between = frames.slice(leave + 1, arrive);
  expect(between.length, record).toBeGreaterThan(0);
}

/** A frame the page drew: where the rows sit in the column, and its opacity. */
interface RowFrame {
  at: number;
  opacity: number;
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
  // Record every frame the page draws, from before the key until the column
  // is at rest again. Each frame holds where the rows are drawn and how
  // opaque they are. The rows are the band copy's strip where the column has
  // one, and its first row otherwise.
  await hours.evaluate(column => {
    const recorder = {seen: [] as RowFrame[], isDone: false};
    (window as unknown as {stepFrames: typeof recorder}).stepFrames = recorder;
    const sample = () => {
      const strip = column.querySelector<HTMLElement>('[data-wheel-strip]');
      const rows =
        strip ?? column.querySelector<HTMLElement>('[role="option"]');
      const faded = strip?.parentElement ?? column;
      recorder.seen.push({
        at: Math.round(
          (rows?.getBoundingClientRect().top ?? 0) -
            column.getBoundingClientRect().top,
        ),
        opacity: Number(getComputedStyle(faded).opacity),
      });
      if (!recorder.isDone) {
        requestAnimationFrame(sample);
      }
    };
    requestAnimationFrame(sample);
  });
  await sleep(50);
  await page.keyboard.press('ArrowDown');
  await expect(selectedHour(hours)).toHaveText('11');
  await expect(field).toHaveValue('11:00 AM');
  // The record ends on a drawn frame with the rows moved and the column fully
  // visible again. A loaded page may draw only a few frames before it.
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const {seen} = (window as unknown as {stepFrames: {seen: RowFrame[]}})
          .stepFrames;
        const last = seen.at(-1);
        return last != null && last.at !== seen[0].at && last.opacity === 1;
      }),
    )
    .toBe(true);
  const seen = await page.evaluate(() => {
    const recorder = (
      window as unknown as {stepFrames: {seen: RowFrame[]; isDone: boolean}}
    ).stepFrames;
    recorder.isDone = true;
    return recorder.seen;
  });

  // The rows never move while they are fully visible: they land under the
  // dip (design:reduced-motion DR2), then fade back in on 11.
  const start = seen[0].at;
  const moved = seen.find(frame => frame.at !== start);
  expect(moved, JSON.stringify(seen)).toBeDefined();
  expect(moved?.opacity, JSON.stringify(seen)).toBeLessThan(1);
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
  // The hour wheel's scroll position on every frame the page draws, from
  // before the tap until the wheel is at rest.
  await hours.evaluate(scroller => {
    const recorder = {frames: [] as DrawnFrame[], isDone: false};
    (window as unknown as {hourTurn: typeof recorder}).hourTurn = recorder;
    const sample = (at: number) => {
      recorder.frames.push({at, y: scroller.scrollTop});
      if (!recorder.isDone) {
        requestAnimationFrame(sample);
      }
    };
    requestAnimationFrame(sample);
  });
  // 10 PM is past the 5 PM maximum: the field clamps to it.
  await meridiem.getByRole('option', {name: 'PM'}).tap();
  await expect(field).toHaveValue('5:00 PM', {timeout: 3000});
  // The record ends once a drawn frame shows the wheel at rest on 5.
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (
            window as unknown as {hourTurn: {frames: DrawnFrame[]}}
          ).hourTurn.frames.at(-1)?.y,
      ),
    )
    .toBeCloseTo(to, 0);
  const frames = await page.evaluate(() => {
    const recorder = (
      window as unknown as {
        hourTurn: {frames: DrawnFrame[]; isDone: boolean};
      }
    ).hourTurn;
    recorder.isDone = true;
    return recorder.frames;
  });
  // From 10 onto 5 through the rows between, as UIDatePicker turns onto its
  // maximum, never a jump, and only ever one way.
  expectAnimatedTurn(frames, from, to);
});
