// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CarouselPaging.interaction.browser.spec.ts
 * @input The built "Paging" Carousel stories (`hasSnap`: full-width pages,
 *   loop, cards, a long page) and "With Padding", real touch input (Chromium
 *   CDP / WebKit's input command) and the interaction harness
 * @output Proof that a snapping Carousel with its buttons on a touch screen
 *   pages like a UIKit paging scroll view whose pages are its children: the
 *   pager owns horizontal pans (touch-action), a slow drag past half a page
 *   and a fast flick each move exactly one child, cards page one by one and
 *   the last ones rest where the row ends, padding keeps its inset, the edge
 *   fade follows the page, a vertical drag leaves the pages alone, the Next
 *   button plays setContentOffset(animated:)'s curve, under Reduce Motion
 *   the settle and Next cross-fade without travel, with hasLoop Next on the
 *   last page returns to the first, a settle keeps advancing through a
 *   blocked main thread, a drag changes only styles (no React render), and
 *   storyboards of a swipe and of a card flick
 * @position Browser proof for Carousel `hasSnap` under a finger
 *   (useCarouselPaging + hooks/usePager.ts), run by `pnpm test:interaction`
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  animationStoryboard,
  armHold,
  busyWindowProof,
  compareCurve,
  curveOf,
  drag,
  flick,
  markElement,
  openStory,
  releaseAnimations,
  sampleCurve,
  startScreencast,
  timeline,
  toTouchEvents,
  touchDriver,
  trackMarker,
  waitForRest,
  withStorybook,
  type HeldAnimation,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';
import {solvePaging} from '../../motion/paging';

const storybook = withStorybook(test);

declare global {
  interface Window {
    frameTimes: number[];
    touchTimes: [string, number][];
    armFrames: () => void;
  }
}

/**
 * For a failure's load report, installed before each story loads: the
 * frames the page draws from each touch, press or click until 2 s after the
 * last, and each touch event's own time, read first (window capture, before
 * any listener can stop it).
 */
function installLoadRecorders() {
  window.frameTimes = [];
  let framesUntil = 0;
  let framing = false;
  const frame = (time: number) => {
    window.frameTimes.push(time);
    if (performance.now() < framesUntil) {
      requestAnimationFrame(frame);
    } else {
      framing = false;
    }
  };
  window.armFrames = () => {
    framesUntil = performance.now() + 2000;
    if (!framing) {
      framing = true;
      requestAnimationFrame(frame);
    }
  };
  for (const type of ['touchstart', 'pointerdown', 'click']) {
    addEventListener(type, window.armFrames, {capture: true, passive: true});
  }
  window.touchTimes = [];
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
    addEventListener(
      type,
      event => window.touchTimes.push([type, event.timeStamp]),
      {capture: true, passive: true},
    );
  }
}

/**
 * The touch script the case played last: the times (ms) of the steps that
 * reach the page as events (a move where no finger moved sends none) and the
 * page's clock when it began.
 */
let played: {steps: ReadonlyArray<number>; from: number} | null = null;
test.beforeEach(async ({page}) => {
  played = null;
  await page.addInitScript(installLoadRecorders);
});

/** The touch driver, noting each script it plays for the load report. */
async function recordingScripts(page: Page): Promise<TouchDriver> {
  const driver = await touchDriver(page);
  return {
    ...driver,
    play: async (script, options) => {
      const where = new Map<number, string>();
      const steps: number[] = [];
      for (const step of toTouchEvents(script)) {
        const moved = step.changed.some(
          finger => where.get(finger.id) !== `${finger.x},${finger.y}`,
        );
        for (const finger of step.changed) {
          where.set(finger.id, `${finger.x},${finger.y}`);
        }
        if (step.type !== 'touchMove' || moved) {
          steps.push(step.t);
        }
      }
      played = {steps, from: await page.evaluate(() => performance.now())};
      return driver.play(script, options);
    },
  };
}

/**
 * What the page received and drew while a case ran, put before a failed
 * case's own messages so a failure under load names its cause with numbers:
 * touch input against the script it played (touches that took over 30 ms
 * longer than the script are a stall, a closest gap under a quarter of the
 * script's a burst), and the longest gap between the frames drawn from the
 * input on (over 50 ms is frame starvation).
 */
