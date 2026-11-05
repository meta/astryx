// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PopoverTouchMotion.interaction.browser.spec.ts
 * @input The built Default Popover story, with real touch input (Chromium
 *   CDP / WebKit's input command) and the interaction harness. The proofs
 *   also read the popover's geometry and the theme tokens that time its
 *   motion.
 * @output Animation proofs for Popover's touch presentation under a finger,
 *   one touch model on every touch device. It grows out of its trigger on
 *   the entrance tokens, edge on the trigger. It shrinks back on the exit
 *   tokens, on screen through the light dismiss. The growth keeps advancing
 *   through a blocked main thread. On a page with no other frame work,
 *   neither motion does Layout or Paint per frame. Reduce Motion
 *   cross-fades, opacity only, in 200 ms or less. A mouse keeps the layer's
 *   own entrance. A tap, a pan or a pinch while it grows does nothing but a
 *   pinch's zoom. Storyboards.
 * @position Evidence for Popover's touch presentation; the model itself is
 *   unit-tested in popoverSurfaceMotion.test.ts
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  animationStoryboard,
  armHold,
  blockMainThread,
  busyWindowProof,
  castStoryboard,
  compareCurve,
  countBetween,
  drag,
  freezeTimers,
  holdAnimations,
  installLongTaskLog,
  installTimerGate,
  markElement,
  openStory,
  pinch,
  releaseAnimations,
  startScreencast,
  thawTimers,
  timeline,
  touchDriver,
  traceRendering,
  trackMarker,
  waitForAnimation,
  waitForRest,
  withStorybook,
  writeEvidence,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';
import {timing} from '../../motion/uikit/timing';
import {cubicBezier} from '../../motion/bezier';
import {parseCssEasing, parseMotionRoleValue} from '../../motion/roles';
import type {ThemeTimingTokens} from '../../motion/themeTiming';
import {
  POPOVER_ENTRANCE_TOKENS,
  POPOVER_EXIT_TOKENS,
  popoverCollapsedState,
  popoverFrame,
} from '../popoverSurfaceFrame';

const storybook = withStorybook(test);

// The layer runtime's input hold puts its shield inside the layer. It is a
// manual popover hidden from assistive technology, and not the exit copy.
const SHIELD = '[popover][aria-hidden="true"]:not([data-astryx-popover-exit])';

/**
 * The duration (ms) and the eased progress that the story's theme gives
 * `tokens`, read where the popover is.
 */
async function themeTiming(locator: Locator, tokens: ThemeTimingTokens) {
  const [duration, easing] = await locator.evaluate(
    (element, names) => {
      const style = getComputedStyle(element);
      return names.map(name => style.getPropertyValue(name).trim());
    },
    [tokens.duration, tokens.easing],
  );
  const ms = parseMotionRoleValue('duration', duration);
  const points = parseCssEasing(easing);
  if (ms == null || points == null) {
    throw new Error(
      `the story theme gives no playable timing: ${duration}, ${easing}`,
    );
  }
  const ease = cubicBezier(points);
  return {ms, at: (t: number) => (t >= ms ? 1 : ease(Math.max(0, t) / ms))};
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OpenStory {
  driver: TouchDriver;
  trigger: Locator;
  layer: Locator;
  center: {x: number; y: number};
  triggerBox: Box;
}

async function openDefault(page: Page): Promise<OpenStory> {
  await installLongTaskLog(page);
  await openStory(page, storybook(), 'core-popover--default');
  const driver = await touchDriver(page);
  const trigger = page.getByRole('button', {name: 'Settings'});
  const triggerBox = await trigger.boundingBox();
  if (triggerBox == null) {
    throw new Error('no trigger');
  }
  return {
    driver,
    trigger,
    layer: page.locator('[popover]:has([role="dialog"])').first(),
    center: {
      x: triggerBox.x + triggerBox.width / 2,
      y: triggerBox.y + triggerBox.height / 2,
    },
    triggerBox,
  };
}

/**
 * The element's presented box at each time of its held animations: its
 * layout box scaled by the presented `scale` about its `transform-origin`.
 * Read from the computed style, which follows a seek; a composited animation
 * of an individual transform property does not reach getBoundingClientRect
 * in Chromium.
 */
async function sampleBoxes(
  locator: Locator,
  layout: Box,
  times: ReadonlyArray<number>,
): Promise<{t: number; box: Box; opacity: number}[]> {
  const raw = await locator.evaluate((element, ts) => {
    const held =
      (window as unknown as {__harnessHeld?: Animation[]}).__harnessHeld ?? [];
    if (held.length === 0) {
      throw new Error('sampleBoxes: no held animations');
    }
    return ts.map(t => {
      for (const animation of held) {
        const end = Number(
          animation.effect?.getComputedTiming().endTime ?? Infinity,
        );
        animation.currentTime = Math.min(t, end - 0.5);
      }
      const style = getComputedStyle(element);
      return {
        t,
        scale: style.scale,
        origin: style.transformOrigin,
        opacity: Number(style.opacity),
      };
    });
  }, times);
  return raw.map(({t, scale, origin, opacity}) => {
    const [sx, sy = sx] =
      scale === 'none' ? [1, 1] : scale.split(' ').map(Number);
    const [ox, oy] = origin.split(' ').map(value => parseFloat(value));
    return {
      t,
      opacity,
      box: {
        x: layout.x + ox * (1 - sx),
        y: layout.y + oy * (1 - sy),
        width: layout.width * sx,
        height: layout.height * sy,
      },
    };
  });
}

/** UIKit's popover path at progress p of the growth, as a visual box. */
function expectedBox(final: Box, trigger: Box, p: number): Box {
  const geometry = {
    surface: {
      left: final.x,
      top: final.y,
      width: final.width,
      height: final.height,
    },
    source: {
      left: trigger.x,
      top: trigger.y,
      width: trigger.width,
      height: trigger.height,
    },
  };
  const state = popoverCollapsedState(geometry);
  const frame = popoverFrame(state, p);
  return {
    x: final.x + state.originX * (1 - frame.scaleX),
    y: final.y + state.originY * (1 - frame.scaleY),
    width: final.width * frame.scaleX,
    height: final.height * frame.scaleY,
  };
}

/** The layer's own scale animation among those running in it. */
async function scaleAnimationOf(locator: Locator) {
  for (;;) {
    const found = await waitForAnimation(locator);
    const scale = found.find(a => a.keyframes.some(k => 'scale' in k));
    if (scale != null) {
      return scale;
    }
  }
}

/**
 * Logs when each `scale` animation starts, epoch ms, from a wrapper on
 * `Element.animate`. It runs no frame loop, so it reads nothing between
 * frames.
 */
async function logScaleStarts(page: Page) {
  await page.addInitScript(() => {
    const starts: number[] = [];
    Object.defineProperty(window, '__popoverScaleStarts', {value: starts});
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      const animation = animate.call(this, keyframes, options);
      if (
        Array.isArray(keyframes) &&
        keyframes.some(frame => frame != null && 'scale' in frame)
      ) {
        starts.push(performance.timeOrigin + performance.now());
      }
      return animation;
    };
  });
}

/**
 * The rendering proof's motions: 1.2 s each, set on the layer and its exit
 * copy, which the dismissal clones from it.
 */
const LONG_MOTIONS =
  '[popover]:has([role="dialog"]) { --duration-medium-min: 1200ms; --duration-exit: 1200ms; }';

/** Where each rendering window starts, ms after its motion starts. */
const WINDOW_START_MS = 400;

/** The page's clock, epoch ms. */
async function pageNow(page: Page): Promise<number> {
  return page.evaluate(() => performance.timeOrigin + performance.now());
}

/**
 * Waits in the page until `ms` after the first logged scale start at or after
 * `after`, and returns that start. It reads only the log, never a style, and
 * after the start it sets one timer.
 */
async function waitPastScaleStart(
  page: Page,
  after: number,
  ms: number,
): Promise<number> {
  return page.evaluate(
    async ({after, ms}) =>
      new Promise<number>((resolve, reject) => {
        const starts = (window as unknown as {__popoverScaleStarts: number[]})
          .__popoverScaleStarts;
        const deadline = performance.now() + 5_000;
        const look = () => {
          const start = starts.find(logged => logged >= after);
          if (start != null) {
            const now = performance.timeOrigin + performance.now();
            setTimeout(() => resolve(start), Math.max(0, start + ms - now));
          } else if (performance.now() > deadline) {
            reject(new Error('no scale animation started'));
          } else {
            setTimeout(look, 10);
          }
        };
        look();
      }),
    {after, ms},
  );
}

/** The static copy the dismissal plays on. */
const exitCopyOf = (page: Page) =>
  page.locator('[data-astryx-popover-exit]').first();

async function openWithTap(story: OpenStory) {
  await story.driver.tap(story.center);
  await expect(story.trigger).toHaveAttribute('aria-expanded', 'true');
}

test.describe('with a mouse (a fine primary pointer)', () => {
  test.use({hasTouch: false, isMobile: false});

  test('the layer keeps its own entrance and the popover closes at once', async ({
    page,
  }) => {
    await installLongTaskLog(page);
    await openStory(page, storybook(), 'core-popover--default');
    const trigger = page.getByRole('button', {name: 'Settings'});
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const layer = page.locator('[popover]:has([role="dialog"])').first();
    // The layer's own CSS entrance runs; no UIKit scale is set or played.
    const entrance = await layer.evaluate(element => ({
      inlineScale: (element as HTMLElement).style.getPropertyValue('scale'),
      inlineAnimation: (element as HTMLElement).style.getPropertyValue(
        'animation-name',
      ),
      animationName: getComputedStyle(element).animationName,
      played: element
        .getAnimations()
        .some(
          animation =>
            !(animation instanceof CSSAnimation) &&
            (animation.effect as KeyframeEffect | null)
              ?.getKeyframes()
              .some(frame => 'scale' in frame) === true,
        ),
    }));
    expect(entrance.inlineScale).toBe('');
    expect(entrance.inlineAnimation).toBe('');
    expect(entrance.animationName).not.toBe('none');
    expect(entrance.played).toBe(false);
    await waitForRest(layer);
    // A click outside closes it at once: no copy shrinks back into the trigger.
    const viewport = page.viewportSize();
    if (viewport == null) {
      throw new Error('no viewport');
    }
    await page.mouse.click(20, viewport.height - 20);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(exitCopyOf(page)).toHaveCount(0);
  });
});

test('the presentation grows out of the trigger on the theme\u2019s entrance tokens', async ({
  page,
}, testInfo) => {
  const story = await openDefault(page);
  // The popover's layout box, from a first presentation run to rest.
  await openWithTap(story);
  await waitForRest(story.layer);
  const final = (await story.layer.boundingBox())!;
  const entrance = await themeTiming(story.layer, POPOVER_ENTRANCE_TOKENS);
  await page.keyboard.press('Escape');
  await expect(story.trigger).toHaveAttribute('aria-expanded', 'false');
  // Presenting during the dismissal would turn back from the closing frame.
  await expect(exitCopyOf(page)).toHaveCount(0);
  await openWithTap(story);
  await scaleAnimationOf(story.layer);
  const held = await holdAnimations(page, story.layer);
  const samples = await sampleBoxes(
    story.layer,
    final,
    timeline(entrance.ms + 100),
  );
  await releaseAnimations(page, {finish: true});
  const at = (t: number) =>
    expectedBox(final, story.triggerBox, entrance.at(t));
  const compare = (read: (box: Box) => number) =>
    compareCurve(
      samples.map(sample => ({t: sample.t, value: read(sample.box)})),
      t => read(at(t)),
      0.75,
    );
  const width = compare(box => box.width);
  const height = compare(box => box.height);
  const top = compare(box => box.y);
  const cx = compare(box => box.x + box.width / 2);
  const opacity = compareCurve(
    samples.map(sample => ({t: sample.t, value: sample.opacity})),
    t => entrance.at(t),
    0.02,
  );
  await writeEvidence(
    'curves/popover-touch-present',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {held, final, trigger: story.triggerBox, width, height, top, cx},
        null,
        1,
      ),
    },
    testInfo,
  );
  // The popover's edge stays on the trigger's bottom edge throughout.
  for (const sample of samples) {
    expect(sample.box.y).toBeCloseTo(final.y, 0);
  }
  for (const result of [width, height, top, cx, opacity]) {
    expect(result.maxError, JSON.stringify(result.worst)).toBeLessThanOrEqual(
      result.tolerance,
    );
  }
});

