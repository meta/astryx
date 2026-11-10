// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RefreshControl.interaction.browser.spec.ts
 * @input The built pull-to-refresh stories (useRefreshControl in an app's
 *   scroll container), real touch input (Chromium CDP and WebKit's input
 *   command) and the interaction harness
 * @output Interaction and animation proofs for the pull to refresh
 * @position Interaction tests of packages/lab/src/RefreshControl
 *   (useRefreshControl), on the shape of the BottomSheetDetent exemplar
 */

// The proofs: the pull follows UIKit's measured mapping and settles back below
// the trigger. Past the trigger, the refresh starts with the finger down, and
// the content settles onto the 60 px inset. The settle follows the scroll
// view's bounce spring. The end plays the theme's duration token nearest
// UIKit's 0.3 s, on the move easing. The settle keeps moving through a
// blocked main thread, with no Layout or Paint per frame. A list that fits
// its container keeps the browser's scroll. Under Reduce Motion, a release
// and the end only fade, within 200 ms. A trackpad's scroll at the top
// pulls. A mouse's or a pen's drag stays the browser's, and a mouse wheel's
// notches never pull.
//
// The harness's touch contexts report a coarse pointer in both engines, so
// every proof runs as a phone. The desktop proofs report a fine one.
//
// The oracles are UIKit's numbers, written here apart from the code under
// test. The pan's hysteresis is 10 px, and 60 px follow one to one. Then
// UIScrollView's rubber band applies to the excess (c = 0.55, d = the
// scroller's height). The trigger is at max(73, 0.198 × d) px of overscroll.
// The settle uses response 0.5 s and damping 1. UIKit's end takes 300 ms on
// UIView.animate's easeInEaseOut. The page's duration token gives the end's
// duration, and the curve stays UIKit's whatever the theme's easing.

import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  blockMainThread,
  busyWindowProof,
  compareCurve,
  countBetween,
  cubicBezier,
  drag,
  frames,
  markElement,
  openStory,
  path,
  releaseAnimations,
  rubberBand,
  springStep,
  startBusyControl,
  startCompositorTrace,
  startScreencast,
  timeline,
  trackControl,
  touchDriver,
  toTouchEvents,
  traceRendering,
  trackMarker,
  withStorybook,
  writeEvidence,
  type TouchDriver,
  PEN_SKIP,
  webInputDriver,
  WHEEL_SCROLL_END_MS,
} from '@astryxdesign/interaction-harness';

import {refreshControl} from '../refreshValues';

const storybook = withStorybook(test);

/** UIKit's end, measured: `endRefreshing()` moves the content over 0.3 s. */
const UIKIT_END_MS = 300;

/** UIKit's end curve: UIView.animate's default, easeInEaseOut. */
const UIKIT_END_CURVE = [0.42, 0, 0.58, 1] as const;

/** A CSS time in ms, for the page's duration tokens. */
function timeMs(value: string): number {
  const match = /^\s*(\d*\.?\d+)(ms|s)\s*$/.exec(value);
  if (match == null) {
    throw new Error(`timeMs: not a CSS time: "${value}"`);
  }
  return Number(match[1]) * (match[2] === 's' ? 1000 : 1);
}

/** The theme tokens at the content, as the page computes them. */
const tokensAt = (content: Locator, names: readonly string[]) =>
  content.evaluate(
    (element, list) =>
      Object.fromEntries(
        list.map(name => [
          name,
          getComputedStyle(element).getPropertyValue(name).trim(),
        ]),
      ),
    [...names],
  );

const HYSTERESIS = 10;
const HEIGHT = 60;
/**
 * Three frames at 60 Hz. A Web Animation's start resolves to the time of the
 * frame that started it. On a loaded machine, that frame can lie a frame or
 * two before the task that made it. A start dated before a busy task that it
 * waited on lies a whole block earlier.
 */
const START_SLACK_MS = 50;

/** UIKit's trigger distance for a scroll view `dimension` tall. */
const triggerFor = (dimension: number) => Math.max(73, 0.198 * dimension);

/** UIKit's refresh pull: overscroll shown for `travel` px of finger travel. */
function uikitPull(travel: number, dimension: number): number {
  const u = travel - HYSTERESIS;
  if (u <= 0) {
    return 0;
  }
  return u <= HEIGHT ? u : HEIGHT + rubberBand(u - HEIGHT, dimension);
}

interface Opened {
  driver: TouchDriver;
  /** The pulled content (the element under the hook's `contentRef`). */
  content: Locator;
  /** Where the finger lands: on the list, near the top of the screen. */
  start: {x: number; y: number};
  /** The scroll owner's height: the rubber band's dimension. */
  dimension: number;
}

async function openRefresh(
  page: Page,
  story = 'lab-pull-to-refresh--in-a-scroll-container',
  args: Record<string, string> = {},
): Promise<Opened> {
  await openStory(page, storybook(), story, args);
  const driver = await touchDriver(page);
  const content = page.locator('[data-refresh-content]').first();
  await expect(content).toBeVisible();
  const dimension = await content.evaluate(element => {
    for (let node = element.parentElement; node; node = node.parentElement) {
      const overflow = getComputedStyle(node).overflowY;
      if (overflow === 'auto' || overflow === 'scroll') {
        return node.clientHeight;
      }
    }
    return window.innerHeight;
  });
  return {driver, content, start: {x: 200, y: 160}, dimension};
}

/** The content's presented translation, px (works while animations are held). */
const shownPull = (content: Locator) =>
  content.evaluate(element => {
    const value = getComputedStyle(element).translate;
    if (value === 'none' || value === '') {
      return 0;
    }
    return parseFloat(value.split(/\s+/)[1] ?? '0');
  });

const isBusy = (content: Locator) =>
  content.evaluate(element => element.getAttribute('aria-busy') === 'true');

/**
 * Ends the story's refresh, which `refreshMs: '-1'` holds until now. A test
 * that times the end starts it on cue, so a slow pull cannot outrun a clock.
 */
const endRefresh = (page: Page) =>
  page.evaluate(() => {
    window.dispatchEvent(new Event('refreshcontrol-story-end'));
  });

/**
 * Waits for an animation of the content itself (not an indicator's endless
 * spin inside it) and returns its active interval on the page clock. With
 * `afterRefresh`, only once the refresh has ended (the end of a refresh);
 * with `hold`, it is paused where it was found, ready for sampling.
 */
async function waitForSettle(
  content: Locator,
  {
    minProgressMs = 1,
    afterRefresh = false,
    hold = false,
    timeout = 6000,
  }: {
    minProgressMs?: number;
    afterRefresh?: boolean;
    hold?: boolean;
    timeout?: number;
  } = {},
): Promise<{from: number; to: number}> {
  return content.evaluate(
    (element, options) =>
      new Promise<{from: number; to: number}>((resolve, reject) => {
        const deadline = performance.now() + options.timeout;
        const tick = () => {
          const running = element
            .getAnimations()
            .filter(
              a =>
                a.playState === 'running' &&
                a.startTime != null &&
                Number(a.currentTime ?? 0) >= options.minProgressMs,
            );
          const ready =
            running.length > 0 &&
            (!options.afterRefresh ||
              element.getAttribute('aria-busy') !== 'true');
          if (ready) {
            if (options.hold) {
              for (const animation of running) {
                animation.pause();
              }
              (
                window as unknown as {__harnessHeld?: Animation[]}
              ).__harnessHeld = running;
            }
            const timing = running[0].effect?.getComputedTiming();
            const from =
              performance.timeOrigin +
              Number(running[0].startTime) +
              Number(timing?.delay ?? 0);
            resolve({from, to: from + Number(timing?.activeDuration ?? 0)});
            return;
          }
          if (performance.now() > deadline) {
            reject(new Error('waitForSettle: no animation on the content'));
            return;
          }
          requestAnimationFrame(tick);
        };
        tick();
      }),
    {minProgressMs, afterRefresh, hold, timeout},
  );
}