async function loadReport(page: Page): Promise<string> {
  const drawn = await page.evaluate(() => ({
    frames: window.frameTimes ?? [],
    touches: window.touchTimes ?? [],
    origin: performance.timeOrigin,
  }));
  // Some engines stamp events in epoch milliseconds.
  const at = (time: number) => (time > 1e12 ? time - drawn.origin : time);
  const ms = (value: number) => `${value.toFixed(1)} ms`;
  const causes: string[] = [];
  const script = played;
  const touches = drawn.touches
    .map(([, time]) => at(time))
    .filter(time => script == null || time >= script.from);
  if (script != null && script.steps.length > 1 && touches.length > 1) {
    const gaps = (times: ReadonlyArray<number>) =>
      times.slice(1).map((time, i) => time - times[i]);
    const arrived = gaps(touches);
    const scripted = gaps(script.steps);
    const longest = Math.max(...arrived);
    const closest = Math.min(...arrived);
    const scriptedClosest = Math.min(...scripted);
    const took = touches[touches.length - 1] - touches[0];
    const scriptedTook =
      script.steps[script.steps.length - 1] - script.steps[0];
    const named = [
      took > scriptedTook + 30
        ? `a stall (the touches took ${ms(took)}, scripted ${ms(scriptedTook)}; the longest gap ${ms(longest)})`
        : null,
      closest < scriptedClosest / 4
        ? `a burst (touch events ${ms(closest)} apart, the script's closest ${ms(scriptedClosest)})`
        : null,
    ].filter(Boolean);
    const span = `${touches.length} touch events over ${ms(took)}, scripted ${script.steps.length} over ${ms(scriptedTook)}, ${ms(closest)}–${ms(longest)} apart`;
    causes.push(
      named.length > 0
        ? `real-time touch input with ${named.join(' and ')}: ${span}`
        : `touch input on its script: ${span}`,
    );
  }
  if (drawn.frames.length > 1) {
    const longest = Math.max(
      ...drawn.frames.slice(1).map((time, i) => time - drawn.frames[i]),
    );
    causes.push(
      longest > 50
        ? `frame starvation: no frame drawn for ${ms(longest)}`
        : `frames on pace (longest gap ${ms(longest)})`,
    );
  }
  return `Load report: ${causes.length > 0 ? causes.join('; ') : 'no input or frames recorded'}.`;
}

// A failed case's messages begin with its load report.
test.afterEach(async ({page}, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus || page.isClosed()) {
    return;
  }
  const report = await loadReport(page).catch(
    (error: unknown) => `Load report unavailable: ${String(error)}.`,
  );
  for (const error of testInfo.errors) {
    error.message = `${report}\n${error.message ?? ''}`;
    if (error.stack != null) {
      error.stack = `${report}\n${error.stack}`;
    }
  }
});

interface OpenCarousel {
  driver: TouchDriver;
  scroller: Locator;
  track: Locator;
  /** One page plus the gap, px. */
  stride: number;
  /** A point on the pages: their vertical middle, near the trailing edge. */
  grab: {x: number; y: number};
  width: number;
}

async function openPaging(
  page: Page,
  story = 'core-carousel--paging',
): Promise<OpenCarousel> {
  // The phone projects have a coarse primary pointer: the touch presentation
  // on any engine (one touch model; nothing asks for iOS).
  await openStory(page, storybook(), story);
  const driver = await recordingScripts(page);
  const region = page.getByRole('region').first();
  const scroller = region.locator('> div').first();
  const track = scroller.locator('> div').first();
  const geometry = await scroller.evaluate(el => {
    const box = el.getBoundingClientRect();
    const trackEl = el.firstElementChild as HTMLElement;
    const gap = parseFloat(getComputedStyle(trackEl).columnGap) || 0;
    return {
      x: box.x,
      y: box.y,
      width: el.clientWidth,
      height: box.height,
      gap,
    };
  });
  return {
    driver,
    scroller,
    track,
    stride: geometry.width + geometry.gap,
    width: geometry.width,
    grab: {
      x: geometry.x + geometry.width * 0.8,
      y: geometry.y + geometry.height / 2,
    },
  };
}