test('the dismissal shrinks back into the trigger on the theme\u2019s exit tokens, on screen through the light dismiss', async ({
  page,
}, testInfo) => {
  const story = await openDefault(page);
  await openWithTap(story);
  await waitForRest(story.layer);
  const open = (await story.layer.boundingBox())!;
  const exit = await themeTiming(story.layer, POPOVER_EXIT_TOKENS);
  // Tap outside: the browser's light dismiss closes the popover at once.
  const viewport = page.viewportSize()!;
  await story.driver.tap({x: 20, y: viewport.height - 20});
  await expect(story.trigger).toHaveAttribute('aria-expanded', 'false');
  const copy = exitCopyOf(page);
  await scaleAnimationOf(copy);
  const held = await holdAnimations(page, copy);
  // The popover is closed and gone; the dismissal plays on a static copy
  // where it stood, out of the accessibility tree and out of reach.
  const state = await page.evaluate(() => {
    const layer = document.querySelector<HTMLElement>(
      '[popover]:has([role="dialog"])',
    )!;
    const exitCopy = document.querySelector<HTMLElement>(
      '[data-astryx-popover-exit]',
    )!;
    return {
      layerOpen: layer.matches(':popover-open'),
      layerDisplay: getComputedStyle(layer).display,
      copyHidden: exitCopy.getAttribute('aria-hidden'),
      copyInert: exitCopy.hasAttribute('inert'),
      copyPointerEvents: getComputedStyle(exitCopy).pointerEvents,
      copyIds: exitCopy.querySelectorAll('[id]').length,
    };
  });
  expect(state).toEqual({
    layerOpen: false,
    layerDisplay: 'none',
    copyHidden: 'true',
    copyInert: true,
    copyPointerEvents: 'none',
    copyIds: 0,
  });
  const samples = await sampleBoxes(copy, open, timeline(exit.ms + 100));
  await releaseAnimations(page, {finish: true});
  // The dismissal runs the presentation's path backwards.
  const at = (t: number) => expectedBox(open, story.triggerBox, 1 - exit.at(t));
  const width = compareCurve(
    samples.map(sample => ({t: sample.t, value: sample.box.width})),
    t => at(t).width,
    0.75,
  );
  const height = compareCurve(
    samples.map(sample => ({t: sample.t, value: sample.box.height})),
    t => at(t).height,
    0.75,
  );
  const opacity = compareCurve(
    samples.map(sample => ({t: sample.t, value: sample.opacity})),
    t => 1 - exit.at(t),
    0.02,
  );
  await writeEvidence(
    'curves/popover-touch-dismiss',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {held, open, trigger: story.triggerBox, state, width, height},
        null,
        1,
      ),
    },
    testInfo,
  );
  for (const result of [width, height, opacity]) {
    expect(result.maxError, JSON.stringify(result.worst)).toBeLessThanOrEqual(
      result.tolerance,
    );
  }
  // Once the dismissal has run, the copy is gone.
  await expect(page.locator('[data-astryx-popover-exit]')).toHaveCount(0);
});