/** Resolves once the content itself holds still (an indicator may spin on). */
async function waitForContentRest(
  content: Locator,
  timeout = 6000,
): Promise<void> {
  await content.evaluate(
    (element, ms) =>
      new Promise<void>((resolve, reject) => {
        const deadline = performance.now() + ms;
        let last = '';
        let still = 0;
        const tick = () => {
          const translate = getComputedStyle(element).translate;
          const moving = element
            .getAnimations()
            .some(a => a.playState === 'running');
          still = !moving && translate === last ? still + 1 : 0;
          last = translate;
          if (still >= 2) {
            resolve();
            return;
          }
          if (performance.now() > deadline) {
            reject(
              new Error(`waitForContentRest: still moving (${translate})`),
            );
            return;
          }
          requestAnimationFrame(tick);
        };
        tick();
      }),
    timeout,
  );
}

/** A slow pull that rests before the lift (release velocity 0). */
function slowPull(from: {x: number; y: number}, dy: number, restMs = 150) {
  return drag(
    from,
    {x: from.x, y: from.y + dy},
    {durationMs: Math.max(200, dy * 5), hz: 60, restMs},
  );
}

/** Samples a held animation's presented translation at each time. */
async function sampleTranslate(
  content: Locator,
  times: readonly number[],
): Promise<{t: number; value: number}[]> {
  return content.evaluate(
    (element, ts) => {
      const held =
        (window as unknown as {__harnessHeld?: Animation[]}).__harnessHeld ??
        [];
      return ts.map(t => {
        for (const animation of held) {
          const end = Number(
            animation.effect?.getComputedTiming().endTime ?? Infinity,
          );
          animation.currentTime = Math.min(t, end - 0.5);
        }
        const value = getComputedStyle(element).translate;
        return {
          t,
          value:
            value === 'none' || value === ''
              ? 0
              : parseFloat(value.split(/\s+/)[1] ?? '0'),
        };
      });
    },
    [...times],
  );
}

/** Reads the shown pull after every move of a script, while the finger is down. */
async function playReading(
  page: Page,
  driver: TouchDriver,
  content: Locator,
  script: ReturnType<typeof drag>,
  onLastMove?: () => Promise<void>,
): Promise<{travel: number; shown: number}[]> {
  const startY = script[0].fingers[0].y;
  const moves = toTouchEvents(script).filter(e => e.type === 'touchMove');
  const readings: {travel: number; shown: number}[] = [];
  let index = 0;
  await driver.play(script, {
    onEvent: async step => {
      if (step.type !== 'touchMove') {
        return;
      }
      await frames(page, 1);
      const y = step.changed[0]?.y ?? step.fingers[0]?.y ?? startY;
      readings.push({travel: y - startY, shown: await shownPull(content)});
      if (index === moves.length - 1) {
        await onLastMove?.();
      }
      index++;
    },
  });
  return readings;
}

test('a pull follows UIKit’s mapping and settles back below the trigger', async ({
  page,
}) => {
  const {driver, content, start, dimension} = await openRefresh(page);
  const readings = await playReading(
    page,
    driver,
    content,
    slowPull(start, 76),
  );
  // Every reading sits on UIKit's curve for its finger travel (the page may
  // lag the finger by a frame: compare with the travel's neighbours).
  const last = readings.at(-1);
  expect(last?.shown ?? NaN).toBeCloseTo(uikitPull(76, dimension), 0);
  for (const {travel, shown} of readings) {
    expect(shown).toBeLessThanOrEqual(uikitPull(travel, dimension) + 1);
  }
  expect(Math.max(...readings.map(r => r.shown))).toBeLessThan(
    triggerFor(dimension),
  );
  await waitForContentRest(content);
  expect(await shownPull(content)).toBeCloseTo(0, 1);
  expect(await isBusy(content)).toBe(false);
});

test('past the trigger the refresh starts with the finger down, then settles onto the inset', async ({
  page,
}) => {
  const {driver, content, start} = await openRefresh(page, undefined, {
    refreshMs: '6000',
  });
  let busyWhileDown = false;
  await playReading(
    page,
    driver,
    content,
    slowPull(start, 300, 200),
    async () => {
      busyWhileDown = await isBusy(content);
    },
  );
  expect(busyWhileDown).toBe(true);
  await waitForContentRest(content);
  expect(await shownPull(content)).toBeCloseTo(HEIGHT, 0);
  expect(await isBusy(content)).toBe(true);
});

test('the settle onto the inset follows the scroll view’s bounce spring', async ({
  page,
}, testInfo) => {
  const {driver, content, start} = await openRefresh(page, undefined, {
    refreshMs: '6000',
  });
  await driver.play(slowPull(start, 300, 200));
  await waitForSettle(content, {hold: true});
  const times = timeline(700);
  const samples = await sampleTranslate(content, times);
  await releaseAnimations(page);
  const from = samples[0].value;
  // scroll.bounce: {duration 0.5, bounce 0} = response 0.5 s, damping 1.
  const oracle = (t: number) =>
    from + (HEIGHT - from) * springStep({response: 0.5, dampingFraction: 1}, t);
  const result = compareCurve(samples, oracle, 1);
  await writeEvidence(
    'curves/refresh-settle',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {samples, result},
        null,
        1,
      ),
    },
    testInfo,
  );
  expect(result.maxError, JSON.stringify(result.worst)).toBeLessThanOrEqual(1);
  expect(samples.at(-1)?.value).toBeCloseTo(HEIGHT, 0);
});

test('the end slides the content up on UIKit’s curve over the theme’s duration token (spec:AST-094 FR45)', async ({
  page,
}, testInfo) => {
  const {driver, content, start} = await openRefresh(page, undefined, {
    refreshMs: '-1',
  });
  const tokens = await tokensAt(content, ['--duration-medium']);
  const ms = timeMs(tokens['--duration-medium']);
  // The Storybook theme is neutral: its medium duration is UIKit's end.
  expect(ms, JSON.stringify(tokens)).toBe(UIKIT_END_MS);
  await driver.play(slowPull(start, 300, 200));
  await waitForContentRest(content);
  expect(await shownPull(content)).toBeCloseTo(HEIGHT, 0);
  await endRefresh(page);
  await waitForSettle(content, {afterRefresh: true, hold: true});
  const samples = await sampleTranslate(content, timeline(ms));
  await releaseAnimations(page);
  const ease = cubicBezier(...UIKIT_END_CURVE);
  const oracle = (t: number) => HEIGHT * (1 - ease(Math.min(1, t / ms)));
  const result = compareCurve(samples, oracle, 0.75);
  await writeEvidence(
    'curves/refresh-end',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {samples, result},
        null,
        1,
      ),
    },
    testInfo,
  );
  expect(result.maxError, JSON.stringify(result.worst)).toBeLessThanOrEqual(
    0.75,
  );
  await waitForContentRest(content);
  expect(await shownPull(content)).toBeCloseTo(0, 1);
});