/**
 * How far a settle's frames are from UIKit's paging settle (`solvePaging`)
 * for the release velocity that fits them best, px. The settle starts from
 * the velocity the pan read at the lift, which the stories do not expose and
 * which bunched input on a loaded runner makes faster than the script's, so
 * the curve is judged for its own release velocity: its shape, start and end
 * are UIKit's, whatever the lift.
 */
function pagingFit(frames: ReadonlyArray<{t: number; x: number}>): {
  velocity: number;
  maxError: number;
} {
  const from = frames[0].x;
  const to = frames[frames.length - 1].x;
  const errorAt = (velocity: number) => {
    const curve = solvePaging({from, velocity, to});
    return Math.max(...frames.map(f => Math.abs(curve.at(f.t / 1000) - f.x)));
  };
  let velocity = 0;
  let maxError = errorAt(0);
  for (let v = -40_000; v <= 40_000; v += 250) {
    const error = errorAt(v);
    if (error < maxError) {
      velocity = v;
      maxError = error;
    }
  }
  for (let step = 125; step >= 1; step /= 2) {
    for (const v of [velocity - step, velocity + step]) {
      const error = errorAt(v);
      if (error < maxError) {
        velocity = v;
        maxError = error;
      }
    }
  }
  return {velocity, maxError};
}

const trackX = async (track: Locator) =>
  track.evaluate(el => {
    const value = getComputedStyle(el).translate;
    return value === 'none' ? 0 : parseFloat(value);
  });

/** The title of the page under the viewport's centre. */
const pageOnScreen = async (scroller: Locator) =>
  scroller.evaluate(el => {
    const box = el.getBoundingClientRect();
    const hit = document.elementFromPoint(
      box.x + box.width / 2,
      box.y + box.height / 2,
    );
    return hit?.closest('[aria-roledescription="slide"]')?.querySelector('h3')
      ?.textContent;
  });

test('the pager owns horizontal pans; nothing scrolls natively', async ({
  page,
}) => {
  const {scroller} = await openPaging(page);
  const style = await scroller.evaluate(el => ({
    touchAction: getComputedStyle(el).touchAction,
    overflowX: getComputedStyle(el).overflowX,
  }));
  expect(style.touchAction).toBe('pan-y pinch-zoom');
  expect(style.overflowX).toBe('clip');
});

test('a slow drag past half a page and a fast flick each move exactly one page', async ({
  page,
}) => {
  const {driver, scroller, track, stride, width, grab} = await openPaging(page);
  expect(await pageOnScreen(scroller)).toBe('Plan');
  // 60 % of a page at under 300 px/s, then still: the nearest page.
  await driver.play(
    drag(
      grab,
      {x: grab.x - 0.6 * width, y: grab.y},
      {durationMs: 1000, restMs: 120},
    ),
  );
  await waitForRest(track);
  expect(await trackX(track)).toBeCloseTo(-stride, 0);
  expect(await pageOnScreen(scroller)).toBe('Pack');
  // A hard flick from rest: still one page.
  await driver.play(
    flick(grab, {velocity: {x: -3000, y: 0}, durationMs: 80, hz: 120}),
  );
  await waitForRest(track);
  expect(await trackX(track)).toBeCloseTo(-2 * stride, 0);
  expect(await pageOnScreen(scroller)).toBe('Go');
});

test('a vertical drag leaves the pages alone', async ({page}) => {
  const {driver, track, grab} = await openPaging(page);
  await driver.play(
    drag(grab, {x: grab.x - 20, y: grab.y - 120}, {durationMs: 300}),
  );
  await page.waitForTimeout(100);
  expect(await trackX(track)).toBeCloseTo(0, 0);
});

test("the Next button plays setContentOffset(animated:)'s curve", async ({
  page,
}) => {
  const {driver, track, stride} = await openPaging(page);
  const next = page.getByRole('button', {name: 'Scroll right'});
  const box = await next.boundingBox();
  if (box == null) {
    throw new Error('no Next button');
  }
  // The page holds the curve at its first frame itself (armHold): a hold
  // sent once the curve runs reaches a loaded page late, after a short
  // curve can have ended.
  const hold = await armHold(page, track);
  await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  const held = await hold.held();
  const end = Math.max(...held.map(a => a.curveEndMs));
  expect(end).toBeGreaterThan(290);
  expect(end).toBeLessThan(310);
  const samples = curveOf(
    await sampleCurve(track, timeline(end)),
    'translateX',
  );
  const result = compareCurve(
    samples,
    t => (-stride * (1 - Math.cos(Math.PI * Math.min(1, t / 300)))) / 2,
    0.5,
  );
  expect(result.maxError).toBeLessThan(0.5);
  await releaseAnimations(page);
});