test('the presentation keeps advancing every frame while the main thread is blocked', async ({
  page,
  browserName,
}, testInfo) => {
  test.skip(
    browserName !== 'chromium',
    'screencast frame evidence is Chromium-only in Playwright (WebKit: the iOS simulator rig)',
  );
  const story = await openDefault(page);
  // The screencast finds the element by its marker's exact color, which the
  // content fade would blend away. So this proof holds opacity at 1, since an
  // important declaration outranks the animation. The scale, composited the
  // same way, carries the evidence.
  await page.addStyleTag({
    content: '[popover]:has([role="dialog"]) { opacity: 1 !important; }',
  });
  await markElement(story.layer, {size: 24, inset: 0});
  const entrance = await themeTiming(story.layer, POPOVER_ENTRANCE_TOKENS);
  const cast = await startScreencast(page);
  await openWithTap(story);
  const [present] = await waitForAnimation(story.layer, {minProgressMs: 16});
  const block = await blockMainThread(page, 400);
  await page.waitForTimeout(100);
  const castFrames = await cast.stop();
  const tracked = await trackMarker(page, castFrames);
  // Up to the end of the growth: until then the marker moves one way only.
  const window = {
    from: block.from,
    to: Math.min(block.to, present.from + entrance.ms - 20),
  };
  const proof = busyWindowProof(tracked, window, {axis: 'x'});
  await writeEvidence(
    'busy-main-thread/popover-touch-present',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {block, present, proof},
        null,
        1,
      ),
    },
    testInfo,
  );
  const film = await castStoryboard(page, castFrames, {
    name: 'popover-touch-present-busy-main-thread',
    zero: block.from,
    from: block.from - 40,
    to: window.to + 40,
    columns: 8,
    cellScale: 0.35,
    data: t => ({x: tracked.find(f => f.t === t)?.box?.x ?? -1}),
  });
  await film.write(testInfo, {block, present});
  expect(proof.frames).toBeGreaterThanOrEqual(proof.expectedFrames - 2);
  expect(proof.changed).toBeGreaterThanOrEqual(proof.frames - 3);
  // A stall is judged in the screencast's own intervals, as the harness's
  // verdict judges it: no more than two dropped frames.
  expect(proof.longestStallFrames).toBeLessThanOrEqual(3);
  expect(proof.monotonic).toBe(true);
});