test('the settle keeps moving every frame while the main thread is blocked', async ({
  page,
  browserName,
}, testInfo) => {
  test.skip(
    browserName !== 'chromium',
    'screencast frame evidence is Chromium-only in Playwright (WebKit: the iOS simulator rig)',
  );
  const {driver, content, start} = await openRefresh(page, undefined, {
    refreshMs: '6000',
  });
  await markElement(content);
  // The harness's busy-window control: a box the compositor moves along the
  // top edge, in the same screencast. The settle is judged against what the
  // compositor presented, not against a frame rate.
  const control = await startBusyControl(page);
  const cast = await startScreencast(page);
  // The compositor's own frames: a loaded machine's screencast skips frames
  // the compositor still presents, and the verdict measures those gaps
  // between the compositor's frames instead.
  const compositor = await startCompositorTrace(page);
  await driver.play(slowPull(start, 300, 200));
  // The settle must be running (and composited) before the block: an
  // animation cannot start while the main thread is held.
  const settle = await waitForSettle(content, {minProgressMs: 16});
  const block = await blockMainThread(page, 400);
  await page.waitForTimeout(150);
  const castFrames = await cast.stop();
  const presented = await compositor.stop();
  await control.remove();
  const tracked = await trackMarker(page, castFrames);
  const controlFrames = await trackControl(
    page,
    castFrames.filter(f => f.t >= block.from - 300 && f.t <= block.to + 100),
  );
  const proof = busyWindowProof(
    tracked,
    {from: block.from, to: Math.min(block.to, settle.to)},
    {settledWithin: 3, presented, control: controlFrames},
  );
  await writeEvidence(
    'busy-main-thread/refresh-settle',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {
          block,
          settle,
          proof,
          frames: tracked.map(f => ({
            t: +(f.t - settle.from).toFixed(1),
            y: f.box?.y ?? null,
          })),
        },
        null,
        1,
      ),
    },
    testInfo,
  );
  // The screencast resolves whole CSS pixels, so the proof judges until 3 px
  // from rest. The settle moves on every frame the control moves on, and it
  // stalls no longer than the control.
  expect(proof.verdict.failures, proof.summary).toEqual([]);
});

test('the settle does no Layout or Paint per frame', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
  const {driver, content, start} = await openRefresh(page, undefined, {
    refreshMs: '6000',
  });
  // The indicator is the app's: Core's Spinner here. Its turn does style work
  // every few frames, and that paints inside the moving band. With the turn
  // paused, the settle paints nothing. So the proof pauses the turn, and the
  // Spinner stays in place, laid out and painted.
  const spinner = await content.evaluate(element => {
    const band = element.querySelector(':scope > :last-child > div');
    for (const node of band?.querySelectorAll<HTMLElement>('*') ?? []) {
      if (getComputedStyle(node).animationName !== 'none') {
        node.style.animationPlayState = 'paused';
      }
    }
    const box = band?.querySelector('svg')?.getBoundingClientRect();
    return {width: box?.width ?? 0, height: box?.height ?? 0};
  });
  expect(spinner.width).toBeGreaterThan(0);
  expect(spinner.height).toBeGreaterThan(0);
  let settle = {from: 0, to: 0};
  let steadyFrom = 0;
  const trace = await traceRendering(page, async () => {
    await driver.play(slowPull(start, 300, 200));
    settle = await waitForSettle(content);
    // The release commits over the settle's first frames. The steady part
    // starts once the page renders three more frames. They are counted in
    // frames, not ms, so a loaded machine that draws them late is judged the
    // same.
    steadyFrom = await page.evaluate(
      () =>
        new Promise<number>(resolve => {
          let left = 3;
          const tick = () => {
            left -= 1;
            if (left > 0) {
              requestAnimationFrame(tick);
              return;
            }
            // A task after this frame has rendered.
            setTimeout(() =>
              resolve(performance.timeOrigin + performance.now()),
            );
          };
          requestAnimationFrame(tick);
        }),
    );
    // A fixed wait: polling the content's style every frame would itself
    // recalculate style.
    await page.waitForTimeout(900);
  });
  // The steady part of the settle, until it is within a pixel of rest.
  const from = Math.max(settle.from + 50, steadyFrom);
  const to = settle.from + 600;
  const judged = `judged ${(from - settle.from).toFixed(0)}–600 ms into the settle`;
  // Too little left to judge fails rather than passes.
  expect(to - from, judged).toBeGreaterThan(200);
  const during = countBetween(trace, from, to);
  expect(during.Layout ?? 0, `${judged}: ${JSON.stringify(during)}`).toBe(0);
  expect(during.Paint ?? 0, `${judged}: ${JSON.stringify(during)}`).toBe(0);
  // Main-thread work during that part; the pull's trigger and the release's
  // render are not the settle's.
  const blocking = trace.longTasks.filter(
    task => task.start < to && task.start + task.durationMs > from,
  );
  expect(
    blocking,
    `${judged}; long tasks, ms into the settle: ${JSON.stringify(
      trace.longTasks.map(task => [
        +(task.start - settle.from).toFixed(1),
        +task.durationMs.toFixed(1),
      ]),
    )}`,
  ).toEqual([]);
});

test('a list shorter than the screen still pulls and refreshes', async ({
  page,
}) => {
  // The story's content is 1 px taller than its container, so the container
  // overflows.
  const {driver, content, start} = await openRefresh(
    page,
    'lab-pull-to-refresh--short-list',
    {refreshMs: '6000'},
  );
  await driver.play(slowPull(start, 300, 200));
  await waitForContentRest(content);
  expect(await isBusy(content)).toBe(true);
  expect(await shownPull(content)).toBeCloseTo(HEIGHT, 0);
});

test('a list that fits its container leaves the scroll to the browser: no containment and no pull (spec:AST-025 FR14)', async ({
  page,
}) => {
  const {driver, content, start} = await openRefresh(
    page,
    'lab-pull-to-refresh--short-list',
    {refreshMs: '6000'},
  );
  const scroller = page.locator('[data-refresh-scroller]').first();
  const containment = () =>
    scroller.evaluate(element => getComputedStyle(element).overscrollBehaviorY);
  // With the extra pixel, the container overflows and the pull holds its top.
  await expect.poll(containment).toBe('none');
  // Without it, the list fits.
  await content.evaluate(element => {
    element.style.minHeight = '0px';
  });
  await expect.poll(containment).toBe('auto');
  await driver.play(slowPull(start, 300, 200));
  await page.waitForTimeout(250);
  expect(await isBusy(content)).toBe(false);
  expect(await shownPull(content)).toBe(0);
});

