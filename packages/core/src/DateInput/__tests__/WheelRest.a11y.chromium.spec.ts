// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file WheelRest.a11y.chromium.spec.ts
 * @input The built TimeInput bottom-sheet story with bounds and the Wheel
 *   story; real touch input (CDP) on a phone profile, a mouse on a desktop one
 * @output Browser evidence that a wheel dragged onto a row outside the bounds
 *   comes to rest on the nearest row inside them and commits it, on the touch
 *   column under a finger and on today's column under a mouse; that a
 *   downward drag on the touch column leaves the sheet where it is; and that
 *   today's column under Reduce Motion fades its rows without tipping them
 * @position Real-engine proof for the rest rule: on the touch column, real
 *   touch input through the gesture system; on today's column, native
 *   scrolling, CSS snapping and the browser's own end-of-scroll signal. None
 *   of it is in jsdom. Wheel.test.tsx and PickerWheel.test.tsx hold the rule.
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {UIKIT_GESTURES} from '../../motion/uikit';
import {WHEEL_ROW_HEIGHT} from '../wheelOptions';

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

/** A slow one-finger drag: no fling, so the wheel rests where it is let go. */
/** A mouse case runs under a fine primary pointer: the page agrees. */
async function expectFinePointer(page: Page) {
  expect(
    await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches),
  ).toBe(false);
}