test('the presentation and the dismissal do no Layout or Paint per frame', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
  await logScaleStarts(page);
  const story = await openDefault(page);
  // Both motions run for 1.2 s here. The windows can then start after the
  // one-off work as the content appears and still span many frames, even
  // on a loaded machine.
  await page.addStyleTag({content: LONG_MOTIONS});
  const entrance = await themeTiming(story.layer, POPOVER_ENTRANCE_TOKENS);
  const exit = await themeTiming(story.layer, POPOVER_EXIT_TOKENS);
  expect(entrance.ms).toBe(1200);
  expect(exit.ms).toBe(1200);
  // It opens from the keyboard to keep the trigger's own press feedback out
  // of the measurement. The phone's primary pointer is still coarse, so the
  // touch presentation runs. Nothing reads the page inside the windows: on
  // this anchored layer, a style read during an animation is a style update
  // and a layout. That rules out the harness's animation recorder, which
  // reads every animation each frame, so the windows come from when each
  // scale animation starts.
  await story.trigger.focus();
  let present = 0;
  let dismiss = 0;
  const trace = await traceRendering(page, async () => {
    const opened = await pageNow(page);
    await page.keyboard.press('Enter');
    present = await waitPastScaleStart(page, opened, entrance.ms + 150);
    const closed = await pageNow(page);
    await page.keyboard.press('Escape');
    dismiss = await waitPastScaleStart(page, closed, exit.ms + 150);
  });
  // Each window starts 400 ms in, after the focus ring and the touch hit
  // areas' first measurement, and ends one frame before its curve does. A
  // page frame callback makes Chromium lay out this anchored layer every
  // frame. So these zeros also show that no frame loop runs here, Popover's
  // own included.
  for (const [name, base, ms] of [
    ['present', present, entrance.ms],
    ['dismiss', dismiss, exit.ms],
  ] as const) {
    const from = base + WINDOW_START_MS;
    const end = base + ms - 20;
    const during = countBetween(trace, from, end);
    // On failure, every rendering event of the window, in ms after its
    // animation's start.
    const detail = `${name} ${JSON.stringify({
      during,
      events: trace.events
        .filter(e => e.t >= from && e.t <= end)
        .map(e => `${e.name}@${Math.round(e.t - base)}`),
    })}`;
    expect(during.Layout ?? 0, detail).toBe(0);
    expect(during.Paint ?? 0, detail).toBe(0);
  }
  // A loaded machine stretches a task's wall time, not its thread time. So a
  // long task here is one that runs over 50 ms of thread time.
  expect(trace.longTasks.filter(task => task.threadMs > 50)).toEqual([]);
  // Positive control: the same trace sees per-frame work in such a window.
  // A frame loop moves the trigger by a pixel in each frame the page draws.
  // Every one of those frames must show work, however few are drawn.
  await story.trigger.evaluate(element => {
    (element as HTMLElement).style.position = 'relative';
  });
  let loopFrom = 0;
  const control = await traceRendering(page, async () => {
    loopFrom = await story.trigger.evaluate((element, ms) => {
      const style = (element as HTMLElement).style;
      const writes: number[] = [];
      Object.defineProperty(window, '__popoverLoopWrites', {value: writes});
      const from = performance.now();
      let frame = 0;
      const step = () => {
        const now = performance.now();
        frame += 1;
        style.top = `${frame % 2}px`;
        writes.push(performance.timeOrigin + now);
        if (now - from < ms) {
          requestAnimationFrame(step);
        }
      };
      requestAnimationFrame(step);
      return performance.timeOrigin + from;
    }, entrance.ms);
    await page.waitForTimeout(entrance.ms + 150);
  });
  const from = loopFrom + WINDOW_START_MS;
  const end = loopFrom + entrance.ms - 20;
  const drawn = (
    await page.evaluate(() => [
      ...(window as unknown as {__popoverLoopWrites: number[]})
        .__popoverLoopWrites,
    ])
  ).filter(write => write >= from && write <= end);
  expect(drawn.length, 'frames drawn in the window').toBeGreaterThan(1);
  for (const write of drawn) {
    expect(
      control.events.some(
        event =>
          (event.name === 'Layout' || event.name === 'Paint') &&
          event.t >= write &&
          event.t < write + 1000 / 60,
      ),
      `work in the frame drawn ${Math.round(write - loopFrom)} ms in`,
    ).toBe(true);
  }
});