test('a pull pushed back past its start hands the finger to native scrolling', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'native scrolling from injected touches is Chromium-only (WebKit: the iOS simulator rig)',
  );
  const {driver, content, start} = await openRefresh(page);
  const scrollTop = () =>
    page
      .locator('[data-refresh-scroller]')
      .first()
      .evaluate(el => el.scrollTop);
  // Down 50 px, then up 250 px, in one touch.
  const at = (progress: number) =>
    progress < 0.25
      ? {x: start.x, y: start.y + 50 * (progress / 0.25)}
      : {x: start.x, y: start.y + 50 - 250 * ((progress - 0.25) / 0.75)};
  await driver.play(path(at, {durationMs: 900, hz: 60, restMs: 150}));
  await waitForContentRest(content);
  expect(await shownPull(content)).toBeCloseTo(0, 1);
  expect(await isBusy(content)).toBe(false);
  expect(await scrollTop()).toBeGreaterThan(50);
});

test('a drag that began as a scroll pulls once the content reaches the top, in the same touch', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'native scrolling from injected touches is Chromium-only (WebKit: the iOS simulator rig)',
  );
  const {driver, content, start} = await openRefresh(page, undefined, {
    refreshMs: '6000',
  });
  const scroller = page.locator('[data-refresh-scroller]').first();
  const scrollTop = () => scroller.evaluate(el => el.scrollTop);
  await scroller.evaluate(el => {
    el.scrollTop = 80;
  });
  await expect.poll(scrollTop).toBe(80);
  // Down 450 px in one touch: the first 80 px scroll the content to its top
  // natively, and the rest pulls past the trigger.
  await driver.play(slowPull(start, 450, 200));
  await waitForContentRest(content);
  expect(await scrollTop()).toBe(0);
  expect(await isBusy(content)).toBe(true);
  expect(await shownPull(content)).toBeCloseTo(HEIGHT, 0);
});

test('a pull while refreshing stretches from the inset and settles back onto it', async ({
  page,
}) => {
  const {driver, content, start} = await openRefresh(page, undefined, {
    refreshMs: '6000',
  });
  await driver.play(slowPull(start, 300, 200));
  await waitForContentRest(content);
  expect(await shownPull(content)).toBeCloseTo(HEIGHT, 0);
  let deepest = 0;
  await playReading(
    page,
    driver,
    content,
    slowPull(start, 200, 200),
    async () => {
      deepest = await shownPull(content);
    },
  );
  // The second pull starts from the inset, not from the top.
  expect(deepest).toBeGreaterThan(HEIGHT + 60);
  await waitForContentRest(content);
  expect(await shownPull(content)).toBeCloseTo(HEIGHT, 0);
  expect(await isBusy(content)).toBe(true);
});

test('a finger catching the settle holds it where it is, then pulls on from there', async ({
  page,
}) => {
  const {driver, content, start} = await openRefresh(page);
  await driver.play(slowPull(start, 76, 150));
  // The settle back to the top is running: catch it 100 ms in.
  await waitForSettle(content);
  await page.waitForTimeout(100);
  // Where the settle stood as the finger landed. A listener reads it before
  // anything handles the touch. A reading taken earlier misses how far the
  // settle moved before the touch arrived.
  await content.evaluate(element => {
    window.addEventListener(
      'touchstart',
      () => {
        const value = getComputedStyle(element).translate;
        element.dataset.caughtAt = String(
          value === 'none' || value === ''
            ? 0
            : parseFloat(value.split(/\s+/)[1] ?? '0'),
        );
      },
      {capture: true, once: true},
    );
  });
  const readings = await playReading(
    page,
    driver,
    content,
    drag(
      start,
      {x: start.x, y: start.y + 30},
      {durationMs: 300, hz: 60, restMs: 100},
    ),
  );
  const caught = Number(
    await content.evaluate(element => element.dataset.caughtAt),
  );
  expect(caught).toBeGreaterThan(5);
  // No jump at the catch: the first reading is where the settle stood, and
  // the pull goes on from there.
  expect(Math.abs(readings[0].shown - caught)).toBeLessThan(6);
  expect(readings.at(-1)?.shown ?? 0).toBeGreaterThan(caught);
  await waitForContentRest(content);
  expect(await shownPull(content)).toBeCloseTo(0, 1);
});

/** The primary pointer the page reports: coarse (a touch screen) or fine. */
async function primaryPointer(page: Page, kind: 'coarse' | 'fine') {
  await page.addInitScript(coarse => {
    const native = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      const pointer = /^\(\s*pointer\s*:\s*(coarse|fine|none)\s*\)$/.exec(
        query.trim(),
      );
      if (pointer == null) {
        return native(query);
      }
      // A static list: the primary pointer never changes in a test.
      const list = {
        matches: (pointer[1] === 'coarse') === coarse,
        media: query,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent: () => false,
      };
      return list as unknown as MediaQueryList;
    };
  }, kind === 'coarse');
}

interface RecordedAnimation {
  part: 'content' | 'band' | 'other';
  properties: string[];
  /** How long the animated values change, ms (the held end excluded). */
  movingMs: number;
  /**
   * Whether anything but opacity passes through values in between (travel);
   * a value that lands at once (two keyframes at one offset) does not.
   */
  travels: boolean;
  /** Repeats forever (an indicator's own spin, outside the record). */
  endless: boolean;
  /** When it was created (`performance.now()`). */
  at: number;
}

/**
 * Records every animation the page creates from now on, and when the
 * refresh's busy state clears.
 */
async function recordAnimations(page: Page) {
  await page.evaluate(() => {
    const log: unknown[] = [];
    const record = window as unknown as {
      __animations: unknown[];
      __endedAt: number | null;
    };
    record.__animations = log;
    record.__endedAt = null;
    const content = document.querySelector('[data-refresh-content]');
    if (content != null) {
      new MutationObserver(() => {
        if (!content.hasAttribute('aria-busy') && record.__endedAt == null) {
          record.__endedAt = performance.now();
        }
      }).observe(content, {attributes: true, attributeFilter: ['aria-busy']});
    }
    const native = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      const animation = native.call(this, keyframes, options);
      const content = document.querySelector('[data-refresh-content]');
      const band = content?.querySelector(':scope > :last-child > div');
      const part =
        this === content ? 'content' : this === band ? 'band' : 'other';
      const effect = animation.effect as KeyframeEffect | null;
      const frames = effect?.getKeyframes() ?? [];
      const skip = new Set(['offset', 'computedOffset', 'easing', 'composite']);
      const properties = [
        ...new Set(
          frames.flatMap(f => Object.keys(f).filter(k => !skip.has(k))),
        ),
      ];
      const timing = effect?.getComputedTiming();
      const duration = Number(timing?.duration ?? 0);
      const last = frames.at(-1);
      let movingMs = 0;
      for (let i = frames.length - 1; i > 0; i--) {
        if (properties.some(p => frames[i - 1][p] !== last?.[p])) {
          movingMs = Number(frames[i].computedOffset) * duration;
          break;
        }
      }
      const travels = properties
        .filter(p => p !== 'opacity')
        .some(p =>
          frames.some((frame, i) => {
            const next = frames[i + 1];
            return (
              next != null &&
              frame[p] !== next[p] &&
              Number(next.computedOffset) > Number(frame.computedOffset) &&
              !/^step/.test(String(frame.easing ?? 'linear'))
            );
          }),
        );
      log.push({
        part,
        properties,
        movingMs,
        travels,
        endless: timing?.iterations === Infinity,
        at: performance.now(),
      });
      return animation;
    };
  });
}