test('with hasLoop, a swipe past the last page rubber-bands back, and Next there returns to the first', async ({
  page,
}) => {
  const {driver, scroller, track, grab} = await openPaging(
    page,
    'core-carousel--paging-loop',
  );
  const titles: (string | null | undefined)[] = [];
  for (let i = 0; i < 5; i++) {
    await driver.play(
      flick(grab, {velocity: {x: -1500, y: 0}, durationMs: 100, hz: 120}),
    );
    await waitForRest(track);
    titles.push(await pageOnScreen(scroller));
  }
  // A paging scroll view does not loop: the fifth flick returns to the last.
  expect(titles).toEqual(['Pack', 'Go', 'Share', 'Remember', 'Remember']);
  const next = page.getByRole('button', {name: 'Scroll right'});
  const box = await next.boundingBox();
  if (box == null) {
    throw new Error('no Next button');
  }
  await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  await waitForRest(track);
  expect(await pageOnScreen(scroller)).toBe('Plan');
});

/** Each slide's start edge from the track's, and where the track can go. */
const slideGeometry = async (scroller: Locator) =>
  scroller.evaluate(el => {
    const trackEl = el.firstElementChild as HTMLElement;
    const box = trackEl.getBoundingClientRect();
    const style = getComputedStyle(el);
    const inner =
      el.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight);
    const slides = Array.from(trackEl.children).map(child => {
      const rect = child.getBoundingClientRect();
      return {start: rect.left - box.left, end: rect.right - box.left};
    });
    const extent = Math.max(...slides.map(slide => slide.end));
    return {
      starts: slides.map(slide => slide.start),
      end: extent - inner,
      viewLeft: el.getBoundingClientRect().left,
      padding: parseFloat(style.paddingLeft),
    };
  });

test('cards: a flick moves one card, and the last cards rest where the row ends', async ({
  page,
}) => {
  const {driver, scroller, track, grab} = await openPaging(
    page,
    'core-carousel--paging-cards',
  );
  const {starts, end} = await slideGeometry(scroller);
  expect(end).toBeGreaterThan(starts[1]);
  await driver.play(
    flick(grab, {velocity: {x: -1500, y: 0}, durationMs: 100, hz: 120}),
  );
  await waitForRest(track);
  expect(await trackX(track)).toBeCloseTo(-starts[1], 0);
  for (let i = 0; i < starts.length; i++) {
    await driver.play(
      flick(grab, {velocity: {x: -1500, y: 0}, durationMs: 100, hz: 120}),
    );
    await waitForRest(track);
  }
  expect(await trackX(track)).toBeCloseTo(-end, 0);
  await expect(page.getByRole('button', {name: 'Scroll right'})).toBeDisabled();
});

test('padding keeps its inset: a flick lands the next child at the padded start edge', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-carousel--with-padding');
  const driver = await recordingScripts(page);
  const scroller = page.getByRole('region').first().locator('> div').first();
  const track = scroller.locator('> div').first();
  const {starts, viewLeft, padding} = await slideGeometry(scroller);
  expect(padding).toBeGreaterThan(0);
  const box = await scroller.boundingBox();
  if (box == null) {
    throw new Error('no scroller');
  }
  await driver.play(
    flick(
      {x: box.x + box.width * 0.8, y: box.y + box.height / 2},
      {velocity: {x: -1500, y: 0}, durationMs: 100, hz: 120},
    ),
  );
  await waitForRest(track);
  expect(await trackX(track)).toBeCloseTo(-starts[1], 0);
  const second = await page
    .locator('[aria-roledescription="slide"]')
    .nth(1)
    .boundingBox();
  expect(second?.x).toBeCloseTo(viewLeft + padding, 0);
});