test('Reduce Motion: the popover cross-fades in at its size and out where it stands, in 200 ms or less with no spring', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  const story = await openDefault(page);
  await openWithTap(story);
  await waitForAnimation(story.layer);
  await holdAnimations(page, story.layer);
  const unit = {x: 0, y: 0, width: 100, height: 100};
  // design:reduced-motion DR2: opacity only, 200 ms or less, here on
  // UIKit's cross-fade curve.
  const ease = cubicBezier(timing.curves.move);
  const fade = (t: number) =>
    ease(Math.min(1, Math.max(0, t / timing.reducedMotionCrossFadeMs)));
  const samples = await sampleBoxes(story.layer, unit, timeline(300));
  // Resume rather than finish: the dismissal below starts from what the
  // animator presents, which follows the clock.
  await releaseAnimations(page);
  await page.waitForTimeout(400);
  // No growth: every frame is the popover at full size; it only fades in.
  for (const sample of samples) {
    expect(sample.box.width).toBeCloseTo(100, 3);
    expect(sample.box.height).toBeCloseTo(100, 3);
  }
  const opacity = compareCurve(
    samples.map(sample => ({t: sample.t, value: sample.opacity})),
    fade,
    0.02,
  );
  expect(opacity.maxError, JSON.stringify(opacity.worst)).toBeLessThanOrEqual(
    0.02,
  );
  // In by 200 ms.
  for (const sample of samples.filter(
    s => s.t >= timing.reducedMotionCrossFadeMs,
  )) {
    expect(sample.opacity).toBeCloseTo(1, 3);
  }
  // The dismissal fades out where the popover stands, on the same curve.
  await page.keyboard.press('Escape');
  const copy = exitCopyOf(page);
  await waitForAnimation(copy);
  await holdAnimations(page, copy);
  const [closing, gone] = await sampleBoxes(copy, unit, [
    100,
    timing.reducedMotionCrossFadeMs,
  ]);
  await releaseAnimations(page, {finish: true});
  expect(closing.box.width).toBeCloseTo(100, 3);
  expect(closing.opacity).toBeCloseTo(1 - fade(100), 2);
  expect(gone.opacity).toBeCloseTo(0, 3);
});