const recordedAnimations = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as {__animations: RecordedAnimation[]}).__animations,
  );

/** The animations created once the refresh's busy state cleared: the end's. */
const recordedEnd = (page: Page) =>
  page.evaluate(() => {
    const record = window as unknown as {
      __animations: RecordedAnimation[];
      __endedAt: number | null;
    };
    const endedAt = record.__endedAt ?? Infinity;
    return record.__animations.filter(a => a.at >= endedAt);
  });

/**
 * The record's failures among recorded transitions (spins excluded): travel,
 * or values still changing after 200 ms.
 */
function reducedMotionFailures(log: readonly RecordedAnimation[]) {
  return log.filter(
    a => a.part !== 'other' && !a.endless && (a.travels || a.movingMs > 200),
  );
}

/** One frame of what the list and its spinner show. */
interface ShownFrame {
  /** ms on the page's wall clock, as the driver stamps its events. */
  readonly t: number;
  readonly row: number;
  readonly spinner: number;
}

/**
 * Records, on each frame, how much of a row and of the spinner show. Every
 * element that draws one counts: the content's own and any copy of it. Each
 * shows at its opacity up the tree, times the share of its box left visible.
 * An overflow or a clip-path inset clips that box. Together they show
 * 1 − Π(1 − shown).
 */
async function recordShown(content: Locator, label: string) {
  await content.evaluate((element, text) => {
    // The spinner is the indicator's reveal: the band's indicator's child.
    // A copy keeps the mark.
    element
      .querySelector(':scope > :last-child > div > *')
      ?.setAttribute('data-test-refresh-spinner', '');
    const visibleShare = (target: Element) => {
      const box = target.getBoundingClientRect();
      const area = box.width * box.height;
      if (area === 0) {
        return 0;
      }
      let [left, top, right, bottom] = [
        box.left,
        box.top,
        box.right,
        box.bottom,
      ];
      for (let clip: Element | null = target; clip != null;) {
        const style = getComputedStyle(clip);
        const outer = clip.getBoundingClientRect();
        // A clip-path inset() cuts the box itself, children included.
        const inset = /^inset\(([^)]*)\)/.exec(style.clipPath);
        if (inset != null) {
          const [t, r = t, b = t, l = r] = inset[1]
            .trim()
            .split(/\s+/)
            .map(parseFloat);
          left = Math.max(left, outer.left + l);
          top = Math.max(top, outer.top + t);
          right = Math.min(right, outer.right - r);
          bottom = Math.min(bottom, outer.bottom - b);
        }
        const parent: Element | null = clip.parentElement;
        if (
          clip !== target &&
          (style.overflowX !== 'visible' || style.overflowY !== 'visible')
        ) {
          left = Math.max(left, outer.left + clip.clientLeft);
          top = Math.max(top, outer.top + clip.clientTop);
          right = Math.min(
            right,
            outer.left + clip.clientLeft + clip.clientWidth,
          );
          bottom = Math.min(
            bottom,
            outer.top + clip.clientTop + clip.clientHeight,
          );
        }
        clip = parent;
      }

      return (Math.max(0, right - left) * Math.max(0, bottom - top)) / area;
    };
    const shownOf = (target: Element) => {
      let opacity = 1;
      for (
        let node: Element | null = target;
        node != null;
        node = node.parentElement
      ) {
        opacity *= Number(getComputedStyle(node).opacity);
      }
      return opacity * visibleShare(target);
    };
    const together = (targets: Element[]) =>
      1 - targets.reduce((hidden, target) => hidden * (1 - shownOf(target)), 1);
    const record = window as unknown as {
      __shown: ShownFrame[];
      __shownStop: boolean;
    };
    record.__shown = [];
    record.__shownStop = false;
    const frame = () => {
      const rows = [...document.querySelectorAll('span, div')].filter(
        node =>
          node.childElementCount === 0 && node.textContent?.trim() === text,
      );
      record.__shown.push({
        t: performance.timeOrigin + performance.now(),
        row: together(rows),
        spinner: together([
          ...document.querySelectorAll('[data-test-refresh-spinner]'),
        ]),
      });
      if (!record.__shownStop) {
        requestAnimationFrame(frame);
      }
    };
    requestAnimationFrame(frame);
  }, label);
}

const stopShown = async (page: Page) =>
  page.evaluate(() => {
    const record = window as unknown as {
      __shown: ShownFrame[];
      __shownStop: boolean;
    };
    record.__shownStop = true;
    return record.__shown;
  });

const pageNow = async (page: Page) =>
  page.evaluate(() => performance.timeOrigin + performance.now());

test('under Reduce Motion the list and its spinner show on every frame: the release and the end cross-fade rather than dip', async ({
  page,
}) => {
  // A cross-fade connects the two states: the list where it was fades out as
  // the list in its new place fades in. A dip fades out, lands and fades back
  // in, so the list area goes blank between the two. The spinner above the
  // list stays through the release, and fades out as the refresh ends.
  await page.emulateMedia({reducedMotion: 'reduce'});
  await primaryPointer(page, 'coarse');
  const {driver, content, start} = await openRefresh(page, undefined, {
    refreshMs: '-1',
  });
  await recordShown(content, 'Message 2');
  const played = await driver.play(slowPull(start, 300, 200));
  await waitForContentRest(content);
  expect(await shownPull(content)).toBeCloseTo(HEIGHT, 1);
  const endAt = await pageNow(page);
  await endRefresh(page);
  await expect.poll(() => isBusy(content), {timeout: 8000}).toBe(false);
  // The end starts two frames after the busy state clears.
  await expect
    .poll(() => shownPull(content), {timeout: 8000})
    .toBeCloseTo(0, 1);
  await waitForContentRest(content);
  const frames = await stopShown(page);
  const least = Math.min(...frames.map(frame => frame.row));
  const emptiest = frames
    .filter(frame => frame.row < 0.5)
    .map(frame => frame.row.toFixed(3))
    .join(' ');
  // Two equal fades crossing show the row at 0.75 or more. Half is the floor.
  expect(
    least,
    `the row showed at ${least.toFixed(3)} on its emptiest frame; the list blanked (frames under half: ${emptiest})`,
  ).toBeGreaterThanOrEqual(0.5);
  const lift = played.find(event => event.type === 'touchEnd');
  if (lift == null) {
    throw new Error('the play has no lift');
  }
  const spinners = (from: number, to: number) =>
    frames.filter(frame => frame.t > from && frame.t <= to).map(f => f.spinner);
  const pulled = spinners(-Infinity, lift.dispatchedAt);
  expect(pulled.at(-1), 'the pull did not reveal the spinner').toBeGreaterThan(
    0.9,
  );
  const held = spinners(lift.dispatchedAt, endAt);
  const heldLeast = Math.min(...held);
  expect(
    heldLeast,
    `the spinner showed at ${heldLeast.toFixed(3)} on its emptiest frame from the lift (${held.map(v => v.toFixed(2)).join(' ')})`,
  ).toBeGreaterThanOrEqual(0.5);
  const ended = spinners(endAt, Infinity);
  // A fade shows frames between: the spinner leaves where it is, not at once.
  expect(
    ended.some(value => value > 0.1 && value < 0.9),
    `the spinner did not fade as the refresh ended (${ended.map(v => v.toFixed(2)).join(' ')})`,
  ).toBe(true);
  expect(ended.at(-1)).toBeLessThan(0.05);
});

