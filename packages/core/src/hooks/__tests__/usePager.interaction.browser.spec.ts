// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file usePager.interaction.browser.spec.ts
 * @input The pager and the paging math bundled with esbuild onto a fixture
 *   page (a 402 px viewport over five pages); real touch input (Chromium CDP
 *   with scripted timestamps, WebKit's input command); the interaction
 *   harness's curve sampling, screencast, busy-main-thread, trace and
 *   storyboard instruments; Chromium and WebKit on the phone profile
 * @output Proof that the pager pages like a UIKit paging scroll view on the
 *   compositor: a slow drag past half a page settles on the next page on
 *   UIKit's paging curve; a flick pages exactly one page and its settle starts
 *   from the release velocity; the end rubber-bands and returns; goTo plays
 *   setContentOffset(animated:)'s curve; a settle keeps advancing every frame
 *   through an 800 ms main-thread block; no Layout or Paint while it settles;
 *   storyboards of each motion with asserted traces
 * @position Browser proof for hooks/usePager.ts, run by `pnpm test:interaction`
 */

import {fileURLToPath} from 'node:url';
import {
  animationStoryboard,
  busyWindowProof,
  compareCurve,
  countBetween,
  curveOf,
  drag,
  flick,
  holdAnimations,
  markElement,
  merge,
  path,
  releaseAnimations,
  sampleCurve,
  startScreencast,
  timeline,
  toTouchEvents,
  touchDriver,
  traceRendering,
  trackMarker,
  waitForAnimation,
  waitForRest,
  webInputDriver,
  withFinger,
  writeEvidence,
} from '@astryxdesign/interaction-harness';
import {expect, test, type Locator, type Page} from '@playwright/test';
import {build} from 'esbuild';
import type * as PagerBundle from './pagerBundle';

declare global {
  interface Window {
    Pager: typeof PagerBundle;
    pager: ReturnType<typeof PagerBundle.createPager>;
    motionStart?: number;
    heldMotion: Animation[] | null;
    liftVelocities: number[];
    liftPositions: number[];
    frameTimes: number[];
    settleTimes: number[];
    armFrames: () => void;
    touchTimes: [string, number][];
    wheelTimes: number[];
    pagerLog: string[];
    cancelledMoves: boolean[];
    cancelledWheels: boolean[];
    minTrackX: number;
    /** Each move's position, and where the touch started (CSS px). */
    moves: [number, number][];
    touchStart: [number, number];
  }
}

let script = '';

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('./pagerBundle.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'Pager',
    target: 'es2022',
  });
  script = result.outputFiles[0].text;
});

/** The phone profile's page width: one page. */
const PAGE = 402;
const COUNT = 5;
const TOP = 80;
const HEIGHT = 300;

async function serve(
  page: Page,
  {rtl = false, startIndex = 1, tall = false} = {},
): Promise<void> {
  const pages = Array.from(
    {length: COUNT},
    (_, i) =>
      `<div class="page" style="background: hsl(${i * 70} 60% 70%)"><span>${i}</span></div>`,
  ).join('');
  const html = `<!doctype html><html dir="${rtl ? 'rtl' : 'ltr'}"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html, body { margin: 0; background: #fff; font: 600 48px system-ui; }
  #viewport { position: absolute; top: ${TOP}px; left: 0; width: ${PAGE}px; height: ${HEIGHT}px; overflow: hidden; }
  #track { display: flex; height: 100%; }
  .page { flex: 0 0 100%; height: 100%; display: grid; place-items: center; }
  ${tall ? 'body { height: 3000px; }' : ''}
</style>
<div id="viewport"><div id="track">${pages}</div></div>
<script>${script}</script>
<script>
  window.pagerLog = [];
  // Motion a test holds: while armed (window.heldMotion is a list), each
  // animation started on the track or inside it is held at its first frame
  // in the task that creates it (playback rate 0, still running), so a hold
  // taken any time later finds it there.
  window.heldMotion = null;
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (keyframes, options) {
    const animation = animate.call(this, keyframes, options);
    const track = document.getElementById('track');
    if (window.heldMotion != null && track != null && track.contains(this)) {
      animation.playbackRate = 0;
      window.heldMotion.push(animation);
    }
    return animation;
  };
  // Whether each move reached the page cancelled (read after every listener).
  window.cancelledMoves = [];
  // Whether each wheel reached the page cancelled (read after every listener).
  window.cancelledWheels = [];
  addEventListener('wheel', e => { window.cancelledWheels.push(e.defaultPrevented); }, {passive: true});
  window.moves = [];
  // For a failure's load report: the frames the page draws from each touch,
  // wheel or goTo until 2 s after the last, when each settle ends, and each
  // touch and wheel event's time.
  window.frameTimes = [];
  window.settleTimes = [];
  let framesUntil = 0;
  let framing = false;
  const frame = time => {
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
  addEventListener('touchstart', window.armFrames, {capture: true, passive: true});
  addEventListener('wheel', window.armFrames, {capture: true, passive: true});
  // Every touch and wheel event's own time, read first (window capture, before
  // any listener can stop it).
  window.touchTimes = [];
  window.wheelTimes = [];
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
    addEventListener(type, event => window.touchTimes.push([type, event.timeStamp]), {capture: true, passive: true});
  }
  addEventListener('wheel', event => window.wheelTimes.push(event.timeStamp), {capture: true, passive: true});
  addEventListener('touchstart', e => { window.touchStart = [e.touches[0].clientX, e.touches[0].clientY]; }, {passive: true});
  addEventListener('touchmove', e => { window.cancelledMoves.push(e.defaultPrevented); window.moves.push([e.touches[0].clientX, e.touches[0].clientY]); }, {passive: true});
  // The lift velocity the pager's pan reads at each release (its tracker's
  // scrollVelocity, the class the bundle shares with the pager) and where the
  // track was then, for the model checks of the releases.
  window.liftVelocities = [];
  window.liftPositions = [];
  const readScrollVelocity = Pager.VelocityTracker.prototype.scrollVelocity;
  Pager.VelocityTracker.prototype.scrollVelocity = function (releaseTime) {
    const velocity = readScrollVelocity.call(this, releaseTime);
    window.liftVelocities.push(velocity.x);
    const track = document.getElementById('track');
    window.liftPositions.push(track ? parseFloat(getComputedStyle(track).translate) || 0 : 0);
    return velocity;
  };
  window.pager = Pager.createPager({
    count: ${COUNT},
    defaultIndex: ${startIndex},
    // Notes whether the settle was already running on its curve when the
    // page was reported.
    onIndexChange: (i, reason) => window.pagerLog.push('index:' + i + ':' + reason +
      (document.getAnimations().some(a => a.playState === 'running' && a.startTime != null && a.currentTime > 20) ? ':moving' : '')),
    onSettle: (i, previous) => {
      window.settleTimes.push(performance.now());
      window.pagerLog.push('settle:' + i + ':' + previous);
    },
  });
  window.pager.attach(document.getElementById('viewport'), document.getElementById('track'));
</script></html>`;
  await page.route('http://pager.test/', async route =>
    route.fulfill({contentType: 'text/html', body: html}),
  );
  await page.goto('http://pager.test/');
}