test(
  'storyboard: tap to present, tap outside to dismiss',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    const story = await openDefault(page);
    await installTimerGate(page);
    const viewport = page.viewportSize() ?? {width: 402, height: 714};
    const clip = {x: 0, y: 0, width: viewport.width, height: viewport.height};
    // The presented scale and opacity (a composited scale does not reach
    // getBoundingClientRect in Chromium), and the layout size they apply to.
    const measureOf = (locator: Locator) => async () =>
      locator.evaluate(node => {
        const el = node as HTMLElement;
        const style = getComputedStyle(el);
        const [sx, sy = sx] =
          style.scale === 'none' ? [1, 1] : style.scale.split(' ').map(Number);
        return {
          w: el.offsetWidth * sx,
          h: el.offsetHeight * sy,
          opacity: Number(style.opacity),
        };
      });
    await openWithTap(story);
    await waitForAnimation(story.layer);
    const entrance = await themeTiming(story.layer, POPOVER_ENTRANCE_TOKENS);
    const exit = await themeTiming(story.layer, POPOVER_EXIT_TOKENS);
    await freezeTimers(page);
    const {storyboard: presentBoard} = await animationStoryboard(page, {
      name: 'popover-touch-present',
      clip,
      scope: story.layer,
      measure: measureOf(story.layer),
      // The growth ends with the entrance duration; the animation holds its
      // end state past that.
      times: timeline(entrance.ms + 100),
      columns: 8,
      cellScale: 0.35,
    });
    await releaseAnimations(page, {finish: true});
    await thawTimers(page);
    await waitForRest(story.layer);
    await story.driver.tap({x: 20, y: viewport.height - 20});
    const copy = exitCopyOf(page);
    await waitForAnimation(copy);
    await freezeTimers(page);
    const {storyboard: dismissBoard} = await animationStoryboard(page, {
      name: 'popover-touch-dismiss',
      clip,
      scope: copy,
      measure: measureOf(copy),
      times: timeline(exit.ms + 100),
      columns: 8,
      cellScale: 0.35,
    });
    await releaseAnimations(page, {finish: true});
    await thawTimers(page);
    await presentBoard.write(testInfo);
    await dismissBoard.write(testInfo);
    // The trace is the assertion: it grows from a point, wide before tall,
    // with no overshoot, and shrinks back.
    const widths = presentBoard.frames.map(f => f.data.w as number);
    const heights = presentBoard.frames.map(f => f.data.h as number);
    expect(widths[0]).toBeLessThan(widths.at(-1)! / 10);
    expect(Math.max(...widths)).toBeLessThanOrEqual(widths.at(-1)! + 0.5);
    const middle = Math.floor(widths.length / 8);
    expect(heights[middle] / heights.at(-1)!).toBeLessThan(
      widths[middle] / widths.at(-1)!,
    );
    const dismissWidths = dismissBoard.frames.map(f => f.data.w as number);
    expect(dismissWidths.at(-1)!).toBeLessThan(dismissWidths[0] / 2);
  },
);