test('under Reduce Motion a release cross-fades onto the inset: opacity only, within 200 ms', async ({
  page,
}) => {
  // Under Reduce Motion, a transition that a touch release starts only fades
  // its opacity, in 200 ms or less. Nothing moves.
  await page.emulateMedia({reducedMotion: 'reduce'});
  await primaryPointer(page, 'coarse');
  const {driver, content, start} = await openRefresh(page, undefined, {
    refreshMs: '6000',
  });
  await recordAnimations(page);
  await driver.play(slowPull(start, 300, 200));
  await waitForContentRest(content);
  expect(await shownPull(content)).toBeCloseTo(HEIGHT, 1);
  const log = await recordedAnimations(page);
  expect(reducedMotionFailures(log), JSON.stringify(log)).toEqual([]);
  // A change with no cross-fade fails too.
  expect(
    log.some(a => a.part === 'content' && a.properties.includes('opacity')),
    JSON.stringify(log),
  ).toBe(true);
});

test('under Reduce Motion the end cross-fades on a touch screen, and a `--motion-…` variable changes nothing', async ({
  page,
}) => {
  // The refresh control's values are internal constants. So no `--motion-…`
  // variable restores travel or a longer animation under Reduce Motion.
  await page.emulateMedia({reducedMotion: 'reduce'});
  await primaryPointer(page, 'coarse');
  const {driver, content, start} = await openRefresh(page, undefined, {
    refreshMs: '-1',
  });
  await page.evaluate(() => {
    const root = document.documentElement.style;
    root.setProperty('--motion-refresh-control-end-ms', '2000ms');
    root.setProperty('--motion-refresh-control-exit-ms', '2000ms');
  });
  await recordAnimations(page);
  await driver.play(slowPull(start, 300, 200));
  await waitForContentRest(content);
  await endRefresh(page);
  await expect.poll(() => isBusy(content), {timeout: 8000}).toBe(false);
  await page.waitForTimeout(100);
  await waitForContentRest(content);
  expect(await shownPull(content)).toBeCloseTo(0, 1);
  const log = await recordedEnd(page);
  expect(reducedMotionFailures(log), JSON.stringify(log)).toEqual([]);
  expect(
    log.some(a => a.part === 'content' && a.properties.includes('opacity')),
    JSON.stringify(log),
  ).toBe(true);
});

test('the end plays the neutral theme’s duration token nearest UIKit’s measured end (spec:AST-094 FR45)', async ({
  page,
}) => {
  const {content} = await openRefresh(page, undefined, {refreshMs: '-1'});
  const steps = ['fast', 'medium', 'slow'].flatMap(band => [
    `--duration-${band}-min`,
    `--duration-${band}`,
    `--duration-${band}-max`,
  ]);
  const tokens = await tokensAt(content, steps);
  // The Storybook theme is neutral: its fast, medium and slow bases.
  expect(
    ['--duration-fast', '--duration-medium', '--duration-slow'].map(name =>
      timeMs(tokens[name]),
    ),
    JSON.stringify(tokens),
  ).toEqual([125, 300, 700]);
  const nearest = steps.reduce((best, name) =>
    Math.abs(timeMs(tokens[name]) - UIKIT_END_MS) <
    Math.abs(timeMs(tokens[best]) - UIKIT_END_MS)
      ? name
      : best,
  );
  // The measurement stays in the motion table as the reference.
  expect(refreshControl.endMs).toBe(UIKIT_END_MS);
  expect(refreshControl.endDurationToken, JSON.stringify(tokens)).toBe(nearest);
});

test('a theme’s duration token retimes the end, and a `--motion-…` variable does not (spec:AST-094 FR45)', async ({
  page,
}) => {
  // The end reads the theme's duration token at its start. The refresh
  // control's own values are internal constants, so no variable retunes them.
  const {driver, content, start} = await openRefresh(page, undefined, {
    refreshMs: '-1',
  });
  await content.evaluate(element => {
    element.style.setProperty('--duration-medium', '600ms');
    document.documentElement.style.setProperty(
      '--motion-refresh-control-end-ms',
      '2000ms',
    );
  });
  await recordAnimations(page);
  await driver.play(slowPull(start, 300, 200));
  await waitForContentRest(content);
  await endRefresh(page);
  await expect.poll(() => isBusy(content), {timeout: 8000}).toBe(false);
  await page.waitForTimeout(100);
  await waitForContentRest(content);
  const log = await recordedEnd(page);
  const slide = log.find(
    a => a.part === 'content' && a.properties.includes('translate'),
  );
  expect(slide, JSON.stringify(log)).toBeDefined();
  expect(Math.abs((slide?.movingMs ?? 0) - 600)).toBeLessThan(20);
});

for (const tempo of [0.75, 1.5]) {
  test(`at a theme tempo of ${tempo}, the end plays UIKit’s curve over the duration token that tempo writes (spec:AST-094 FR45, spec:AST-108)`, async ({
    page,
  }, testInfo) => {
    // A theme with a tempo writes each duration token as its value times
    // the tempo, to the ms, and writes the tempo beside it. So the neutral
    // 300 ms is 225 ms at the quickest bound and 450 ms at the slowest.
    const ms = Math.round(UIKIT_END_MS * tempo);
    const {driver, content, start} = await openRefresh(page, undefined, {
      refreshMs: '-1',
    });
    await content.evaluate(
      (element, values) => {
        element.style.setProperty('--duration-medium', `${values.ms}ms`);
        element.style.setProperty(
          '--_astryx-motion-tempo',
          String(values.tempo),
        );
      },
      {ms, tempo},
    );
    await driver.play(slowPull(start, 300, 200));
    await waitForContentRest(content);
    expect(await shownPull(content)).toBeCloseTo(HEIGHT, 0);
    await endRefresh(page);
    await waitForSettle(content, {afterRefresh: true, hold: true});
    const samples = await sampleTranslate(content, timeline(ms));
    await releaseAnimations(page);
    const ease = cubicBezier(...UIKIT_END_CURVE);
    const oracle = (t: number) => HEIGHT * (1 - ease(Math.min(1, t / ms)));
    const result = compareCurve(samples, oracle, 0.75);
    await writeEvidence(
      `curves/refresh-end-tempo-${tempo}`,
      {
        [`${testInfo.project.name}.json`]: JSON.stringify(
          {ms, samples, result},
          null,
          1,
        ),
      },
      testInfo,
    );
    expect(result.maxError, JSON.stringify(result.worst)).toBeLessThanOrEqual(
      0.75,
    );
    await waitForContentRest(content);
    expect(await shownPull(content)).toBeCloseTo(0, 1);
  });
}