test('the edge fade follows the page: toward the end on the first page, toward the start on the last', async ({
  page,
}) => {
  const {driver, scroller, track, grab} = await openPaging(page);
  const mask = async () =>
    scroller.evaluate(el => {
      const style = getComputedStyle(el) as CSSStyleDeclaration & {
        webkitMaskImage?: string;
      };
      return style.maskImage !== '' && style.maskImage !== 'none'
        ? style.maskImage
        : (style.webkitMaskImage ?? '');
    });
  expect(await mask()).toContain('to left');
  for (let i = 0; i < 4; i++) {
    await driver.play(
      flick(grab, {velocity: {x: -1500, y: 0}, durationMs: 100, hz: 120}),
    );
    await waitForRest(track);
  }
  expect(await mask()).toContain('to right');
  expect(await mask()).not.toContain('calc(100%');
});

test('in a scrolling page: a vertical drag scrolls the page, a horizontal one pages, and a diagonal one goes to its dominant axis (35° pages, 50° scrolls)', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'injected touches do not scroll natively in Linux WebKit (harness README)',
  );
  const {driver, scroller, track, stride, width, grab} = await openPaging(
    page,
    'core-carousel--paging-in-long-page',
  );
  const scrollY = async () => page.evaluate(() => window.scrollY);
  // Steep (vertical): the page scrolls, the pages stay.
  await driver.play(
    drag(
      grab,
      {x: grab.x - 10, y: grab.y - 150},
      {durationMs: 400, restMs: 120},
    ),
  );
  await page.waitForTimeout(300);
  const scrolled = await scrollY();
  expect(scrolled).toBeGreaterThan(80);
  expect(await trackX(track)).toBeCloseTo(0, 0);
  // Horizontal: one page, the page holds still.
  const box = await scroller.boundingBox();
  if (box == null) {
    throw new Error('no scroller');
  }
  const mid = {x: box.x + box.width * 0.8, y: box.y + box.height / 2};
  await driver.play(
    drag(
      mid,
      {x: mid.x - 0.6 * width, y: mid.y},
      {durationMs: 600, restMs: 120},
    ),
  );
  await waitForRest(track);
  expect(await trackX(track)).toBeCloseTo(-stride, 0);
  expect(await scrollY()).toBeCloseTo(scrolled, 0);
  // UIKit (a pager inside a vertical scroll view): the drag's dominant axis
  // decides, once. 35° from horizontal is the pager's: past half a page it
  // pages, and the page holds still. That holds here because Chromium holds
  // back moves inside its touch slop, so the pan begins on its first move;
  // Mobile Safari claims a slow drag for the page at about 10–11 px, before
  // the pan's 10 pt start, so on the iOS 26.2 simulator a drag steeper than
  // about 27° scrolls the page instead (25° pages, 30° and 35° scroll).
  const diagonal = (degrees: number, length: number) => {
    const angle = (degrees * Math.PI) / 180;
    return drag(
      mid,
      {
        x: mid.x - length * Math.cos(angle),
        y: mid.y - length * Math.sin(angle),
      },
      {durationMs: 700, restMs: 120},
    );
  };
  await driver.play(
    diagonal(35, (0.6 * width) / Math.cos((35 * Math.PI) / 180)),
  );
  await waitForRest(track);
  expect(await trackX(track)).toBeCloseTo(-2 * stride, 0);
  expect(await scrollY()).toBeCloseTo(scrolled, 0);
  // 50° is the page's: it scrolls, and the pages stay.
  await driver.play(diagonal(50, 200));
  await page.waitForTimeout(300);
  expect(await trackX(track)).toBeCloseTo(-2 * stride, 0);
  expect(await scrollY()).toBeGreaterThan(scrolled + 80);
});

test('on an Android phone (no -webkit-touch-callout) the pager pages too: one touch model, no platform idiom', async ({
  page,
}) => {
  const {driver, scroller, track, stride, width, grab} = await openPaging(page);
  expect(
    await scroller.evaluate(el => ({
      overflowX: getComputedStyle(el).overflowX,
      coarse: matchMedia('(pointer: coarse)').matches,
      ios: CSS.supports('(-webkit-touch-callout: none)'),
    })),
  ).toEqual({overflowX: 'clip', coarse: true, ios: false});
  // The pager follows the finger past half a page: the next page, whatever
  // the release speed.
  await driver.play(
    drag(
      grab,
      {x: grab.x - 0.6 * width, y: grab.y},
      {durationMs: 1000, restMs: 0},
    ),
  );
  await waitForRest(track);
  expect(await trackX(track)).toBeCloseTo(-stride, 0);
  // The scroller never scrolled natively.
  expect(await scroller.evaluate(el => el.scrollLeft)).toBe(0);
});