async function drag(page: Page, wheel: Locator, dy: number, steps = 30) {
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

/** The touch column's row pitch: today's row. */
const ROW = WHEEL_ROW_HEIGHT;
/**
 * A drag begins only once the finger has travelled the pan's hysteresis, which
 * the rows never show. So each drag adds that and a little more, and the wheel
 * rests on the intended row.
 */
const SLOP_ALLOWANCE = UIKIT_GESTURES.pan.hysteresis.value + 6;
// Slow (well under the release velocity floor), so the wheel rests on the
// row it is let go on rather than coasting.
const SLOW_STEPS = 60;

test('a downward drag on a wheel moves its rows and leaves the sheet where it is', async ({
  page,
}) => {
  const {hours} = await openHourWheel(page);
  const sheet = page.locator('.astryx-bottom-sheet').first();
  // The sheet's top on screen, every frame through the drag.
  await sheet.evaluate(element => {
    const tops: number[] = [];
    (window as unknown as {sheetTops: number[]}).sheetTops = tops;
    const sample = () => {
      tops.push(element.getBoundingClientRect().top);
      if (tops.length < 240) {
        requestAnimationFrame(sample);
      }
    };
    requestAnimationFrame(sample);
  });
  const restingBefore = await hours.getAttribute('aria-activedescendant');
  // Down: the rows move toward the earlier hours.
  await drag(page, hours, 2 * ROW + SLOP_ALLOWANCE, SLOW_STEPS);
  const tops = await page.evaluate(
    () => (window as unknown as {sheetTops: number[]}).sheetTops,
  );
  expect(tops.length).toBeGreaterThan(30);
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(1);
  await expect(hours).not.toHaveAttribute(
    'aria-activedescendant',
    restingBefore ?? '',
  );
});

test('a wheel dragged below the minimum comes to rest on the minimum', async ({
  page,
}) => {
  const {field, hours} = await openHourWheel(page);
  // The touch column: a finger gets it on every engine.
  await expect(page.locator('[data-wheel]').first()).toBeVisible();
  // 10 → 7: three rows down, past 9 AM.
  await drag(page, hours, 3 * ROW + SLOP_ALLOWANCE, SLOW_STEPS);

  await expect(selectedHour(hours)).toHaveText('9', {timeout: 3000});
  await expect(field).toHaveValue('9:00 AM');
});

test('a wheel dragged onto a row inside the bounds commits that row', async ({
  page,
}) => {
  const {field, hours} = await openHourWheel(page);
  // 10 → 11: one row up, still inside the bounds.
  await drag(page, hours, -(ROW + SLOP_ALLOWANCE), SLOW_STEPS);

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
  // is at rest again. Each frame holds where the committed row (10) is drawn
  // and how opaque its rows are. The rows are the scroller's or the touch
  // column's strip, whichever holds the options.
  await hours.evaluate(column => {
    const recorder = {seen: [] as RowFrame[], isDone: false};
    (window as unknown as {stepFrames: typeof recorder}).stepFrames = recorder;
    const row = column.querySelector<HTMLElement>(
      '[role="option"][aria-selected="true"]',
    );
    const faded = row?.parentElement ?? column;
    const sample = () => {
      recorder.seen.push({
        at: Math.round(
          (row?.getBoundingClientRect().top ?? 0) -
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

test('a focused wheel under a finger shows its whole focus ring, and its rows still fade', async ({
  page,
}) => {
  const {hours} = await openHourWheel(page);
  // A key makes the focus visible, as a keyboard user's would.
  await hours.focus();
  await page.keyboard.press('ArrowDown');
  const column = await hours.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      focusVisible: element.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      mask: style.maskImage,
    };
  });
  expect(column.focusVisible).toBe(true);
  expect(column.outlineStyle).not.toBe('none');
  // A mask on the column would clip the ring it draws outside its box.
  expect(column.mask).toBe('none');
  const fade = await hours
    .locator('[data-wheel-fade]')
    .evaluate(element => getComputedStyle(element).maskImage);
  expect(fade).toContain('linear-gradient');
});

test('a meridiem change past the maximum turns the hour wheel onto it, frame by frame (component:DateInput FR14)', async ({
  page,
}) => {
  const {field, hours} = await openHourWheel(page);
  const meridiem = page.getByRole('listbox', {name: 'AM/PM'});
  // The touch column draws its rows on a strip it translates. The animator
  // writes `translate`, which `transform` does not report. Record its drawn top
  // on every frame from before the tap until the wheel is at rest.
  const strip = hours.locator('[data-wheel-strip]');
  await expect(strip).toHaveCount(1);
  // The strip has no size of its own: its rows are placed on it. A drawn row
  // shows that the sheet is laid out before the sampling starts.
  await expect(strip.locator(':scope > *').first()).toBeVisible();
  const from = await strip.evaluate(
    element => element.getBoundingClientRect().top,
  );
  // 10 onto 5: five rows down the strip.
  const to = from + 5 * ROW;
  await strip.evaluate(element => {
    const recorder = {frames: [] as DrawnFrame[], isDone: false};
    (window as unknown as {hourTurn: typeof recorder}).hourTurn = recorder;
    const sample = (at: number) => {
      recorder.frames.push({at, y: element.getBoundingClientRect().top});
      if (!recorder.isDone) {
        requestAnimationFrame(sample);
      }
    };
    requestAnimationFrame(sample);
  });
  // 10 PM is past the 5 PM maximum: the field clamps to it. A finger taps the
  // PM row, one below the band. The options lie under the drawn rows, so the
  // tap goes to the column's own recognizer, as a finger's does.
  const pm = await meridiem
    .getByRole('option', {name: 'PM'})
    .evaluate(el => el.getBoundingClientRect().toJSON() as DOMRect);
  await page.touchscreen.tap(pm.x + pm.width / 2, pm.y + pm.height / 2);
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
  await expect(selectedHour(hours)).toHaveText('5');
  // From 10 onto 5 through the rows between, as UIDatePicker turns onto its
  // maximum, never a jump, and only ever one way.
  expectAnimatedTurn(frames, from, to);
});

test('on a starved main thread, a meridiem change past the maximum still comes to rest on it (component:DateInput FR13, FR14)', async ({
  page,
}) => {
  const {field, hours} = await openHourWheel(page);
  const meridiem = page.getByRole('listbox', {name: 'AM/PM'});
  const pm = await meridiem
    .getByRole('option', {name: 'PM'})
    .evaluate(el => el.getBoundingClientRect().toJSON() as DOMRect);
  // Frames come late and few, as on a slow phone.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', {rate: 8});
  try {
    await page.touchscreen.tap(pm.x + pm.width / 2, pm.y + pm.height / 2);
    // The wheels are at rest when two reads in a row find the same value,
    // rows and positions, and no timed animation runs.
    let previous = '';
    await expect
      .poll(
        async () => {
          const now = await page.evaluate(() => {
            const field = document.querySelector<HTMLInputElement>(
              'input[role="combobox"]',
            );
            const boxes = [...document.querySelectorAll('[role="listbox"]')];
            return JSON.stringify({
              value: field?.value,
              rows: boxes.map(
                box => box.querySelector('[aria-selected="true"]')?.textContent,
              ),
              tops: [...document.querySelectorAll('[data-wheel-strip]')].map(
                strip => Math.round(strip.getBoundingClientRect().top),
              ),
              scrolls: boxes.map(box => Math.round(box.scrollTop)),
              // Scroll-driven row effects run for as long as the rows show;
              // only the clock's animations move the wheels on their own.
              running: document
                .getAnimations()
                .filter(
                  animation =>
                    animation.playState === 'running' &&
                    animation.timeline === document.timeline,
                ).length,
            });
          });
          const isAtRest = now === previous && now.endsWith('"running":0}');
          previous = now;
          return isAtRest;
        },
        {timeout: 30_000, intervals: [500]},
      )
      .toBe(true);
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', {rate: 1});
  }
  // 10 PM clamps to the 5 PM maximum, and no late frame moves it on.
  await expect(field).toHaveValue('5:00 PM');
  await expect(selectedHour(hours)).toHaveText('5');
});

test.describe('under a mouse', () => {
  // A desktop: today's column, in the sheet the story asks for.
  test.use({
    hasTouch: false,
    isMobile: false,
    viewport: {width: 1280, height: 800},
    deviceScaleFactor: 1,
  });

  /**
   * A slow mouse drag. The drag starts past its slop, and the release carries
   * no velocity, so the column snaps to the row it is let go on.
   */
  async function mouseDrag(page: Page, wheel: Locator, dy: number) {
    const box = await wheel.boundingBox();
    if (box == null) {
      throw new Error('no rendered bounds');
    }
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const steps = 30;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) {
      await sleep(16);
      await page.mouse.move(x, y + (dy * i) / steps);
    }
    await sleep(200);
    await page.mouse.up();
  }

  /** Today's row height, and the mouse's slop with room to spare. */
  async function rowOf(hours: Locator) {
    return hours
      .locator('[role="option"]')
      .first()
      .evaluate(el => el.getBoundingClientRect().height);
  }
  const MOUSE_SLOP_ALLOWANCE = 8;

  async function openHourWheelWithMouse(page: Page) {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-timeinput--bottom-sheet-with-min-max&viewMode=story`,
    );
    const field = page.getByRole('combobox', {name: 'Appointment time'});
    await expect(field).toHaveValue('10:00 AM');
    await field.click();
    const hours = page.getByRole('listbox', {name: 'Hour'});
    await expect(hours).toBeVisible();
    // Today's column, not the touch one.
    await expect(page.locator('[data-wheel]')).toHaveCount(0);
    await sleep(800);
    return {field, hours};
  }

  test('a wheel dragged below the minimum comes to rest on the minimum', async ({
    page,
  }) => {
    const {field, hours} = await openHourWheelWithMouse(page);
    // 10 → 7: the content follows the hand, three rows down, past 9 AM.
    await mouseDrag(
      page,
      hours,
      3 * (await rowOf(hours)) + MOUSE_SLOP_ALLOWANCE,
    );

    await expect(selectedHour(hours)).toHaveText('9', {timeout: 3000});
    await expect(field).toHaveValue('9:00 AM');
  });

  test('a wheel dragged onto a row inside the bounds commits that row', async ({
    page,
  }) => {
    const {field, hours} = await openHourWheelWithMouse(page);
    // 10 → 11: one row up, still inside the bounds.
    await mouseDrag(
      page,
      hours,
      -((await rowOf(hours)) + MOUSE_SLOP_ALLOWANCE),
    );

    await expect(selectedHour(hours)).toHaveText('11', {timeout: 3000});
    await expect(field).toHaveValue('11:00 AM');
  });

  test('under Reduce Motion, a disabled row fades toward the edges without tipping', async ({
    page,
  }) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    const {hours} = await openHourWheelWithMouse(page);
    await expectFinePointer(page);
    // Two rows above the band (8 AM), outside the bounds: dimmed, and flat.
    const row = hours.locator('[role="option"]').nth(7);
    await expect(row).toHaveText('8');
    await expect(row).toHaveAttribute('aria-disabled', 'true');
    const {opacity, transform} = await row.locator('span').evaluate(el => {
      const style = getComputedStyle(el);
      return {opacity: Number(style.opacity), transform: style.transform};
    });
    expect(opacity).toBeLessThan(0.95);
    expect(transform).toBe('none');
  });

  test('under Reduce Motion, the enabled rows fade toward the edges in colour without tipping', async ({
    page,
  }) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-wheel--minutes&viewMode=story`,
    );
    await expectFinePointer(page);
    const rows = page
      .getByRole('listbox', {name: 'Minute'})
      .locator('[role="option"] > span');
    await expect(rows.first()).toBeVisible();
    const drawn = async (index: number) =>
      rows.nth(index).evaluate(el => {
        const style = getComputedStyle(el);
        return {
          color: style.color,
          opacity: Number(style.opacity),
          transform: style.transform,
        };
      });
    // 00 sits under the band, and 01 and 02 sit one and two rows away. Both
    // are flat and opaque, and 02 is further along the colour fade.
    const near = await drawn(1);
    const far = await drawn(2);
    for (const row of [near, far]) {
      expect(row.transform).toBe('none');
      expect(row.opacity).toBe(1);
    }
    expect(far.color).not.toBe(near.color);
  });
});