/** A desktop context: no touch screen, so CSS and script read a fine pointer. */
async function desktopPage(
  browser: Browser,
  options: {reducedMotion?: 'reduce'} = {},
) {
  const context = await browser.newContext({
    viewport: {width: 402, height: 714},
    hasTouch: false,
    isMobile: false,
    ...options,
  });
  const page = await context.newPage();
  await openStory(
    page,
    storybook(),
    'lab-pull-to-refresh--in-a-scroll-container',
    {
      refreshMs: '6000',
    },
  );
  const pointer = await page.evaluate(() => ({
    coarse: matchMedia('(pointer: coarse)').matches,
    fine: matchMedia('(pointer: fine)').matches,
  }));
  expect(pointer).toEqual({coarse: false, fine: true});
  const content = page.locator('[data-refresh-content]').first();
  await expect(content).toBeVisible();
  return {context, page, content};
}

/** A mouse drag down from the top of the page, 15 px a step. */
async function mousePull(page: Page, content: Locator, steps: number) {
  await page.mouse.move(200, 160);
  await page.mouse.down();
  const shown: number[] = [];
  for (let step = 1; step <= steps; step++) {
    await page.mouse.move(200, 160 + step * 15);
    shown.push(await shownPull(content));
  }
  await page.mouse.up();
  return shown;
}

/** A pen stroke down from the top of the page: 300 px, 15 px every 16 ms. */
async function penPull(page: Page) {
  const driver = await webInputDriver(page);
  await driver.pen(
    Array.from({length: 21}, (_, step) => ({
      x: 200,
      y: 160 + step * 15,
      t: step * 16,
    })),
  );
}

/**
 * Resolves once the content's settle starts: the release of a pull that
 * ended without a lift (a trackpad's scroll ends when its gesture does).
 */
async function waitForSettleStart(content: Locator, timeout = 3000) {
  await content.evaluate(
    (element, ms) =>
      new Promise<void>((resolve, reject) => {
        const deadline = performance.now() + ms;
        const tick = () => {
          if (element.getAnimations().some(a => a.playState === 'running')) {
            resolve();
            return;
          }
          if (performance.now() > deadline) {
            reject(
              new Error('waitForSettleStart: the pull was never released'),
            );
            return;
          }
          requestAnimationFrame(tick);
        };
        tick();
      }),
    timeout,
  );
}

/** The list's scroll position once it has stopped moving (a smooth scroll ends). */
async function listScrollRest(page: Page, timeout = 3000): Promise<number> {
  return page.evaluate(
    ms =>
      new Promise<number>((resolve, reject) => {
        const deadline = performance.now() + ms;
        const scroller = document.querySelector('[data-refresh-scroller]');
        let last = Number.NaN;
        let still = 0;
        const tick = () => {
          const y = scroller?.scrollTop ?? Number.NaN;
          still = y === last ? still + 1 : 0;
          last = y;
          if (still >= 3) {
            resolve(y);
            return;
          }
          if (performance.now() > deadline) {
            reject(new Error(`listScrollRest: still scrolling (${y})`));
            return;
          }
          requestAnimationFrame(tick);
        };
        tick();
      }),
    timeout,
  );
}

/** Why the trackpad proofs run in WebKit only. */
const TRACKPAD_SKIP =
  "Chromium's driver sends each wheel step as a mouse wheel's notch; WebKit's sends a trackpad's precise deltas";
/** Why the mouse wheel proof runs in Chromium only. */
const MOUSE_WHEEL_SKIP =
  "WebKit's driver sends a trackpad's precise deltas; Chromium's sends each wheel step as a mouse wheel's notch";

/**
 * Wheel steps of `dy` CSS px over the content. Chromium's driver sends each
 * step as a mouse wheel's notch, and WebKit's as a trackpad's precise deltas.
 */
async function scrollWheel(page: Page, steps: number, dy: number) {
  const driver = await webInputDriver(page);
  for (let step = 0; step < steps; step++) {
    await driver.wheel({x: 200, y: 300, dy});
  }
}

test('with a trackpad, a two-finger scroll at the top pulls and refreshes as a finger does (spec:AST-094 FR43)', async ({
  browser,
  browserName,
}) => {
  test.skip(browserName === 'chromium', TRACKPAD_SKIP);
  const {context, page, content} = await desktopPage(browser);
  try {
    // 300 px of scroll toward the top, past the trigger, as one gesture. The
    // steps go out on their schedule. A run the page receives with a
    // gesture-ending pause fails by name.
    const driver = await webInputDriver(page);
    await driver.wheelBurst({
      x: 200,
      y: 300,
      steps: Array.from({length: 30}, () => ({dy: -10})),
      maxGapMs: WHEEL_SCROLL_END_MS.vertical,
    });
    // The scroll's gesture ends after its last step. The pull's release
    // starts the settle, and the content comes to rest on the inset.
    await waitForSettleStart(content);
    await waitForContentRest(content);
    expect(await isBusy(content)).toBe(true);
    expect(await shownPull(content)).toBeCloseTo(HEIGHT, 0);
  } finally {
    await context.close();
  }
});

test('a scroll down the list and back up short of its top stays the list’s and pulls nothing (spec:AST-094 FR43)', async ({
  browser,
}) => {
  const {context, page, content} = await desktopPage(browser);
  try {
    // A scroll down from the top is the list's, not the pull's.
    await scrollWheel(page, 20, 10);
    const scrolled = await listScrollRest(page);
    expect(scrolled).toBeGreaterThan(100);
    // Back up, short of the top: still the list's.
    await scrollWheel(page, 5, -10);
    const back = await listScrollRest(page);
    expect(back).toBeLessThan(scrolled);
    expect(back).toBeGreaterThan(0);
    expect(await shownPull(content)).toBe(0);
    expect(await isBusy(content)).toBe(false);
  } finally {
    await context.close();
  }
});

test('a mouse wheel’s notches at the top never pull: they scroll what is under the pointer (spec:AST-094 FR43)', async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', MOUSE_WHEEL_SKIP);
  const {context, page, content} = await desktopPage(browser);
  try {
    await scrollWheel(page, 3, -100);
    await page.waitForTimeout(250);
    expect(await shownPull(content)).toBe(0);
    expect(await isBusy(content)).toBe(false);
  } finally {
    await context.close();
  }
});

test('with a mouse, a drag at the top stays the browser’s and never pulls', async ({
  browser,
}) => {
  const {context, page, content} = await desktopPage(browser);
  try {
    const shown = await mousePull(page, content, 20);
    expect(shown, JSON.stringify(shown)).toEqual(shown.map(() => 0));
    expect(await isBusy(content)).toBe(false);
  } finally {
    await context.close();
  }
});

test('with a pen, a drag at the top stays the browser’s and never pulls', async ({
  browser,
  browserName,
}) => {
  // A pen exists only in Chromium's input.
  test.skip(browserName !== 'chromium', PEN_SKIP);
  const {context, page, content} = await desktopPage(browser);
  try {
    await penPull(page);
    await page.waitForTimeout(250);
    expect(await shownPull(content)).toBe(0);
    expect(await isBusy(content)).toBe(false);
  } finally {
    await context.close();
  }
});

interface Positions {
  /** The content's presented translation, px. */
  readonly shown: number;
  /** The top of the indicator band, in px below the scroll view's top. */
  readonly indicator: number;
}

/** What `recordPositions` keeps in the page. */
interface PositionRecord {
  __positions: Positions[];
  __readPositions: () => Positions;
}

/**
 * The page records the positions in the frame after each touch move. A read
 * from the runner holds the play's next event back, and then the lift loses
 * the pull's rest.
 */