test("under Reduce Motion a scrolling carousel's Next cross-fades and jumps while transparent (design:reduced-motion DR2, a coarse pointer)", async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await openStory(page, storybook(), 'core-carousel--default');
  const scroller = page.getByRole('region').first().locator('> div').first();
  const hold = await armHold(page, scroller);
  await page.getByRole('button', {name: 'Scroll right'}).click();
  const held = await hold.held();
  expect(held.length).toBeGreaterThan(0);
  for (const a of held) {
    // Opacity only (DR1), each half of the 200 ms fade.
    expect(
      a.keyframes.every(k =>
        Object.keys(k).every(key =>
          [
            'opacity',
            'offset',
            'easing',
            'composite',
            'computedOffset',
          ].includes(key),
        ),
      ),
    ).toBe(true);
    expect(a.curveEndMs).toBeLessThanOrEqual(100);
  }
  // Still in place while the fade-out holds: it jumps once transparent.
  expect(await scroller.evaluate(el => el.scrollLeft)).toBe(0);
  await releaseAnimations(page);
  await expect
    .poll(async () => scroller.evaluate(el => el.scrollLeft))
    .toBeGreaterThan(0);
});

/**
 * At most a jump: `property` holds its start value, then its end value, and
 * never one in between (design:reduced-motion DR1; a cross-fade moves the
 * track while it is transparent).
 */
const holdsOrJumps = (
  keyframes: ReadonlyArray<Record<string, unknown>>,
  property: string,
): boolean => {
  const values = new Set<string>();
  for (const k of keyframes) {
    const v = k[property];
    if (typeof v === 'string' || typeof v === 'number') {
      values.add(String(v));
    }
  }
  return values.size <= 2;
};

test('under Reduce Motion the settle and Next do not travel: an opacity cross-fade of at most 200 ms on a coarse pointer (design:reduced-motion DR2)', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  const {driver, track, grab, stride} = await openPaging(page);
  // The phone projects have a coarse pointer, the case DR2 covers.
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(true);
  const crossFadesOnly = (animations: ReadonlyArray<HeldAnimation>) => {
    expect(animations.length).toBeGreaterThan(0);
    for (const a of animations) {
      // Nothing travels: the track holds, then jumps under the fade (DR1).
      expect(holdsOrJumps(a.keyframes, 'translate')).toBe(true);
      expect(holdsOrJumps(a.keyframes, 'transform')).toBe(true);
      expect(a.curveEndMs).toBeLessThanOrEqual(200);
    }
  };
  const settle = await armHold(page, track);
  await driver.play(flick(grab, {velocity: {x: -1500, y: 0}, durationMs: 100}));
  crossFadesOnly(await settle.held());
  await releaseAnimations(page);
  await waitForRest(track);
  expect(await trackX(track)).toBeCloseTo(-stride, 0);
  const next = await armHold(page, track);
  await page.getByRole('button', {name: 'Scroll right'}).click();
  crossFadesOnly(await next.held());
  await releaseAnimations(page);
  await waitForRest(track);
  expect(await trackX(track)).toBeCloseTo(-2 * stride, 0);
});