/**
 * Logs each close of a popover and each click on an added button outside it.
 * The hold takes a held press before any page listener, so the log counts
 * what a press did, not the press itself.
 */
async function installPressLog(page: Page) {
  await page.evaluate(() => {
    const log = {closed: 0, outsideClicks: 0};
    (window as unknown as {__pressLog: typeof log}).__pressLog = log;
    document.addEventListener(
      'toggle',
      event => {
        if (event.newState === 'closed') {
          log.closed += 1;
        }
      },
      true,
    );
    const outside = document.createElement('button');
    outside.textContent = 'Outside';
    Object.assign(outside.style, {
      position: 'fixed',
      right: '20px',
      bottom: '20px',
      width: '120px',
      height: '44px',
    });
    outside.addEventListener('click', () => {
      log.outsideClicks += 1;
    });
    document.body.append(outside);
  });
}

const readPressLog = async (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __pressLog: {closed: number; outsideClicks: number};
        }
      ).__pressLog,
  );

/** Whether the hold's shield is up and is what a press at `point` hits. */
async function shieldTakes(page: Page, point: {x: number; y: number}) {
  return page.evaluate(
    ({selector, x, y}) => {
      const shield = document.querySelector(selector);
      return (
        shield?.matches(':popover-open') === true &&
        document.elementFromPoint(x, y) === shield
      );
    },
    {selector: SHIELD, ...point},
  );
}

/** The center of the added button outside the popover. */
function outsidePoint(page: Page) {
  const viewport = page.viewportSize();
  if (viewport == null) {
    throw new Error('no viewport');
  }
  return {x: viewport.width - 80, y: viewport.height - 42};
}

/**
 * Opens the popover with a tap and holds its growth where it starts, so the
 * next press lands while it grows. Returns the held growth; release it with
 * `releaseAnimations`.
 */
async function openHeldWhileGrowing(page: Page, story: OpenStory) {
  const armed = await armHold(page, story.layer);
  await openWithTap(story);
  return armed.held();
}

const focusedElement = async (page: Page) =>
  page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120));

test('a tap outside while it grows is ignored: the popover stays open and keeps focus, and the tap reaches nothing', async ({
  page,
}) => {
  const story = await openDefault(page);
  await installPressLog(page);
  const outside = outsidePoint(page);
  await openHeldWhileGrowing(page, story);
  const focusedAtOpen = await focusedElement(page);
  // The tap outside lands on the hold's shield.
  expect(await shieldTakes(page, outside)).toBe(true);
  await story.driver.tap(outside);
  await releaseAnimations(page, {finish: true});
  await waitForRest(story.layer);
  await expect(story.trigger).toHaveAttribute('aria-expanded', 'true');
  const log = await readPressLog(page);
  expect(log.closed).toBe(0);
  expect(log.outsideClicks).toBe(0);
  // The control the popover focused keeps focus.
  expect(focusedAtOpen).toContain('role="switch"');
  expect(await focusedElement(page)).toBe(focusedAtOpen);
  // Once it has grown, the hold is gone, and a tap outside dismisses it.
  await expect(page.locator(SHIELD)).toHaveCount(0);
  await story.driver.tap(outside);
  await expect(story.trigger).toHaveAttribute('aria-expanded', 'false');
});

