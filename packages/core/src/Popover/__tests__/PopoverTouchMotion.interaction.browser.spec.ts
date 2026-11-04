// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PopoverTouchMotion.interaction.browser.spec.ts
 * @input The built Default Popover story, real touch input (Chromium CDP /
 *   WebKit's input command), the interaction harness, the popover's
 *   geometry and the theme tokens that time its motion
 * @output Animation proofs for Popover's touch presentation (under a finger,
 *   one touch model on every touch device): it grows out of its trigger on
 *   the theme's entrance tokens (the edge on the trigger, the scale and the
 *   length together) and shrinks back into it on the theme's exit tokens, on
 *   screen through the light dismiss; the growth keeps advancing through a
 *   blocked main thread; neither does Layout or Paint per frame; Reduce
 *   Motion cross-fades, opacity only, in 200 ms or less; a mouse keeps the
 *   layer's own entrance; a tap, a pan or a pinch while it grows does nothing
 *   but a pinch's zoom; storyboards
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
  readLongTasks,
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
  const values = await locator.evaluate(
    (element, names) => {
      const style = getComputedStyle(element);
      return names.map(name => style.getPropertyValue(name).trim());
    },
    [...tokens.durations, tokens.easing],
  );
  const easing = values.pop() ?? '';
  const ms = values
    .map(value => parseMotionRoleValue('duration', value))
    .find(value => value != null);
  const points = parseCssEasing(easing);
  if (ms == null || points == null) {
    throw new Error(
      `the story theme gives no playable timing: ${values.join(', ')}`,
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
  // content fade would blend away: hold opacity at 1 for this proof (an
  // important declaration outranks the animation); the scale, composited
  // the same way, carries the evidence.
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
  const story = await openDefault(page);
  const entrance = await themeTiming(story.layer, POPOVER_ENTRANCE_TOKENS);
  const exit = await themeTiming(story.layer, POPOVER_EXIT_TOKENS);
  let present = {from: 0, to: 0};
  let dismiss = {from: 0, to: 0};
  const started = Date.now();
  // Opened from the keyboard (the phone's primary pointer is still coarse,
  // so the touch presentation runs) to keep the trigger's own press
  // feedback out of the measurement. Nothing polls the page inside the
  // windows: a style read during an animation forces a style update, and on
  // an anchored element a layout.
  await story.trigger.focus();
  const trace = await traceRendering(page, async () => {
    await page.keyboard.press('Enter');
    present = await scaleAnimationOf(story.layer);
    await page.waitForTimeout(present.to - Date.now() + 100);
    await page.keyboard.press('Escape');
    dismiss = await scaleAnimationOf(exitCopyOf(page));
    await page.waitForTimeout(dismiss.to - Date.now() + 100);
  });
  // The animations hold their end state for a while past the curve; judge
  // the curves themselves, less their first and last frames. The growth's
  // first 150 ms also carry the focus moving into the popover (its first
  // control paints its ring), which is not this motion.
  const windows = [
    {
      name: 'present',
      from: present.from + 150,
      to: present.from + entrance.ms - 20,
    },
    {
      name: 'dismiss',
      from: dismiss.from + 30,
      to: dismiss.from + exit.ms - 20,
    },
  ];
  for (const window of windows) {
    const during = countBetween(trace, window.from, window.to);
    // On failure, every rendering event of the window, in ms after its
    // animation's start.
    const base = window.name === 'present' ? present.from : dismiss.from;
    const detail = `${window.name} ${JSON.stringify({
      during,
      events: trace.events
        .filter(e => e.t >= window.from && e.t <= window.to)
        .map(e => `${e.name}@${Math.round(e.t - base)}`),
    })}`;
    expect(during.Layout ?? 0, detail).toBe(0);
    expect(during.Paint ?? 0, detail).toBe(0);
  }
  expect(trace.longTasks).toEqual([]);
  expect(await readLongTasks(page, {from: started, to: Date.now()})).toEqual(
    [],
  );
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