async function open(page: Page, options: Parameters<typeof serve>[1] = {}) {
  await serve(page, options);
  return {
    track: page.locator('#track'),
    driver: await recordingScripts(page, await touchDriver(page)),
  };
}

/**
 * The fixture under a fine primary pointer: a real mouse and real wheel
 * input, no touch emulation (`spec:AST-094` FR43).
 */
async function openFine(page: Page, options: Parameters<typeof serve>[1] = {}) {
  await serve(page, options);
  return {track: page.locator('#track'), input: await webInputDriver(page)};
}

const log = async (page: Page) => page.evaluate(() => window.pagerLog);

/**
 * The touch script the case played last: the times (ms) of the steps that
 * reach the page as events (a move where no finger moved sends none) and the
 * page's clock when it began.
 */
let played: {steps: ReadonlyArray<number>; from: number} | null = null;
test.beforeEach(() => {
  played = null;
});

/** The touch driver, noting each script it plays for the load report. */
async function recordingScripts(
  page: Page,
  driver: Awaited<ReturnType<typeof touchDriver>>,
): Promise<Awaited<ReturnType<typeof touchDriver>>> {
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
 * - touch input against the script it played (the events' own timestamps, read
 *   first; in WebKit, real dispatch times): touches that took over 30 ms longer
 *   than the script are a stall, a closest gap under a quarter of the script's
 *   a burst (an engine may not send a move: the count can differ);
 * - wheel input: a pause of 220 ms between steps ends a trackpad swipe;
 * - the longest gap between the frames drawn from the input or goTo on: over
 *   50 ms is frame starvation;
 * - when each settle ended after the lift.
 */
async function loadReport(page: Page): Promise<string> {
  const drawn = await page.evaluate(() => ({
    frames: window.frameTimes,
    settles: window.settleTimes,
    touches: window.touchTimes,
    wheels: window.wheelTimes,
    origin: performance.timeOrigin,
  }));
  // Some engines stamp events in epoch milliseconds (GestureHost eventTime).
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
  const wheels = drawn.wheels.map(at);
  if (wheels.length > 1) {
    const longest = Math.max(
      ...wheels.slice(1).map((time, i) => time - wheels[i]),
    );
    causes.push(
      longest >= 220
        ? `real-time wheel input with a ${ms(longest)} pause between steps, which ends a trackpad swipe (220 ms)`
        : `wheel steps at most ${ms(longest)} apart`,
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
  const lift = drawn.touches.filter(([type]) => type === 'touchend').at(-1);
  for (const settle of drawn.settles) {
    if (lift != null && settle > at(lift[1])) {
      causes.push(`a settle ended ${ms(settle - at(lift[1]))} after the lift`);
    }
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

// A hold or a storyboard reads a motion a round trip after it starts, and on
// loaded cores a round trip can outlast a 0.2–0.3 s motion. These hold the
// motion at its first frame in the task that creates it (the fixture's
// animate() hook, armed before the input or goTo), so the read finds it there
// however late it comes. The hold reads the curve itself, which the freeze
// leaves as it is, and the animator retires a motion by its own time, never
// the wall clock, so a held motion runs its whole curve once resumed. Held, it
// has presented none of its curve: waitForAnimation takes it at
// minProgressMs 0.

/** Holds each motion that starts on the track from now on at its first frame. */
const holdNewMotion = async (page: Page) =>
  page.evaluate(() => {
    window.heldMotion = [];
  });

/** Calls `goTo(index)` with the motion it starts held at its first frame. */
const goToHeld = async (page: Page, index: number) =>
  page.evaluate(next => {
    window.armFrames();
    window.heldMotion = [];
    window.pager.goTo(next);
  }, index);

/** Plays the held motion at its own speed, and holds no new motion. */
const resumeHeldMotion = async (page: Page) =>
  page.evaluate(() => {
    for (const animation of window.heldMotion ?? []) {
      animation.playbackRate = 1;
    }
    window.heldMotion = null;
  });

/**
 * Whether a selection starting on the track's text is refused now: where iOS
 * WebKit does not run, the shared selection lock cancels `selectstart` and
 * writes no style; where it runs, the lock is `user-select: none` (WebKit
 * reports it only prefixed). `spec:AST-094` FR41.
 */
const refusesSelection = (el: Element) => {
  const event = new Event('selectstart', {bubbles: true, cancelable: true});
  (el.firstElementChild ?? el).dispatchEvent(event);
  const style = getComputedStyle(el) as CSSStyleDeclaration & {
    webkitUserSelect?: string;
  };
  const userSelect = style.userSelect || (style.webkitUserSelect ?? '');
  return event.defaultPrevented || userSelect === 'none';
};

/** The track's presented x (from the `translate` the pager drives). */
const trackX = async (track: Locator) =>
  track.evaluate(el => {
    const value = getComputedStyle(el).translate;
    return value === 'none' ? 0 : parseFloat(value);
  });

/**
 * The pager's release velocity for a script: the shared tracker read as a
 * scroll view reads it (a pan's `scrollVelocity()`), x only.
 */
async function releaseVelocities(
  page: Page,
  steps: ReturnType<typeof toTouchEvents>,
) {
  return page.evaluate(events => {
    const tracker = new window.Pager.VelocityTracker();
    let current = 0;
    for (const event of events) {
      if (event.type === 'touchEnd' || event.type === 'touchCancel') {
        // Read at the lift's time, as the recognizer reads it (the
        // stillness reset).
        current = tracker.scrollVelocity(event.t).x;
        break;
      }
      const finger = event.changed[0];
      tracker.add(finger.x, finger.y, event.t);
      if (event.type === 'touchMove') {
        current = tracker.scrollVelocity(event.t).x;
      }
    }
    return {current};
  }, steps);
}

/**
 * UIKit's paging settle for a release, from the lift velocity the pager's pan
 * read (recorded in the page as it read it; in WebKit, from the touches' real
 * dispatch times): the paging solver runs from where the settle starts onto
 * the page the pager chose. Returns the content offset at each of `times`
 * (ms into the settle).
 */
async function releaseModel(
  page: Page,
  {from, to, times}: {from: number; to: number; times: ReadonlyArray<number>},
) {
  return page.evaluate(
    input => {
      const lift = window.liftVelocities[window.liftVelocities.length - 1];
      // The pan's x velocity is the finger's; the content moves the other way.
      const curve = window.Pager.solvePaging({
        from: input.from,
        velocity: window.Pager.pagingSettleVelocity(-lift),
        to: input.to,
      });
      return {lift, offsets: input.times.map(t => curve.at(t / 1000))};
    },
    {from, to, times},
  );
}

/**
 * A slow 300 px drag `degrees` up from leftward (300 px/s along it): at 35°
 * and 45° its horizontal part passes half a page, so the pager that takes it
 * settles on the next page.
 */
function angled(degrees: number) {
  const rad = (degrees * Math.PI) / 180;
  const from = {x: 340, y: TOP + HEIGHT / 2};
  return drag(
    from,
    {x: from.x - 300 * Math.cos(rad), y: from.y - 300 * Math.sin(rad)},
    {durationMs: 1000},
  );
}

for (const degrees of [35, 45]) {
  test(`in a scrolling page, a ${degrees}° drag is the pager's: it pages, its moves are cancelled from the pan's start at 10 pt, and the page stays at scrollY 0`, async ({
    page,
  }) => {
    const {track, driver} = await open(page, {tall: true});
    await driver.play(angled(degrees));
    await waitForRest(track);
    expect(await page.evaluate(() => window.pager.index)).toBe(2);
    const {cancelled, moves, start} = await page.evaluate(() => ({
      cancelled: window.cancelledMoves,
      moves: window.moves,
      start: window.touchStart,
    }));
    expect(cancelled.length).toBeGreaterThan(3);
    // Nothing is claimed before the pan begins at its 10 pt hysteresis; every
    // move from the first one past it is. (Chromium holds back moves inside
    // its own touch slop, so its first move may already be past 10 pt.)
    // Mobile Safari claims a slow drag for the page at about 10–11 px, so on
    // the iOS 26.2 simulator a drag steeper than about 27° scrolls the page
    // instead (25° pages, 30° and 35° scroll), where UIKit pages up to 45°.
    const past = moves.findIndex(
      ([x, y]) =>
        Math.max(Math.abs(x - start[0]), Math.abs(y - start[1])) >= 10,
    );
    expect(past).toBeGreaterThanOrEqual(0);
    expect(cancelled.slice(0, past).some(Boolean)).toBe(false);
    expect(cancelled.slice(past).every(Boolean)).toBe(true);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
}

test("in a scrolling page, a 50° drag is the page's: the page scrolls, the pager stays and no move is cancelled", async ({
  page,
  browserName,
}) => {
  const {track, driver} = await open(page, {tall: true});
  await driver.play(angled(50));
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.pager.index)).toBe(1);
  expect(await trackX(track)).toBeCloseTo(-PAGE, 1);
  expect((await page.evaluate(() => window.cancelledMoves)).some(Boolean)).toBe(
    false,
  );
  if (browserName === 'chromium') {
    // Injected touches scroll natively only in Chromium (harness README).
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  }
});

/**
 * The track's settle as a curve of translateX samples (ms, px), from a motion
 * held at its first frame (holdNewMotion before the input).
 */
async function heldSettle(page: Page, track: Locator) {
  await waitForAnimation(track, {minProgressMs: 0});
  const held = await holdAnimations(page, track);
  await resumeHeldMotion(page);
  expect(held.length).toBeGreaterThan(0);
  return curveOf(
    await sampleCurve(
      track,
      timeline(Math.max(...held.map(a => a.curveEndMs))),
    ),
    'translateX',
  );
}

/** solvePaging from `start` at `velocity` onto page 2, at 60 Hz. */
async function pagingOracle(page: Page, start: number, velocity: number) {
  return page.evaluate(
    ({from, v}) => {
      const curve = window.Pager.solvePaging({from, velocity: v, to: 804});
      return Array.from({length: 60}, (_, i) => curve.at(i / 60));
    },
    {from: start, v: velocity},
  );
}

const at = (oracle: number[], t: number) =>
  oracle[Math.min(oracle.length - 1, Math.round((t * 60) / 1000))];

test("a slow drag past half a page, well under the 225 px/s floor, settles on the next page from rest on UIKit's paging curve", async ({
  page,
}) => {
  const {track, driver} = await open(page);
  // 60 % of a page at 100 px/s, lifted while moving: under the floor in
  // either engine, so the settle starts at rest.
  await holdNewMotion(page);
  await driver.play(
    drag(
      {x: 320, y: 200},
      {x: 320 - 0.6 * PAGE, y: 200},
      {durationMs: 2400, restMs: 0},
    ),
  );
  const samples = await heldSettle(page, track);
  expect(await page.evaluate(() => window.pager.index)).toBe(2);
  const oracle = await pagingOracle(page, -samples[0].value, 0);
  const result = compareCurve(samples, t => -at(oracle, t), 1);
  await writeEvidence(
    'pager/slow-drag-settle',
    {'curve.json': JSON.stringify({samples, result}, null, 2)},
    test.info(),
  );
  expect(result.maxError).toBeLessThan(1);
  await releaseAnimations(page);
  await waitForRest(track);
  expect(await trackX(track)).toBeCloseTo(-2 * PAGE, 0);
});

// UIKit keeps the release velocity through a silent rest (recorded, iOS
// 26.2: 600 pt/s, then no touch event for up to 397 ms before the lift kept
// 0.55 to 0.61 pt/ms). The shared release filter reads 0 after 40 ms of
// silence instead (spec:AST-100 FR2), and the pager reads the filter. A held
// finger sends no events here either.
test('a drag held still for 200 ms before the lift settles from rest: the release filter reads 0 after 40 ms of silence (spec:AST-100 FR2)', async ({
  page,
}) => {
  const {track, driver} = await open(page);
  // 60 % of a page at 600 px/s (far above the floor in either engine), then
  // held still for 200 ms.
  const script = drag(
    {x: 320, y: 200},
    {x: 320 - 0.6 * PAGE, y: 200},
    {durationMs: 402, restMs: 200},
  );
  const velocities = await releaseVelocities(page, toTouchEvents(script));
  expect(velocities.current).toBe(0);
  await holdNewMotion(page);
  await driver.play(script);
  const samples = await heldSettle(page, track);
  expect(await page.evaluate(() => window.pager.index)).toBe(2);
  const rest = await pagingOracle(page, -samples[0].value, 0);
  const result = compareCurve(samples, t => -at(rest, t), 1);
  await writeEvidence(
    'pager/held-drag-settle',
    {'curve.json': JSON.stringify({samples, result}, null, 2)},
    test.info(),
  );
  expect(result.maxError).toBeLessThan(1);
  await releaseAnimations(page);
  await waitForRest(track);
  expect(await trackX(track)).toBeCloseTo(-2 * PAGE, 0);
});

test('callbacks: the new page once the settle is moving, the settle when the track rests', async ({
  page,
}) => {
  const {track, driver} = await open(page);
  // 60 % of a page at 600 px/s, lifted while moving.
  await driver.play(
    drag(
      {x: 320, y: 200},
      {x: 320 - 0.6 * PAGE, y: 200},
      {durationMs: 402, restMs: 0},
    ),
  );
  // Reported a couple of frames into the settle, so the owner's render of
  // the new page cannot hold up its hand-off to the compositor.
  await expect
    .poll(async () => (await log(page))[0])
    .toBe('index:2:drag:moving');
  await waitForRest(track);
  await page.waitForTimeout(50);
  expect(await log(page)).toEqual(['index:2:drag:moving', 'settle:2:1']);
});

test('a flick pages exactly one page, and the settle starts from the release velocity', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'WebKit sees real dispatch times, not the scripted ones the velocity oracle replays (harness README)',
  );
  const {track, driver} = await open(page);
  const throwScript = flick(
    {x: 320, y: 200},
    {velocity: {x: -1500, y: 0}, durationMs: 80, hz: 120},
  );
  const velocities = await releaseVelocities(page, toTouchEvents(throwScript));
  await holdNewMotion(page);
  await driver.play(throwScript);
  await waitForAnimation(track, {minProgressMs: 0});
  expect(await page.evaluate(() => window.pager.index)).toBe(2);
  const held = await holdAnimations(page, track);
  await resumeHeldMotion(page);
  const samples = curveOf(
    await sampleCurve(
      track,
      timeline(Math.max(...held.map(a => a.curveEndMs))),
    ),
    'translateX',
  );
  const from = -samples[0].value;
  const oracle = await page.evaluate(
    ({start, current}) => {
      // The pan's x velocity is the finger's; the content moves the other way.
      const settle = window.Pager.pagingSettleVelocity(-current);
      const curve = window.Pager.solvePaging({
        from: start,
        velocity: settle,
        to: 804,
      });
      return {
        settle,
        values: Array.from({length: 60}, (_, i) => curve.at(i / 60)),
      };
    },
    {start: from, ...velocities},
  );
  expect(oracle.settle).toBeGreaterThan(900);
  const result = compareCurve(
    samples,
    t => -oracle.values[Math.min(59, Math.round((t * 60) / 1000))],
    1.5,
  );
  await writeEvidence(
    'pager/flick-settle',
    {
      'curve.json': JSON.stringify(
        {samples, settle: oracle.settle, result},
        null,
        2,
      ),
    },
    test.info(),
  );
  expect(result.maxError).toBeLessThan(1.5);
  await releaseAnimations(page);
  await waitForRest(track);
  // One page, however hard the throw.
  expect(await trackX(track)).toBeCloseTo(-2 * PAGE, 0);
});

test('past the first page the track rubber-bands with d = the page width, then returns', async ({
  page,
}) => {
  const {track, driver} = await open(page, {startIndex: 0});
  const finger = 290;
  let shown = NaN;
  const moves = toTouchEvents(
    drag(
      {x: 60, y: 200},
      {x: 60 + finger + 10, y: 200},
      {durationMs: 600, restMs: 120},
    ),
  ).filter(e => e.type === 'touchMove').length;
  let seen = 0;
  await driver.play(
    drag(
      {x: 60, y: 200},
      {x: 60 + finger + 10, y: 200},
      {durationMs: 600, restMs: 120},
    ),
    {
      onEvent: async step => {
        if (step.type === 'touchMove' && ++seen === moves) {
          await page.evaluate(
            async () =>
              new Promise(r =>
                requestAnimationFrame(() => requestAnimationFrame(r)),
              ),
          );
          shown = await trackX(track);
        }
      },
    },
  );
  const expected = await page.evaluate(
    f => window.Pager.rubberBand(f, 402),
    finger,
  );
  // 10 px of the finger went to the pan's threshold.
  expect(shown).toBeGreaterThan(expected - 3);
  expect(shown).toBeLessThan(expected + 3);
  await waitForRest(track);
  expect(await trackX(track)).toBeCloseTo(0, 0);
  expect(await log(page)).toEqual(['settle:0:0']);
});

// spec:AST-094 FR37: a release whose velocity points back toward the start
// cancels, whatever the travel (UIKit takes the nearest page).
test('a drag 70 % of the way to the next page that turns back and lifts while moving back settles on its start page', async ({
  page,
}) => {
  const {track, driver} = await open(page);
  const x0 = 320;
  // Forward 70 % of a page, then back 30 px in the last 180 ms, lifted
  // while moving back.
  await driver.play(
    path(
      p =>
        p <= 0.85
          ? {x: x0 - (0.7 * PAGE * p) / 0.85, y: 200}
          : {x: x0 - 0.7 * PAGE + (30 * (p - 0.85)) / 0.15, y: 200},
      {durationMs: 1200, restMs: 0},
    ),
  );
  await releaseAnimations(page);
  await waitForRest(track);
  expect(await page.evaluate(() => window.pager.index)).toBe(1);
  expect(await trackX(track)).toBeCloseTo(-PAGE, 0);
  expect(await log(page)).toEqual(['settle:1:1']);
});

// spec:AST-094 FR6: a new target keeps the current velocity.
test('a goTo that retargets a running goTo keeps its velocity: the new curve starts at the speed the old one had', async ({
  page,
}) => {
  const {track} = await open(page, {startIndex: 0});
  // The first goTo starts in the task that reads it: a round trip between the
  // two can outlast its 0.3 s on two loaded cores.
  const {before, after, firedAt} = await page.evaluate(async () => {
    const el = document.getElementById('track') as HTMLElement;
    window.armFrames();
    window.pager.goTo(3);
    // The keyframes' slope at `time` (ms into the animation), px/s: the
    // animator plays a curve as linear segments between samples.
    const slope = (animation: Animation, time: number) => {
      const effect = animation.effect as KeyframeEffect;
      const frames = effect.getKeyframes();
      const duration = Number(effect.getComputedTiming().duration);
      const at = Math.min(Math.max(time / duration, 0), 1);
      for (let i = 1; i < frames.length; i++) {
        const a = frames[i - 1];
        const b = frames[i];
        if (at <= b.computedOffset || i === frames.length - 1) {
          const span = (b.computedOffset - a.computedOffset) * duration;
          return span > 0
            ? ((parseFloat(String(b.translate)) -
                parseFloat(String(a.translate))) /
                span) *
                1000
            : 0;
        }
      }
      return 0;
    };
    const running = el.getAnimations()[0];
    // Once the curve has started (its start resolves in its first frame), the
    // retarget comes 100 ms into it by a timer, which a slow frame does not
    // hold back the way it holds back frame callbacks; the old curve's slope
    // is read at that exact time, on the clock the animator's model runs on.
    await running.ready;
    const start = Number(running.startTime);
    await new Promise<void>(resolve => {
      setTimeout(resolve, Math.max(0, start + 100 - performance.now()));
    });
    const firedAt = performance.now() - start;
    const speed = slope(running, firedAt);
    window.pager.goTo(4);
    const next = el.getAnimations().find(a => a !== running);
    return {
      before: speed,
      after: next ? slope(next, 0) : Number.NaN,
      firedAt,
    };
  });
  expect(
    Math.abs(before),
    `the 100 ms timer fired ${firedAt.toFixed(1)} ms into the 300 ms curve`,
  ).toBeGreaterThan(1000);
  expect(after / before).toBeGreaterThan(0.85);
  expect(after / before).toBeLessThan(1.15);
  await waitForRest(track);
  expect(await trackX(track)).toBeCloseTo(-4 * PAGE, 0);
});

test('goTo plays setContentOffset(animated:): 0.3 s on a sinusoidal ease', async ({
  page,
}) => {
  const {track} = await open(page, {startIndex: 0});
  await goToHeld(page, 3);
  await waitForAnimation(track, {minProgressMs: 0});
  const held = await holdAnimations(page, track);
  await resumeHeldMotion(page);
  // Reported at the call; held, the motion cannot settle yet.
  expect(await log(page)).toEqual(['index:3:goTo']);
  const end = Math.max(...held.map(a => a.curveEndMs));
  expect(end).toBeGreaterThan(290);
  expect(end).toBeLessThan(310);
  const samples = curveOf(
    await sampleCurve(track, timeline(end)),
    'translateX',
  );
  const result = compareCurve(
    samples,
    t => (-3 * PAGE * (1 - Math.cos(Math.PI * Math.min(1, t / 300)))) / 2,
    0.5,
  );
  expect(result.maxError).toBeLessThan(0.5);
  await releaseAnimations(page);
});

/**
 * At most a jump: `property` holds its start value, then its end value, and
 * never one in between (design:reduced-motion DR1; a cross-fade moves the
 * track at the bottom of its dip).
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

test('under Reduce Motion the settle and goTo do not travel: an opacity cross-fade of at most 200 ms on a coarse pointer (design:reduced-motion DR2)', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  const {track, driver} = await open(page);
  expect(
    await page.evaluate(() => ({
      reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
      coarse: matchMedia('(pointer: coarse)').matches,
    })),
  ).toEqual({reduce: true, coarse: true});
  const crossFadesOnly = (
    animations: Awaited<ReturnType<typeof holdAnimations>>,
  ) => {
    expect(animations.length).toBeGreaterThan(0);
    for (const a of animations) {
      // Nothing travels: the track holds, then jumps under the fade (DR1).
      expect(holdsOrJumps(a.keyframes, 'translate')).toBe(true);
      expect(holdsOrJumps(a.keyframes, 'transform')).toBe(true);
      expect(a.curveEndMs).toBeLessThanOrEqual(200);
    }
  };
  // The drag follows the finger; after the lift the settle cross-fades.
  await holdNewMotion(page);
  await driver.play(
    flick({x: 320, y: 200}, {velocity: {x: -1500, y: 0}, durationMs: 80}),
  );
  await waitForAnimation(track, {minProgressMs: 0});
  crossFadesOnly(await holdAnimations(page, track));
  await resumeHeldMotion(page);
  await releaseAnimations(page);
  await expect
    .poll(async () => page.evaluate(() => window.pager.isSettling))
    .toBe(false);
  expect(await page.evaluate(() => window.pager.index)).toBe(2);
  // goTo cross-fades too.
  await goToHeld(page, 4);
  await waitForAnimation(track, {minProgressMs: 0});
  crossFadesOnly(await holdAnimations(page, track));
  await resumeHeldMotion(page);
  await releaseAnimations(page);
  await expect
    .poll(async () => page.evaluate(() => window.pager.isSettling))
    .toBe(false);
  expect(await page.evaluate(() => window.pager.index)).toBe(4);
});

test(`a still finger catches a settle ${85} ms after it lands, selects no text, and the lift settles on the nearest page`, async ({
  page,
}) => {
  const {track, driver} = await open(page, {startIndex: 0});
  // One timeline the driver paces: a flick toward page 1, then, 40 ms after
  // its lift, a second finger lands on the settling track and holds still for
  // 600 ms (a 0.6 px creep, reported every 100 ms). The hold lands early in
  // the settle however busy the machine is; a settle started by a separate
  // goTo raced the touch's dispatch, and under load the touch came after it.
  const throwScript = flick(
    {x: 320, y: 200},
    {velocity: {x: -1500, y: 0}, durationMs: 80, hz: 120},
  );
  const liftAt = throwScript[throwScript.length - 1].t;
  const hold = withFinger(
    drag({x: 200, y: 200}, {x: 200.6, y: 200}, {durationMs: 600, hz: 10}),
    1,
    liftAt + 40,
  );
  const reads: {
    x: number;
    refused: boolean;
    lift: {velocity: number; x: number; page: number};
  }[] = [];
  let holdMoves = 0;
  await driver.play(merge(throwScript, hold), {
    onEvent: async event => {
      if (
        event.type === 'touchMove' &&
        event.changed.some(finger => finger.id === 1) &&
        (++holdMoves === 3 || holdMoves === 6)
      ) {
        reads.push({
          x: await track.evaluate(
            el => parseFloat(getComputedStyle(el).translate) || 0,
          ),
          refused: await track.evaluate(refusesSelection),
          // The flick's lift, as the pan read it, where the track was, and
          // the page the release chose (the catch keeps it until the lift).
          lift: await page.evaluate(() => ({
            velocity: window.liftVelocities[window.liftVelocities.length - 1],
            x: window.liftPositions[window.liftPositions.length - 1],
            page: window.pager.index,
          })),
        });
      }
    },
  });
  // Held: the same place at 300 and 600 ms, no selection.
  expect(reads).toHaveLength(2);
  expect(reads[1].x).toBeCloseTo(reads[0].x, 1);
  expect(reads[0].refused).toBe(true);
  // Caught mid-settle, on UIKit's settle for the lift the pan read, from
  // where the track was at the lift onto the page the release chose: the hold
  // stops it wherever it is on that curve (within 1.5 px), never at rest. In
  // WebKit, whose touches carry their real dispatch times, a busy page can
  // read the lift faster than scripted, and that curve passes page 1 before it
  // lands, or after a stall read it as still, and the settle returns to page 0.
  const settle = await page.evaluate(
    ({velocity, from, to}) => {
      const curve = window.Pager.solvePaging({
        from,
        velocity: window.Pager.pagingSettleVelocity(-velocity),
        to,
      });
      const values: number[] = [];
      for (let ms = 0; ms <= curve.duration * 1000; ms += 1) {
        values.push(curve.at(ms / 1000));
      }
      return {nearest: Math.min(...values), furthest: Math.max(...values)};
    },
    {
      velocity: reads[0].lift.velocity,
      from: -reads[0].lift.x,
      to: reads[0].lift.page * PAGE,
    },
  );
  const held = -reads[0].x;
  expect(held, JSON.stringify({lift: reads[0].lift, settle})).toBeGreaterThan(
    settle.nearest - 1.5,
  );
  expect(held, JSON.stringify({lift: reads[0].lift, settle})).toBeLessThan(
    settle.furthest + 1.5,
  );
  expect(Math.abs(held - reads[0].lift.page * PAGE)).toBeGreaterThan(0.5);
  // The lift settles on the page nearest to where it was held.
  const nearest = Math.round(-reads[1].x / PAGE);
  await waitForRest(track);
  expect(await trackX(track)).toBeCloseTo(-nearest * PAGE, 0);
  expect(await track.evaluate(refusesSelection)).toBe(false);
});

// spec:AST-094 FR41: a hold that does nothing keeps the browser's native
// long-press selection, so a finger held on a resting pager's text can still
// select it.
test('a finger held on a resting track leaves its text selectable', async ({
  page,
}) => {
  const {track, driver} = await open(page, {startIndex: 1});
  const reads: boolean[] = [];
  let step = 0;
  await driver.play(
    drag({x: 200, y: 200}, {x: 200.6, y: 200}, {durationMs: 600, hz: 10}),
    {
      onEvent: async event => {
        if (event.type === 'touchMove' && step++ === 3) {
          reads.push(await track.evaluate(refusesSelection));
        }
      },
    },
  );
  expect(reads).toEqual([false]);
  await waitForRest(track);
  expect(await trackX(track)).toBeCloseTo(-PAGE, 0);
});

test('a settle keeps advancing every frame through an 800 ms main-thread block', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    "WebKit's screencast clock is not the page's (frames arrive ~100 ms off), so a 0.3 s motion cannot be placed inside the block; the animator's own WebKit proof covers compositor playback, and Mobile Safari on the iOS simulator is this proof's WebKit evidence",
  );
  await open(page, {startIndex: 0});
  const marker = page.locator('.page').nth(1);
  await markElement(marker, {inset: 8});
  const cast = await startScreencast(page);
  // Let the screencast deliver a few frames before anything moves.
  await page.waitForTimeout(300);
  // A goTo of one page (0.3 s whatever the distance), and an 800 ms block
  // scheduled from the page 90 ms in: WebKit hands a new animation to its
  // compositor two or three rendering updates after it starts (animator.ts,
  // known limits), and a harness round trip would eat most of the motion.
  const started = await page.evaluate(() => {
    window.pager.goTo(1);
    setTimeout(() => {
      const from = performance.timeOrigin + performance.now();
      const end = performance.now() + 800;
      let spins = 0;
      while (performance.now() < end) {
        spins += 1;
      }
      (window as unknown as {busy: unknown}).busy = {
        from,
        to: performance.timeOrigin + performance.now(),
        spins,
      };
    }, 90);
    return performance.timeOrigin + performance.now();
  });
  await page.waitForTimeout(1200);
  const busy = await page.evaluate(
    () =>
      (window as unknown as {busy: {from: number; to: number; spins: number}})
        .busy,
  );
  const tracked = await trackMarker(page, await cast.stop());
  // Judge the part of the block the motion spans: it ends about 0.3 s after
  // the call (a frame later when it starts at the next commit).
  const spanned = {...busy, to: Math.min(busy.to, started + 300)};
  test.info().annotations.push({
    type: 'marker x per frame (ms from the call)',
    description: JSON.stringify(
      tracked.map(f => [Math.round(f.t - started), f.box?.x ?? null]),
    ),
  });
  expect(spanned.to - spanned.from).toBeGreaterThan(150);
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
  // And it lands while the thread is still blocked, and holds its end state
  // (page 1's marker at its inset from the viewport's left edge).
  const late = tracked.filter(
    f => f.box != null && f.t > started + 340 && f.t < busy.to,
  );
  expect(late.length).toBeGreaterThan(0);
  for (const frame of late) {
    expect(Math.abs((frame.box?.x ?? 0) - 8)).toBeLessThan(1.5);
  }
});

test('no Layout or Paint while it settles', async ({page, browserName}) => {
  test.skip(
    browserName === 'webkit',
    'Playwright exposes no rendering trace for WebKit',
  );
  const {track} = await open(page, {startIndex: 0});
  // Nothing reads the page while the motion runs: a read mid-motion draws a
  // frame of its own, with paint. The motion notes when its curve starts, by
  // the engine's clock (under load its first frame can come well after the
  // call), and that note is read afterwards.
  const trace = await traceRendering(page, async () => {
    await page.evaluate(() => {
      window.armFrames();
      window.pager.goTo(2);
      const track = document.getElementById('track') as HTMLElement;
      for (const animation of track.getAnimations()) {
        void animation.ready.then(running => {
          if (running.startTime != null) {
            const start = performance.timeOrigin + Number(running.startTime);
            window.motionStart = Math.min(window.motionStart ?? start, start);
          }
        });
      }
    });
    // The 0.3 s motion, with room for a late start under load.
    await page.waitForTimeout(800);
  });
  const started = await page.evaluate(() => window.motionStart ?? NaN);
  expect(Number.isFinite(started)).toBe(true);
  // The trace holds the whole motion, and the motion moved the track to its
  // page: no layout or paint in it is then the compositor's doing, not a
  // motion that never ran. (With nothing reading the page, the main thread
  // draws no frame while it moves.)
  expect(trace.window.to).toBeGreaterThan(started + 300);
  expect(await trackX(track)).toBeCloseTo(-2 * PAGE, 0);
  // The steady part of the 0.3 s motion: its first and last frames may commit.
  const during = countBetween(trace, started + 60, started + 240);
  expect(during.Layout ?? 0, JSON.stringify(during)).toBe(0);
  expect(during.Paint ?? 0, JSON.stringify(during)).toBe(0);
  // And no long task while it settles. The task that starts the motion (the
  // goTo call, which samples the curve into keyframes) ends where the curve
  // starts and is not part of the settle: on two loaded cores it stretched to
  // 51–85 ms, ending 0.25–0.55 ms before the curve's start, measured.
  const whileSettling = trace.longTasks.filter(
    task =>
      task.start + task.durationMs > started && task.start < started + 300,
  );
  expect(
    whileSettling,
    JSON.stringify({started, longTasks: trace.longTasks}),
  ).toEqual([]);
});

for (const [name, run] of [
  [
    'release-at-rest',
    async (page: Page, driver: Awaited<ReturnType<typeof touchDriver>>) =>
      driver.play(
        drag(
          {x: 320, y: 200},
          {x: 320 - 0.6 * PAGE, y: 200},
          {durationMs: 1000, restMs: 120},
        ),
      ),
  ],
  [
    'flick',
    async (page: Page, driver: Awaited<ReturnType<typeof touchDriver>>) =>
      driver.play(
        flick(
          {x: 320, y: 200},
          {velocity: {x: -1500, y: 0}, durationMs: 80, hz: 120},
        ),
      ),
  ],
  [
    // The lift a busy WebKit page read for the flick above, its moves bunched:
    // 144 px in 8 ms, about 18,000 px/s.
    'flick-bunched',
    async (page: Page, driver: Awaited<ReturnType<typeof touchDriver>>) =>
      driver.play(
        flick(
          {x: 320, y: 200},
          {velocity: {x: -18_000, y: 0}, durationMs: 8, hz: 1000},
        ),
      ),
  ],
  [
    'return-to-page',
    async (page: Page, driver: Awaited<ReturnType<typeof touchDriver>>) =>
      driver.play(
        drag(
          {x: 320, y: 200},
          {x: 320 - 0.3 * PAGE, y: 200},
          {durationMs: 1000, restMs: 120},
        ),
      ),
  ],
  [
    'goto',
    async (page: Page) => {
      await goToHeld(page, 3);
    },
  ],
] as const) {
  test(`storyboard: ${name} @storyboard`, async ({page}) => {
    const {track, driver} = await open(page);
    await holdNewMotion(page);
    await run(page, driver);
    await waitForAnimation(track, {minProgressMs: 0});
    const {storyboard} = await animationStoryboard(page, {
      name: `pager-${name}`,
      scope: track,
      clip: {x: 0, y: TOP, width: PAGE, height: HEIGHT},
      measure: async () => ({x: await trackX(track)}),
    });
    await resumeHeldMotion(page);
    await storyboard.write(test.info());
    const xs = storyboard.frames.map(f => (f.data as {x: number}).x);
    // It lands on the page the pager chose (the last frame is half a
    // millisecond inside the curve's end, within the last step).
    const index = await page.evaluate(() => window.pager.index);
    expect(Math.abs(xs[xs.length - 1] + index * PAGE)).toBeLessThan(1.5);
    if (name === 'goto') {
      // setContentOffset's ease runs toward the page and never past it.
      const toward = Math.sign(xs[xs.length - 1] - xs[0]);
      for (let i = 1; i < xs.length; i++) {
        expect(Math.sign(xs[i] - xs[i - 1]) * toward).toBeGreaterThanOrEqual(0);
      }
    } else {
      // A release: every frame, the landing included, lies on UIKit's paging
      // curve for the lift velocity the pan read, within 1.5 px. A fast lift
      // carries the curve past the page and back; the frames follow it.
      const model = await releaseModel(page, {
        from: -xs[0],
        to: index * PAGE,
        times: storyboard.frames.map(f => f.t),
      });
      const off = xs.map((x, i) => Math.abs(x + model.offsets[i]));
      expect(
        Math.max(...off),
        JSON.stringify({lift: model.lift, xs, model: model.offsets}),
      ).toBeLessThan(1.5);
    }
    await releaseAnimations(page);
  });
}

// spec:AST-094 FR43: gestures work on the web for every pointer. A desktop
// context: a fine primary pointer, a real mouse and real wheel input.
// Chromium's CDP input sends wheels without a trackpad's legacy
// `wheelDelta` (three times each delta), so the gesture engine reads them as a
// mouse's wheel, which a pan that takes only a trackpad's scroll leaves to the
// page (#8676). The trackpad cases run in WebKit, whose injected wheels carry
// it.
const TRACKPAD_IN_CHROMIUM =
  "Chromium's CDP wheels read as a mouse's wheel; the trackpad cases run in WebKit";

test.describe('under a fine primary pointer (spec:AST-094 FR43)', () => {
  test.use({hasTouch: false, isMobile: false});

  test('a mouse drag pages the pager like a finger', async ({page}) => {
    const {track} = await openFine(page);
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    const y = TOP + HEIGHT / 2;
    await page.mouse.move(340, y);
    await page.mouse.down();
    // 250 px toward the start, past half a page whatever the release speed.
    for (let i = 1; i <= 25; i++) {
      await page.mouse.move(340 - 10 * i, y);
    }
    await page.mouse.up();
    await waitForRest(track);
    expect(await page.evaluate(() => window.pager.index)).toBe(2);
    expect(await trackX(track)).toBeCloseTo(-2 * PAGE, 0);
  });

  test("a trackpad's horizontal scroll pages the pager, and the page keeps none of it", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'chromium', TRACKPAD_IN_CHROMIUM);
    const {track, input} = await openFine(page);
    // 40 steps of 6.5 px (a trackpad's continuous scroll): 260 px toward the
    // next page, past half of it whatever the release speed.
    for (let i = 0; i < 40; i++) {
      await input.wheel({x: 200, y: TOP + HEIGHT / 2, dx: 6.5});
    }
    // A trackpad scroll ends 220 ms after its last wheel.
    await page.waitForTimeout(300);
    await waitForRest(track);
    expect(await page.evaluate(() => window.pager.index)).toBe(2);
    expect(await trackX(track)).toBeCloseTo(-2 * PAGE, 0);
    const cancelled = await page.evaluate(() => window.cancelledWheels);
    expect(cancelled.length).toBeGreaterThan(0);
    expect(cancelled.every(Boolean)).toBe(true);
  });

  test("a trackpad scroll of more than a page stays the pager's while the next page moves under the still cursor, stops at that page, and pages one page", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'chromium', TRACKPAD_IN_CHROMIUM);
    const {track, input} = await openFine(page);
    // The furthest the track gets, sampled every frame.
    await page.evaluate(() => {
      window.minTrackX = 0;
      const el = document.getElementById('track') as HTMLElement;
      const sample = () => {
        const value = getComputedStyle(el).translate;
        const x = value === 'none' ? 0 : parseFloat(value);
        window.minTrackX = Math.min(window.minTrackX, x);
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    // 30 steps of 17.5 px: 525 px, more than a page. The cursor stays put
    // while the next page slides under it; the track stops there, one page
    // from where the scroll began.
    for (let i = 0; i < 30; i++) {
      await input.wheel({x: 200, y: TOP + HEIGHT / 2, dx: 17.5});
    }
    // A trackpad scroll ends 220 ms after its last wheel.
    await page.waitForTimeout(300);
    await waitForRest(track);
    const furthest = await page.evaluate(() => window.minTrackX);
    expect(furthest).toBeGreaterThanOrEqual(-2 * PAGE - 0.5);
    expect(furthest).toBeLessThanOrEqual(-2 * PAGE + 0.5);
    const cancelled = await page.evaluate(() => window.cancelledWheels);
    expect(cancelled.length).toBeGreaterThan(0);
    expect(cancelled.every(Boolean)).toBe(true);
    // One page per release, as UIKit pages.
    expect(await page.evaluate(() => window.pager.index)).toBe(2);
    expect(await trackX(track)).toBeCloseTo(-2 * PAGE, 0);
  });

  test("a vertical wheel over the pager is the page's: the pager stays and takes none of it", async ({
    page,
    browserName,
  }) => {
    const {track, input} = await openFine(page, {tall: true});
    for (let i = 0; i < 10; i++) {
      await input.wheel({x: 200, y: TOP + HEIGHT / 2, dy: 40.5});
    }
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.pager.index)).toBe(1);
    expect(await trackX(track)).toBeCloseTo(-PAGE, 0);
    const cancelled = await page.evaluate(() => window.cancelledWheels);
    expect(cancelled.length).toBeGreaterThan(0);
    expect(cancelled.some(Boolean)).toBe(false);
    if (browserName === 'chromium') {
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    }
  });
});