test('a tap on the trigger while it grows does not close the popover', async ({
  page,
}) => {
  const story = await openDefault(page);
  await installPressLog(page);
  await openHeldWhileGrowing(page, story);
  expect(await shieldTakes(page, story.center)).toBe(true);
  await story.driver.tap(story.center);
  await releaseAnimations(page, {finish: true});
  await waitForRest(story.layer);
  await expect(story.trigger).toHaveAttribute('aria-expanded', 'true');
  const log = await readPressLog(page);
  expect(log.closed).toBe(0);
});

test('a pan outside while it grows starts nothing: no scroll, and the popover stays', async ({
  page,
}) => {
  const story = await openDefault(page);
  test.skip(
    !story.driver.drivesNativeGestures,
    'scripted touches do not start native pans in this engine',
  );
  await installPressLog(page);
  // Room to scroll, so a pan the browser took would scroll the page.
  await page.addStyleTag({content: 'body { min-height: 300vh; }'});
  const viewport = page.viewportSize()!;
  await openHeldWhileGrowing(page, story);
  const focusedAtOpen = await focusedElement(page);
  const from = {x: viewport.width - 40, y: viewport.height - 120};
  expect(await shieldTakes(page, from)).toBe(true);
  await story.driver.play(
    drag(from, {x: from.x, y: from.y - 100}, {durationMs: 150, hz: 60}),
  );
  await releaseAnimations(page, {finish: true});
  await waitForRest(story.layer);
  await expect(story.trigger).toHaveAttribute('aria-expanded', 'true');
  const log = await readPressLog(page);
  expect(log.closed).toBe(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await focusedElement(page)).toBe(focusedAtOpen);
});

test('a pinch while it grows zooms the page, and the popover grows and stays', async ({
  page,
}) => {
  const story = await openDefault(page);
  test.skip(
    !story.driver.drivesNativeGestures,
    'scripted touches do not start a native pinch-zoom in this engine',
  );
  await installPressLog(page);
  const scale = async () =>
    page.evaluate(() => window.visualViewport?.scale ?? 1);
  expect(await scale()).toBe(1);
  const viewport = page.viewportSize()!;
  await openHeldWhileGrowing(page, story);
  const center = {x: viewport.width / 2, y: viewport.height - 160};
  expect(await shieldTakes(page, center)).toBe(true);
  await story.driver.play(
    pinch({
      center,
      fromDistance: 60,
      toDistance: 240,
      durationMs: 200,
      hz: 60,
    }),
  );
  await releaseAnimations(page, {finish: true});
  await waitForRest(story.layer);
  // The fingers landed on the shield, which leaves a pinch to the browser.
  await expect.poll(scale).toBeGreaterThan(1.1);
  await expect(story.trigger).toHaveAttribute('aria-expanded', 'true');
  const log = await readPressLog(page);
  expect(log.closed).toBe(0);
});

test(
  'storyboard: a tap outside while it grows, and the growth goes on',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    const story = await openDefault(page);
    await installTimerGate(page);
    const viewport = page.viewportSize() ?? {width: 402, height: 714};
    const clip = {x: 0, y: 0, width: viewport.width, height: viewport.height};
    const entrance = await themeTiming(story.layer, POPOVER_ENTRANCE_TOKENS);
    const held = await openHeldWhileGrowing(page, story);
    const outside = outsidePoint(page);
    expect(await shieldTakes(page, outside)).toBe(true);
    await story.driver.tap(outside);
    await freezeTimers(page);
    const {storyboard} = await animationStoryboard(page, {
      name: 'popover-touch-tap-while-growing',
      clip,
      held,
      measure: async () =>
        story.layer.evaluate(node => {
          const el = node as HTMLElement;
          const style = getComputedStyle(el);
          const [sx] =
            style.scale === 'none' ? [1] : style.scale.split(' ').map(Number);
          return {w: el.offsetWidth * sx, open: el.matches(':popover-open')};
        }),
      times: timeline(entrance.ms + 100),
      columns: 8,
      cellScale: 0.35,
    });
    await releaseAnimations(page, {finish: true});
    await thawTimers(page);
    await storyboard.write(testInfo);
    // The trace is the assertion: the popover stays open on every frame and
    // grows to its full width, with no exit copy.
    const widths = storyboard.frames.map(f => f.data.w as number);
    expect(storyboard.frames.every(f => f.data.open === true)).toBe(true);
    expect(widths.at(-1)!).toBeGreaterThan(widths[0]);
    await expect(exitCopyOf(page)).toHaveCount(0);
    await expect(story.trigger).toHaveAttribute('aria-expanded', 'true');
  },
);