const recordPositions = (content: Locator) =>
  content.evaluate(element => {
    const band = element.querySelector(':scope > :last-child > div');
    let scroller = element.parentElement;
    while (
      scroller != null &&
      !/auto|scroll/.test(getComputedStyle(scroller).overflowY)
    ) {
      scroller = scroller.parentElement;
    }
    const read = () => {
      const translate = getComputedStyle(element).translate;
      const top = scroller?.getBoundingClientRect().top ?? 0;
      return {
        shown:
          translate === 'none' || translate === ''
            ? 0
            : parseFloat(translate.split(/\s+/)[1] ?? '0'),
        indicator: (band?.getBoundingClientRect().top ?? NaN) - top,
      };
    };
    const record = window as unknown as PositionRecord;
    record.__positions = [];
    record.__readPositions = read;
    addEventListener(
      'touchmove',
      () => requestAnimationFrame(() => record.__positions.push(read())),
      {capture: true, passive: true},
    );
  });

test('the indicator stays at the top of the scroll view while the content is pulled and settles, as UIRefreshControl’s does', async ({
  page,
}) => {
  const {driver, content, start} = await openRefresh(page, undefined, {
    refreshMs: '6000',
  });
  await recordPositions(content);
  await driver.play(slowPull(start, 300, 150));
  await waitForContentRest(content);
  const {readings, indicatorAtRest} = await page.evaluate(() => {
    const record = window as unknown as PositionRecord;
    return {
      readings: record.__positions,
      indicatorAtRest: record.__readPositions().indicator,
    };
  });
  const revealed = readings.filter(r => r.shown >= HEIGHT + 10);
  const shown = revealed.map(r => r.shown);
  const indicator = revealed.map(r => r.indicator);
  // The content travelled while the indicator held still.
  expect(Math.max(...shown) - Math.min(...shown)).toBeGreaterThan(40);
  expect(Math.max(...indicator) - Math.min(...indicator)).toBeLessThanOrEqual(
    1,
  );
  // Settled onto the inset, it is where it was during the pull.
  expect(await shownPull(content)).toBeCloseTo(HEIGHT, 0);
  expect(Math.abs(indicatorAtRest - indicator[0])).toBeLessThanOrEqual(1);
});

/**
 * Watches the content's animations every frame from `from`: the finger's lift
 * or the refresh's end. Right after it, the watcher blocks the main thread for
 * `blockMs`, as a busy app would, and records when the block ends. After the
 * lift, the block runs in its own task, and on a loaded machine the next frame
 * can come first. After the end, it runs in the commit that ends the busy
 * state. For each animation on the content, the watcher records when the main
 * thread first saw it, and when its curve starts on the document timeline.
 */
async function sampleAfter(
  content: Locator,
  from: 'lift' | 'end',
  blockMs: number,
): Promise<void> {
  await content.evaluate(
    (element, {from, blockMs}) => {
      let frames = 0;
      const tracked: {
        animation: Animation;
        seen: number;
        start: number | null;
      }[] = [];
      (window as unknown as {__tracked: typeof tracked}).__tracked = tracked;
      const track = () => {
        const now = performance.now();
        for (const animation of element.getAnimations()) {
          let entry = tracked.find(item => item.animation === animation);
          if (entry == null) {
            entry = {animation, seen: now, start: null};
            tracked.push(entry);
          }
          if (entry.start == null && animation.startTime != null) {
            entry.start = Number(animation.startTime);
          }
        }
      };
      const block = () => {
        const until = performance.now() + blockMs;
        while (performance.now() < until) {
          // A busy app.
        }
        (window as unknown as {__blockEnd: number}).__blockEnd =
          performance.now();
      };
      const watch = () => {
        track();
        frames += 1;
        if (frames < 90) {
          requestAnimationFrame(watch);
        }
      };
      const begin = () => {
        track();
        requestAnimationFrame(watch);
      };
      if (from === 'lift') {
        addEventListener(
          'touchend',
          () => {
            begin();
            setTimeout(block, 0);
          },
          {once: true},
        );
      } else {
        const observer = new MutationObserver(() => {
          if (element.getAttribute('aria-busy') !== 'true') {
            observer.disconnect();
            begin();
            block();
          }
        });
        observer.observe(element, {
          attributes: true,
          attributeFilter: ['aria-busy'],
        });
      }
    },
    {from, blockMs},
  );
}

/**
 * The first animation the content ran after `sampleAfter`'s moment: when the
 * main thread first saw it, and when its curve starts on the document
 * timeline.
 */
async function firstAnimation(
  page: Page,
): Promise<{seen: number; start: number | null} | null> {
  return page.evaluate(() => {
    const [first] = (
      window as unknown as {
        __tracked: {seen: number; start: number | null}[];
      }
    ).__tracked;
    return first == null ? null : {seen: first.seen, start: first.start};
  });
}

test('the settle starts where its curve starts, even when the page is busy right after the lift', async ({
  page,
}) => {
  const {driver, content, start} = await openRefresh(page, undefined, {
    refreshMs: '6000',
  });
  await sampleAfter(content, 'lift', 250);
  await driver.play(slowPull(start, 300, 150));
  await page.waitForTimeout(1200);
  // The settle is made in the lift's own task. It starts at the next frame
  // that the main thread commits, before or after the busy task. Before it,
  // the compositor plays the settle through the block. Either way, its curve
  // starts at the frame it was made for, so its first frames show. A start
  // dated before a block that it waited on would skip them. The content's
  // place in the first frame after the block tells the cases apart only by
  // luck. That frame carries the time it was due, or the current time on a
  // loaded machine. So the proof reads the animation's own start.
  const settle = await firstAnimation(page);
  expect(settle).not.toBeNull();
  expect(settle?.start).not.toBeNull();
  expect(settle?.start ?? 0).toBeGreaterThanOrEqual(
    (settle?.seen ?? 0) - START_SLACK_MS,
  );
  expect(await shownPull(content)).toBeCloseTo(HEIGHT, 0);
});

test('the end slides from its start, even when the page is busy as the refresh ends', async ({
  page,
}) => {
  const {driver, content, start} = await openRefresh(page, undefined, {
    refreshMs: '-1',
  });
  await sampleAfter(content, 'end', 250);
  await driver.play(slowPull(start, 300, 150));
  await waitForContentRest(content);
  await endRefresh(page);
  await waitForSettle(content, {afterRefresh: true});
  await page.waitForTimeout(800);
  // The block runs in the commit that ends the refresh, and the slide is
  // made two frames later. A start dated before the block would skip the
  // slide's first frames. The content's place in the first frame after the
  // block tells this apart only by luck on a loaded machine. So the proof
  // reads the animation's own start, as the settle's proof does.
  const end = await firstAnimation(page);
  const blockEnd = await page.evaluate(
    () => (window as unknown as {__blockEnd: number}).__blockEnd,
  );
  // The end animation and the block's end are both present first, so a
  // missing one fails by name.
  expect(end, JSON.stringify({end, blockEnd})).not.toBeNull();
  expect(typeof end?.start).toBe('number');
  expect(typeof blockEnd).toBe('number');
  expect(end?.start ?? 0).toBeGreaterThanOrEqual(blockEnd - START_SLACK_MS);
});