test('a drag writes only styles: no render, no layout change in the tree', async ({
  page,
}) => {
  const {driver, scroller, width, grab} = await openPaging(page);
  await scroller.evaluate(el => {
    const records: string[] = [];
    (window as unknown as {mutations: string[]}).mutations = records;
    new MutationObserver(list => {
      for (const m of list) {
        const target = m.target as HTMLElement;
        const role =
          target === el.firstElementChild
            ? 'track'
            : (target.getAttribute('aria-roledescription') ?? target.tagName);
        records.push(`${m.type}:${m.attributeName ?? ''}:${role}`);
      }
    }).observe(el, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  });
  await driver.play(
    drag(
      grab,
      {x: grab.x - 0.3 * width, y: grab.y},
      {durationMs: 500, restMs: 120},
    ),
  );
  const mutations = await page.evaluate(
    () => (window as unknown as {mutations: string[]}).mutations,
  );
  // The track's translate (per move) and the slides' layers (at the drag's
  // start and at rest); nothing else.
  expect(mutations.length).toBeGreaterThan(10);
  for (const m of mutations) {
    expect(m).toMatch(/^attributes:style:(track|slide)$/);
  }
});

test('a settle keeps advancing every frame through a blocked main thread', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    "WebKit's screencast clock is not the page's, so a 0.3 s settle cannot be placed inside the block; Mobile Safari on the iOS simulator is the WebKit evidence",
  );
  const {driver, scroller, width, grab} = await openPaging(page);
  const second = page.locator('[aria-roledescription="slide"]').nth(1);
  await markElement(second, {inset: 8});
  // 100 ms after the finger lifts, block the main thread for 800 ms.
  await scroller.evaluate(el => {
    el.addEventListener(
      'touchend',
      () => {
        setTimeout(() => {
          const from = performance.timeOrigin + performance.now();
          const end = performance.now() + 800;
          while (performance.now() < end) {
            // busy
          }
          (window as unknown as {busy: unknown}).busy = {
            from,
            to: performance.timeOrigin + performance.now(),
            spins: 0,
          };
        }, 100);
      },
      {once: true, passive: true},
    );
  });
  const cast = await startScreencast(page);
  await page.waitForTimeout(300);
  await driver.play(
    flick(grab, {velocity: {x: -1200, y: 0}, durationMs: 80, hz: 120}),
  );
  await page.waitForTimeout(1300);
  const busy = await page.evaluate(
    () =>
      (window as unknown as {busy: {from: number; to: number; spins: number}})
        .busy,
  );
  const tracked = await trackMarker(page, await cast.stop());
  // The settle lasts about 0.33 s from the lift: judge the block's first 200 ms.
  const spanned = {...busy, to: busy.from + 200};
  const proof = busyWindowProof(tracked, spanned, {
    axis: 'x',
    settledWithin: 1,
  });
  test.info().annotations.push({
    type: 'busy window',
    description: JSON.stringify({...proof, window: undefined}),
  });
  expect(proof.frames).toBeGreaterThanOrEqual(proof.expectedFrames - 2);
  expect(proof.changed).toBeGreaterThanOrEqual(proof.frames - 3);
  expect(width).toBeGreaterThan(0);
});

for (const [name, story, velocity] of [
  ['swipe', 'core-carousel--paging', -1200],
  ['cards', 'core-carousel--paging-cards', -1200],
] as const) {
  test(`storyboard: ${name} @storyboard`, async ({page}) => {
    const {driver, scroller, track, grab, width} = await openPaging(
      page,
      story,
    );
    const from = velocity < 0 ? grab : {x: grab.x - width * 0.6, y: grab.y};
    const hold = await armHold(page, track);
    await driver.play(
      flick(from, {velocity: {x: velocity, y: 0}, durationMs: 80, hz: 120}),
    );
    const held = await hold.held();
    const box = await scroller.boundingBox();
    if (box == null) {
      throw new Error('no scroller');
    }
    const {storyboard} = await animationStoryboard(page, {
      name: `carousel-paging-${name}`,
      held,
      clip: {x: box.x, y: box.y, width: box.width, height: box.height},
      measure: async () => ({x: await trackX(track)}),
    });
    await storyboard.write(test.info());
    // Every frame, the landing included, is on UIKit's paging settle for the
    // release velocity the curve starts from, within 1.5 px. The frames are
    // on the film's timeline, from the earliest held start; the settle is the
    // track's translate.
    const origin = Math.min(
      ...held.filter(a => Number.isFinite(a.curveEndMs)).map(a => a.offsetMs),
    );
    const settle = held.find(a =>
      a.keyframes.some(k => k.translate != null && k.translate !== 'none'),
    );
    expect(settle).toBeDefined();
    const frames = storyboard.frames.map(f => ({
      t: f.t + origin - (settle?.offsetMs ?? 0),
      x: (f.data as {x: number}).x,
    }));
    const fit = pagingFit(frames.filter(f => f.t >= 0));
    test.info().annotations.push({
      type: 'paging fit',
      description: JSON.stringify(fit),
    });
    expect(fit.maxError).toBeLessThan(1.5);
    await releaseAnimations(page);
  });
}
