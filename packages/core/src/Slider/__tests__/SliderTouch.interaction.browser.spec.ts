// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SliderTouch.interaction.browser.spec.ts
 * @input The built Slider stories ("Default", "Touch tracking", "In a
 *   scrolling list"), real touch input and the interaction harness
 * @output Proofs of Slider's touch presentation: the 48 px target, the lift,
 *   the travel past 10 px, the ends and the coast. They cover a track tap on
 *   its lift, a slow or resting release, a catch, Reduce Motion, coincident
 *   thumbs, RTL and a list's vertical swipe. The coast keeps moving through
 *   a blocked main thread, and a drag lays out nothing per move.
 * @position Browser layer of Slider's touch presentation. The unit layers
 *   are useSliderTouch.test.tsx and motion/uikit/slider.test.ts.
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  blockMainThread,
  busyWindowProof,
  castStoryboard,
  compareCurve,
  CONTROL_RGB,
  countBetween,
  drag,
  flick,
  frames,
  holdAnimations,
  markElement,
  openStory,
  type Point,
  releaseAnimations,
  sampleCurve,
  springStep,
  startBusyControl,
  startScreencast,
  tap,
  type TouchDriver,
  touchDriver,
  type TouchScript,
  traceRendering,
  trackMarker,
  waitForRest,
  withStorybook,
  writeEvidence,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

/** UISlider, from the constants table (motion/uikit/slider.ts). */
const UISLIDER = {
  hysteresis: 10,
  hitTarget: 48,
  liftScale: 1.55,
  lift: {response: 0.215, dampingFraction: 0.6},
  release: {response: 0.4, dampingFraction: 1},
  projectionRate: 0.996,
  projectionShare: 0.4,
} as const;
/** Slider's thumb, px: its travel is the track minus one thumb. */
const THUMB = 20;
/** UISlider's touch target, px (`slider.thumbHitTarget`). */
const HIT_TARGET = 48;
/**
 * A thumb's touch target, in client px: the `::before` the touch
 * presentation draws around the thumb, or null where it draws none.
 */
async function touchTarget(thumb: Locator) {
  return thumb.evaluate(element => {
    const before = getComputedStyle(element, '::before');
    if (before.content === 'none' || before.content === 'normal') {
      return null;
    }
    // An absolute `::before` sits in the thumb's padding box.
    const box = element.getBoundingClientRect();
    const left = box.left + element.clientLeft;
    const top = box.top + element.clientTop;
    const px = (value: string) => parseFloat(value) || 0;
    return {
      left: left + px(before.left),
      top: top + px(before.top),
      right: left + element.clientWidth - px(before.right),
      bottom: top + element.clientHeight - px(before.bottom),
    };
  });
}

/**
 * A point on a whole CSS pixel. WebKit reports touch and pointer coordinates
 * in whole pixels (a tap scripted at x 50.42 arrives at 50; Chromium keeps
 * the fraction). So a case that computes a value from where a tap lands taps
 * a whole pixel, the coordinate every engine delivers as scripted.
 */
const onPixel = (point: {x: number; y: number}) => ({
  x: Math.round(point.x),
  y: Math.round(point.y),
});

interface Opened {
  driver: TouchDriver;
  thumb: Locator;
  control: Locator;
  /** The thumb's center, client px. */
  center: () => Promise<Point>;
  value: () => Promise<number>;
  /** The control's layout length along the travel, px. */
  length: number;
}

async function openSlider(
  page: Page,
  storyId: string,
  {
    name,
    args,
    direction,
  }: {
    name?: string;
    args?: Readonly<Record<string, string>>;
    direction?: 'rtl';
  } = {},
): Promise<Opened> {
  if (direction == null) {
    await openStory(page, storybook(), storyId, args);
  } else {
    await page.goto(
      `${storybook()}/iframe.html?id=${storyId}&viewMode=story&globals=direction:${direction}`,
    );
    await page.locator('#storybook-root > *').first().waitFor();
    await frames(page, 2);
  }
  const driver = await touchDriver(page);
  const thumb =
    name == null
      ? page.getByRole('slider').first()
      : page.getByRole('slider', {name});
  await expect(thumb).toBeVisible();
  // The touch presentation draws the touch targets after hydration, under a
  // coarse primary pointer (this phone emulation), on every engine.
  await expect.poll(async () => touchTarget(thumb)).not.toBeNull();
  const control = thumb.locator(
    'xpath=ancestor::*[contains(@class, "astryx-slider-control")][1]',
  );
  // The touch presentation is live once its controller has attached. The
  // gesture host then marks the track with the touch-action its tap needs.
  // Any author rule outranks that rule, and the marked value is in force.
  await expect
    .poll(async () =>
      control.evaluate(element =>
        element.getAttribute('data-astryx-touch-action'),
      ),
    )
    .toBe('manipulation');
  expect(
    await control.evaluate(element => getComputedStyle(element).touchAction),
  ).toBe('manipulation');
  const length = await control.evaluate(element =>
    parseFloat(getComputedStyle(element).width),
  );
  const center = async () => {
    const box = await thumb.boundingBox();
    if (box == null) {
      throw new Error('no thumb box');
    }
    return {x: box.x + box.width / 2, y: box.y + box.height / 2};
  };
  const value = async () => Number(await thumb.getAttribute('aria-valuenow'));
  return {driver, thumb, control, center, value, length};
}

interface Leg {
  /** Where the finger goes. */
  readonly to: Point;
  readonly durationMs: number;
  /** Rest after the leg (no events), ms. */
  readonly restMs?: number;
}

/**
 * One finger: press at `from`, move through `legs` at `hz`, lift. Returns
 * the script and the event index of each leg's last move (every frame
 * moves. So event indices follow frame indices. The press is event 0).
 */
function legs(
  from: Point,
  path: ReadonlyArray<Leg>,
  {hz = 60, liftAfterMs = 4}: {hz?: number; liftAfterMs?: number} = {},
): {script: TouchScript; ends: number[]} {
  const moves: {t: number; fingers: {id: number; x: number; y: number}[]}[] = [
    {t: 0, fingers: [{id: 0, ...from}]},
  ];
  const ends: number[] = [];
  let t = 0;
  let at = from;
  for (const leg of path) {
    const steps = Math.max(1, Math.round((leg.durationMs * hz) / 1000));
    for (let i = 1; i <= steps; i++) {
      moves.push({
        t: t + (leg.durationMs * i) / steps,
        fingers: [
          {
            id: 0,
            x: at.x + ((leg.to.x - at.x) * i) / steps,
            y: at.y + ((leg.to.y - at.y) * i) / steps,
          },
        ],
      });
    }
    ends.push(moves.length - 1);
    t += leg.durationMs + (leg.restMs ?? 0);
    at = leg.to;
  }
  moves.push({t: t + liftAfterMs, fingers: []});
  return {script: moves, ends};
}

/** Plays `script`, reading `read()` two frames after each event in `at`. */
async function playReading<T>(
  page: Page,
  driver: TouchDriver,
  script: TouchScript,
  at: ReadonlyArray<number>,
  read: () => Promise<T>,
): Promise<T[]> {
  const readings: T[] = [];
  await driver.play(script, {
    onEvent: async (_step, index) => {
      if (at.includes(index)) {
        await frames(page, 2);
        readings.push(await read());
      }
    },
  });
  return readings;
}

/**
 * The fill's mover. Only a coast animates it (a drag writes its styles and
 * the lift scales the thumb alone). So an animation inside it is the coast.
 */
function fillOf(thumb: Locator): Locator {
  return thumb
    .locator('xpath=ancestor::*[contains(@class, "astryx-slider-control")][1]')
    .locator('[style*="--_slider-fill-end"]')
    .first();
}

/**
 * UISlider's release coast, critically damped: where the thumb is `t` s after
 * the lift, starting at `from` with `velocity` toward `to` (px, px/s).
 */
function coastAt(from: number, to: number, velocity: number, t: number) {
  const omega = (2 * Math.PI) / UISLIDER.release.response;
  const offset = from - to;
  return to + (offset + (velocity + omega * offset) * t) * Math.exp(-omega * t);
}

/** WWDC18's projection, px of finger travel. */
function project(velocity: number): number {
  return (
    ((velocity / 1000) * UISLIDER.projectionRate) /
    (1 - UISLIDER.projectionRate)
  );
}

/** The value UISlider reports for `travel` px of finger past touch-down. */
function trackedValue(
  start: number,
  travel: number,
  length: number,
  range = 100,
): number {
  const translation = Math.max(0, Math.abs(travel) - UISLIDER.hysteresis);
  return start + (Math.sign(travel) * translation * range) / length;
}

test('a tap on the track sets the value when it lifts and the thumb springs there; the thumb takes a finger through a target larger than it', async ({
  page,
}) => {
  const {driver, thumb, center, value, length} = await openSlider(
    page,
    'core-slider--default',
  );
  const start = await value();
  const at = await center();
  const hit = await touchTarget(thumb);
  expect(hit == null ? 0 : hit.right - hit.left).toBeCloseTo(
    UISLIDER.hitTarget,
    0,
  );
  expect(hit == null ? 0 : hit.bottom - hit.top).toBeCloseTo(
    UISLIDER.hitTarget,
    0,
  );
  // 20 px beside the thumb's center, inside its 48 px touch target: the
  // thumb takes the finger and lifts, and a tap there changes nothing.
  const beside = {x: at.x + 20, y: at.y};
  const [scale] = await playReading(
    page,
    driver,
    tap(beside, {holdMs: 500}),
    [0],
    async () => {
      await page.waitForTimeout(400);
      return thumb.evaluate(element => getComputedStyle(element).scale);
    },
  );
  expect(Number(scale)).toBeCloseTo(UISLIDER.liftScale, 2);
  await frames(page, 4);
  expect(await value()).toBe(start);
  // Far on the track: nothing while the finger is down. On the lift the
  // value is the tap's, and the thumb springs there. A drag is not the only
  // pointer way (WCAG 2.5.7), though UISlider itself ignores the tap.
  const far = onPixel({x: at.x + length * 0.3, y: at.y});
  const [held] = await playReading(
    page,
    driver,
    tap(far, {holdMs: 300}),
    [0],
    async () => {
      await page.waitForTimeout(150);
      return value();
    },
  );
  expect(held).toBe(start);
  const box = await thumb
    .locator('xpath=ancestor::*[contains(@class, "astryx-slider-control")][1]')
    .boundingBox();
  if (box == null) {
    throw new Error('no control');
  }
  const expected = Math.round(
    ((far.x - box.x - THUMB / 2) / (box.width - THUMB)) * 100,
  );
  // Mid-spring the thumb is on its way (a compositor animation), not there.
  await page.waitForTimeout(60);
  expect(
    await thumb.evaluate(element => element.getAnimations().length),
  ).toBeGreaterThan(0);
  await waitForRest(thumb);
  await frames(page, 4);
  expect(await value()).toBe(expected);
});

test('the value follows the pan’s travel over the track length, past the 10 px hysteresis', async ({
  page,
}, testInfo) => {
  const {driver, center, value, length} = await openSlider(
    page,
    'core-slider--default',
  );
  const start = await value();
  const at = await center();
  const travels = [6, 10, 30, 60, 90];
  let previous = 0;
  const path: Leg[] = travels.map(travel => {
    const leg = {
      to: {x: at.x + travel, y: at.y},
      durationMs: Math.max(17, (travel - previous) * 8),
      restMs: 120,
    };
    previous = travel;
    return leg;
  });
  const {script, ends} = legs(at, path);
  const values = await playReading(page, driver, script, ends, value);
  const readings = travels.map((travel, i) => ({
    travel,
    value: values[i],
    expected: Math.round(trackedValue(start, travel, length)),
  }));
  await page.waitForTimeout(800);
  await writeEvidence(
    'tracking/slider-pan-travel',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {length, readings},
        null,
        1,
      ),
    },
    testInfo,
  );
  for (const reading of readings) {
    expect(reading.value, JSON.stringify(reading)).toBe(reading.expected);
  }
});

test('past an end the value waits for the finger to come back', async ({
  page,
}) => {
  const {driver, center, value, length} = await openSlider(
    page,
    'core-slider--default',
  );
  const start = await value();
  const at = await center();
  // To the max end and 60 px past it, then 40 px back: still at the max.
  const toEnd = ((100 - start) / 100) * length + UISLIDER.hysteresis;
  const past = {x: at.x + toEnd + 60, y: at.y};
  const back = {x: past.x - 40, y: at.y};
  const {script, ends} = legs(at, [
    {to: past, durationMs: 500, restMs: 100},
    {to: back, durationMs: 300, restMs: 200},
  ]);
  const values = await playReading(page, driver, script, ends, value);
  expect(values).toEqual([100, 100]);
});

test('a release coasts on UIKit’s spring to 0.4 of the momentum projection, then onChangeEnd reports', async ({
  page,
}, testInfo) => {
  const {driver, thumb, center, value, length} = await openSlider(
    page,
    'core-slider--touch-tracking',
    {name: 'Brightness'},
  );
  // The release velocity is the script's 300 px/s only where the page gets
  // the script's timestamps. Injected touches carry their real dispatch
  // times. A scheduling gap of 40 ms or more before the lift then reads as a
  // resting finger. The release filter's stillness reset rightly starts no
  // coast then.
  test.skip(
    !driver.scriptedTimestamps,
    'the release velocity needs the scripted timestamps (README: engine limits)',
  );
  const at = await center();
  const velocity = 300;
  // A steady 300 px/s for 120 ms (36 px), lifted while moving.
  const script = flick(at, {velocity: {x: velocity, y: 0}, durationMs: 120});
  const lastMove = script.length - 2;
  const [liftValue] = await playReading(
    page,
    driver,
    script,
    [lastMove],
    value,
  );
  // The thumb runs two animations from the lift: the drop's scale and the
  // coast's translate. The coast starts a few ms later, 2–3 ms here and more
  // under load. The harness counts sample times from the earliest held
  // start, so the samples are taken at the coast's own times: its offset
  // plus 0, 20, …
  const coast = (await holdAnimations(page, thumb)).find(held =>
    held.keyframes.some(keyframe => 'translate' in keyframe),
  );
  expect(coast, 'the coast plays on the compositor').toBeDefined();
  const coastOffset = coast?.offsetMs ?? 0;
  const times = Array.from({length: 31}, (_, i) => coastOffset + i * 20);
  const samples = await sampleCurve(thumb, times);
  await releaseAnimations(page);
  await waitForRest(thumb);
  await frames(page, 4);
  const range = 100;
  const travel = length - THUMB;
  const pxPerValue = travel / range;
  const finalValue = await value();
  // The release velocity is exactly the script's 300 px/s, and the target
  // follows from UIKit's projection.
  const target = Math.round(
    liftValue + (UISLIDER.projectionShare * project(velocity) * range) / length,
  );
  const fromPx = samples[0].transform.translateX;
  const toPx = fromPx + (target - liftValue) * pxPerValue;
  // The finger velocity in the thumb's px per second: travel ÷ length of it.
  const v0 =
    toPx === fromPx
      ? 0
      : ((velocity / length) * range * pxPerValue) / (toPx - fromPx);
  const comparison = compareCurve(
    samples.map(sample => ({
      t: sample.t - coastOffset,
      value: sample.transform.translateX,
    })),
    ms =>
      fromPx +
      (toPx - fromPx) *
        springStep(
          {
            response: UISLIDER.release.response,
            dampingFraction: 1,
            initialVelocity: v0,
          },
          ms,
        ),
    // Snapping the target to a whole value moves the end by up to half a
    // step.
    0.75,
  );
  await writeEvidence(
    'curves/slider-coast',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {
          velocity,
          length,
          liftValue,
          target,
          finalValue,
          comparison,
        },
        null,
        1,
      ),
    },
    testInfo,
  );
  expect(finalValue).toBe(target);
  expect(finalValue).toBeGreaterThan(liftValue);
  expect(
    comparison.maxError,
    JSON.stringify(comparison.worst),
  ).toBeLessThanOrEqual(0.75);
  await expect(page.getByTestId('slider-change-end')).toHaveText(
    `Brightness ${target}`,
  );
  // Handed back: no inline translate left, the thumb where the CSS puts it.
  expect(await thumb.evaluate(element => element.style.translate)).toBe('');
});

test('the lifted thumb grows around its own center, as UISlider’s lens does', async ({
  page,
}) => {
  // UIKit's lens grows from 24 to 39 pt with its center fixed on the track
  // (UIKit lab, iOS 26.2 simulator). The thumb's centering must not scale
  // with the lift.
  for (const {storyId, name, args} of [
    {storyId: 'core-slider--touch-tracking', name: 'Brightness', args: {}},
    {
      storyId: 'core-slider--vertical-orientation',
      name: undefined,
      args: {valueDisplay: 'none'},
    },
  ]) {
    const {driver, thumb, center} = await openSlider(page, storyId, {
      name,
      args,
    });
    const rest = await thumb.boundingBox();
    if (rest == null) {
      throw new Error('no thumb');
    }
    const at = await center();
    const box = async () => {
      const b = await thumb.boundingBox();
      if (b == null) {
        throw new Error('no thumb');
      }
      return b;
    };
    const [midLift, lifted] = await playReading(
      page,
      driver,
      tap(at, {holdMs: 700}),
      [0],
      async () => {
        await page.waitForTimeout(60);
        const mid = await box();
        await page.waitForTimeout(450);
        return [mid, await box()] as const;
      },
    ).then(readings => readings[0]);
    for (const [label, b] of [
      ['mid-lift', midLift],
      ['lifted', lifted],
    ] as const) {
      expect(
        b.width,
        `${storyId} ${label}: the thumb is lifted`,
      ).toBeGreaterThan(rest.width + 2);
      expect(
        Math.abs(b.x + b.width / 2 - (rest.x + rest.width / 2)),
        `${storyId} ${label}: x center`,
      ).toBeLessThanOrEqual(0.5);
      expect(
        Math.abs(b.y + b.height / 2 - (rest.y + rest.height / 2)),
        `${storyId} ${label}: y center`,
      ).toBeLessThanOrEqual(0.5);
    }
    await page.waitForTimeout(700);
  }
});

test('a slow release does not coast: the value stays where the finger left it', async ({
  page,
}) => {
  const {driver, thumb, center, value} = await openSlider(
    page,
    'core-slider--touch-tracking',
    {name: 'Brightness'},
  );
  const at = await center();
  // Past the 10 px threshold, then the last moves at 6 px/s. The projection,
  // 0.4 × 0.0996 s × 6 px/s or about 0.24 px, is under half a step.
  const quick = {x: at.x + 40, y: at.y};
  const {script, ends} = legs(
    at,
    [
      {to: quick, durationMs: 200},
      {to: {x: quick.x + 1.2, y: at.y}, durationMs: 200},
    ],
    {hz: 60},
  );
  const [atLift] = await playReading(page, driver, script, [ends[1]], value);
  await page.waitForTimeout(600);
  expect(await value()).toBe(atLift);
  // No coast ran: no translate animation, and the thumb is back on its CSS
  // position (the drop of its lift still runs on scale).
  expect(
    await thumb.evaluate(
      element =>
        element
          .getAnimations()
          .filter(animation =>
            (animation.effect as KeyframeEffect | null)
              ?.getKeyframes()
              .some(frame => 'translate' in frame),
          ).length,
    ),
  ).toBe(0);
  expect(await thumb.evaluate(element => element.style.translate)).toBe('');
  await expect(page.getByTestId('slider-change-end')).toHaveText(
    `Brightness ${atLift}`,
  );
});

test('a drag that rests 40 ms before the lift does not coast: the release filter’s stillness reset (AST-100 FR2)', async ({
  page,
}) => {
  const {driver, center, value} = await openSlider(
    page,
    'core-slider--touch-tracking',
    {name: 'Brightness'},
  );
  const at = await center();
  // 60 px at 300 px/s, then 300 ms without a move. UIKit keeps the last
  // motion through a silent rest (a 312 ms rest still coasted 12.56 pt).
  // The one release filter every gesture shares reads zero once the finger
  // has been still for its stillness interval (40 ms, AST-100 FR2). So the
  // value stays where the finger left it.
  const {script, ends} = legs(
    at,
    [{to: {x: at.x + 60, y: at.y}, durationMs: 200, restMs: 300}],
    {hz: 60},
  );
  const [atLift] = await playReading(page, driver, script, [ends[0]], value);
  await page.waitForTimeout(900);
  expect(await value()).toBe(atLift);
});

test('Reduce Motion: no lift; a release keeps coasting and a track tap sets the value at once, with no cross-fade (design:reduced-motion DR2)', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  const {driver, thumb, center} = await openSlider(
    page,
    'core-slider--touch-tracking',
    {name: 'Brightness'},
  );
  /** The thumb's opacity, scale, position and value each frame for `ms`. */
  const watch = async (ms: number) =>
    thumb.evaluate(async (element, duration) => {
      const samples: {
        t: number;
        opacity: number;
        scale: number;
        x: number;
        value: number;
      }[] = [];
      const start = performance.now();
      while (performance.now() - start < duration) {
        await new Promise(requestAnimationFrame);
        const style = getComputedStyle(element);
        samples.push({
          t: performance.now() - start,
          opacity: Number(style.opacity),
          scale: style.scale === 'none' ? 1 : Number(style.scale),
          x: element.getBoundingClientRect().x,
          value: Number(element.getAttribute('aria-valuenow')),
        });
      }
      return samples;
    }, ms);
  type Sample = Awaited<ReturnType<typeof watch>>[number];
  const opacities = (samples: ReadonlyArray<Sample>) =>
    samples.map(sample => sample.opacity);
  // A held thumb keeps its size: the press shows in its paint alone (DR1).
  const at = await center();
  const [held] = await playReading(
    page,
    driver,
    tap(at, {holdMs: 400}),
    [0],
    async () => watch(250),
  );
  expect(Math.max(...held.map(sample => sample.scale))).toBe(1);
  await frames(page, 6);
  // A flick's release: the momentum that continues the throw is direct
  // movement. So the thumb keeps travelling frame by frame past the lift's
  // value, at full opacity (DR2).
  const from = await center();
  const script = flick(from, {velocity: {x: 400, y: 0}, durationMs: 100});
  const [release] = await playReading(
    page,
    driver,
    script,
    [script.length - 1],
    async () => watch(500),
  );
  expect(Math.min(...opacities(release))).toBe(1);
  expect(Math.max(...release.map(sample => sample.scale))).toBe(1);
  const positions = new Set(release.map(sample => Math.round(sample.x * 4)));
  expect(positions.size).toBeGreaterThan(4);
  expect(release[release.length - 1].value).toBeGreaterThan(release[0].value);
  await frames(page, 6);
  // A tap on the track: an in-place value change. So the thumb lands on the
  // tap's value at once, at full opacity, with no travel between (DR2).
  const control = thumb.locator(
    'xpath=ancestor::*[contains(@class, "astryx-slider-control")][1]',
  );
  const box = await control.boundingBox();
  if (box == null) {
    throw new Error('no control');
  }
  const target = onPixel({
    x: box.x + box.width * 0.1,
    y: box.y + box.height / 2,
  });
  const expected = Math.round(
    ((target.x - box.x - THUMB / 2) / (box.width - THUMB)) * 100,
  );
  const tapScript = tap(target);
  const [tapped] = await playReading(
    page,
    driver,
    tapScript,
    [tapScript.length - 1],
    async () => watch(320),
  );
  expect(Math.min(...opacities(tapped))).toBe(1);
  // At once: within two frames of the lift the value is the tap's. The thumb
  // never stands anywhere between its old place and its new one.
  expect(tapped[1].value).toBe(expected);
  const landed = tapped[tapped.length - 1].x;
  expect(
    tapped.slice(1).every(sample => Math.abs(sample.x - landed) < 0.5),
  ).toBe(true);
});

test('range thumbs closer than their touch targets split the gap: neither thumb’s hit area takes a touch on the other thumb (spec:AST-094 FR42)', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-slider--touch-tracking');
  // The touch driver emulates a touch screen: the touch targets render under
  // its coarse pointer.
  await touchDriver(page);
  const lower = page.getByRole('slider', {name: 'Minimum value'});
  const upper = page.getByRole('slider', {name: 'Maximum value'});
  await expect.poll(async () => touchTarget(lower)).not.toBeNull();
  await expect.poll(async () => touchTarget(upper)).not.toBeNull();
  const control = lower.locator(
    'xpath=ancestor::*[contains(@class, "astryx-slider-control")][1]',
  );
  const length = await control.evaluate(element =>
    parseFloat(getComputedStyle(element).width),
  );
  // One step of the 0–100 range, in px along the travel.
  const pxPerStep = (length - THUMB) / 100;
  /** Puts the upper thumb `steps` above the lower one, with the keyboard. */
  const spread = async (steps: number) => {
    await upper.focus();
    await page.keyboard.press('Home');
    for (let i = 0; i < steps; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await frames(page, 2);
  };
  const rectOf = async (locator: Locator) => {
    const box = await locator.boundingBox();
    if (box == null) {
      throw new Error('no box');
    }
    return {
      left: box.x,
      right: box.x + box.width,
      top: box.y,
      bottom: box.y + box.height,
    };
  };
  const targetOf = async (locator: Locator) => {
    const target = await touchTarget(locator);
    if (target == null) {
      throw new Error('no touch target');
    }
    return target;
  };
  const boxes = async () => ({
    lower: await rectOf(lower),
    upper: await rectOf(upper),
    lowerHit: await targetOf(lower),
    upperHit: await targetOf(upper),
  });
  /** Which thumb a touch at (x, y) lands on. */
  const thumbAt = async (x: number, y: number) =>
    page.evaluate(
      ([px, py]) => {
        const hit = document.elementFromPoint(px, py);
        const thumb = hit?.closest('[role="slider"]');
        return thumb == null
          ? null
          : Array.from(document.querySelectorAll('[role="slider"]')).indexOf(
              thumb,
            );
      },
      [x, y] as const,
    );
  const indexOfLower = await lower.evaluate(element =>
    Array.from(document.querySelectorAll('[role="slider"]')).indexOf(element),
  );
  // Present and painted first: both thumbs and both touch targets have
  // boxes. Where the thumbs have room, with centers at least a target apart,
  // each target is UISlider's full 48 px square. So the narrowed cases below
  // measure targets that exist.
  await expect(lower).toBeVisible();
  await expect(upper).toBeVisible();
  await spread(Math.round(80 / pxPerStep));
  {
    const roomy = await boxes();
    const lowerCenter = (roomy.lower.left + roomy.lower.right) / 2;
    const upperCenter = (roomy.upper.left + roomy.upper.right) / 2;
    expect(upperCenter - lowerCenter).toBeGreaterThanOrEqual(HIT_TARGET);
    for (const [thumbBox, hitBox] of [
      [roomy.lower, roomy.lowerHit],
      [roomy.upper, roomy.upperHit],
    ] as const) {
      expect(
        Math.abs(thumbBox.right - thumbBox.left - THUMB),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(hitBox.right - hitBox.left - HIT_TARGET),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(hitBox.bottom - hitBox.top - HIT_TARGET),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(
          (hitBox.left + hitBox.right) / 2 -
            (thumbBox.left + thumbBox.right) / 2,
        ),
      ).toBeLessThanOrEqual(1);
    }
  }
  // Overlapping thumbs (centers 14 px apart, under the 20 px thumb): a
  // finger on the lower thumb's exposed side takes the lower thumb.
  await spread(Math.max(1, Math.round(14 / pxPerStep)));
  let b = await boxes();
  const y = (b.lower.top + b.lower.bottom) / 2;
  expect(await thumbAt(b.lower.left + 3, y)).toBe(indexOfLower);
  // Thumbs 30 px apart (a 10 px gap, under the targets' 28 px of growth):
  // each hit area stops at half the gap. So the two meet in the middle.
  await spread(Math.max(1, Math.round(30 / pxPerStep)));
  b = await boxes();
  const middle = (b.lower.right + b.upper.left) / 2;
  expect(b.lowerHit.right).toBeLessThanOrEqual(middle + 0.5);
  expect(b.upperHit.left).toBeGreaterThanOrEqual(middle - 0.5);
  expect(b.lowerHit.right).toBeLessThanOrEqual(b.upper.left + 0.5);
  expect(b.upperHit.left).toBeGreaterThanOrEqual(b.lower.right - 0.5);
  expect(await thumbAt(middle - 2, y)).toBe(indexOfLower);
  expect(await thumbAt(middle + 2, y)).toBe(indexOfLower + 1);
});

test('a finger landing on a coasting thumb stops it where it is', async ({
  page,
}) => {
  // A scale of a thousand values: a value is a third of a px. So the coast
  // stays more than a value from its end for about 450 ms.
  const range = 1000;
  const {driver, thumb, control, center, value} = await openSlider(
    page,
    'core-slider--touch-tracking',
    {name: 'Brightness', args: {max: String(range)}},
  );
  test.skip(
    !driver.scriptedTimestamps,
    'the coast target needs the scripted release velocity (README: engine limits)',
  );
  expect(await thumb.getAttribute('aria-valuemin')).toBe('0');
  expect(await thumb.getAttribute('aria-valuemax')).toBe(String(range));
  // From the minimum, a fast throw: a coast over about 40% of the track,
  // never clamped.
  await thumb.focus();
  await page.keyboard.press('Home');
  await expect.poll(value).toBe(0);
  // The track's length as the slider measures it when the throw begins: the
  // story's value text beside the track takes width with each digit. So the
  // track is longer at 0 than it was at the story's first value.
  const length = await control.evaluate(element =>
    parseFloat(getComputedStyle(element).width),
  );
  const start = await value();
  const at = await center();
  const velocity = 1500;
  const throwScript = flick(at, {
    velocity: {x: velocity, y: 0},
    durationMs: 60,
  });
  // Where to aim: the coast this throw makes on the track as it is now.
  const aimLift = Math.round(
    trackedValue(start, (velocity * 60) / 1000, length, range),
  );
  const aimTarget = Math.round(
    aimLift + (UISLIDER.projectionShare * project(velocity) * range) / length,
  );
  const thumbPxPerValue = (length - THUMB) / range;
  const coastValue = (seconds: number) =>
    coastAt(
      aimLift * thumbPxPerValue,
      aimTarget * thumbPxPerValue,
      (velocity * (length - THUMB)) / length,
      seconds,
    ) / thumbPxPerValue;
  // The page reads its own moments, just before the slider handles them: a
  // capture listener on the window runs first. At the lift it reads the
  // value and the track's length. At the catch it reads whether the catch
  // landed on the thumb and whether the coast still ran. It also reads the
  // thumb's translate and box in the frame the catch lands in, and the
  // track's length then. The slider reads that frame in the same task.
  await thumb.evaluate(element => {
    type Marks = {
      liftAt?: number;
      liftValue?: number;
      liftLength?: number;
      catchAt?: number;
      coasting?: boolean;
      presentedPx?: number;
      drawnCenter?: number;
      trackLength?: number;
      onThumb?: boolean;
    };
    const marks: Marks = {};
    (window as unknown as {__sliderCatch: Marks}).__sliderCatch = marks;
    const track = element.closest('.astryx-slider-control');
    const fill = track?.querySelector('[style*="--_slider-fill-end"]');
    let presses = 0;
    window.addEventListener(
      'pointerdown',
      event => {
        presses += 1;
        if (presses === 2) {
          marks.catchAt = performance.now();
          marks.presentedPx = Math.abs(
            parseFloat(getComputedStyle(element).translate) || 0,
          );
          const drawn = element.getBoundingClientRect();
          marks.drawnCenter = drawn.left + drawn.width / 2;
          marks.trackLength =
            track == null ? 0 : parseFloat(getComputedStyle(track).width);
          marks.onThumb = element.contains(event.target as Node);
          marks.coasting =
            fill
              ?.getAnimations({subtree: true})
              .some(animation => animation.playState === 'running') === true;
        }
      },
      {capture: true, passive: true},
    );
    window.addEventListener(
      'pointerup',
      () => {
        if (marks.liftAt != null) {
          return;
        }
        marks.liftAt = performance.now();
        marks.liftValue = Number(element.getAttribute('aria-valuenow'));
        marks.liftLength =
          track == null ? 0 : parseFloat(getComputedStyle(track).width);
      },
      {capture: true, passive: true},
    );
  });
  // A finger lands 220 ms after the throw's lift has gone out, where the
  // coast has carried the thumb by then. Its own play starts once the
  // throw's has dispatched the lift. So a dispatch that stalls before the
  // lift delays the catch with it rather than sending it right behind. There
  // the thumb is within its 48 px target of that point from about 120 ms
  // after the lift to the coast's end. So a catch the page handles up to
  // about 100 ms early or 240 ms late still lands on it while the coast
  // moves.
  const catchMs = 220;
  const aimX = at.x + (coastValue(catchMs / 1000) - start) * thumbPxPerValue;
  await driver.play(throwScript);
  await page.waitForTimeout(catchMs);
  await driver.play(tap({x: aimX, y: at.y}, {holdMs: 200}));
  await page.waitForTimeout(700);
  const marks = await page.evaluate(
    () =>
      (
        window as unknown as {
          __sliderCatch: {
            liftAt?: number;
            liftValue?: number;
            liftLength?: number;
            catchAt?: number;
            coasting?: boolean;
            presentedPx?: number;
            drawnCenter?: number;
            trackLength?: number;
            onThumb?: boolean;
          };
        }
      ).__sliderCatch,
  );
  const {liftAt, liftValue, liftLength} = marks;
  const {catchAt, presentedPx, drawnCenter, trackLength} = marks;
  if (
    liftAt == null ||
    liftValue == null ||
    liftLength == null ||
    catchAt == null ||
    presentedPx == null ||
    drawnCenter == null ||
    trackLength == null
  ) {
    throw new Error(
      `the page saw no lift or no catch: ${JSON.stringify(marks)}`,
    );
  }
  // The value the catch's frame draws, on the track as it is then. The
  // story's value text took a digit during the coast and narrowed the
  // track, and the coast follows the track's own length.
  const presented = presentedPx / ((trackLength - THUMB) / range);
  // The coast's end, as the slider computes it at the lift: the value text
  // took digits during the drag. So the track was shorter than at the start.
  const target = Math.round(
    liftValue +
      (UISLIDER.projectionShare * project(velocity) * range) / liftLength,
  );
  expect(target).toBeLessThan(range);
  // The catch landed on the thumb while the coast moved: a value or more past
  // the lift and short of the coast's end. Otherwise this runner handed the
  // page the catch too early or too late, and a stop could not be told from
  // the coast.
  expect(
    marks.onThumb === true &&
      marks.coasting === true &&
      presented >= liftValue + 1 &&
      presented <= target - 1,
    `the page handled the catch ${(catchAt - liftAt).toFixed(0)} ms after the lift (${marks.onThumb === true ? 'on' : 'off'} the thumb, ${marks.coasting === true ? `the coast at ${presented.toFixed(2)} of ${liftValue} to ${target}` : 'no coast running'}): outside its moving window, the runner's timing, not the stop`,
  ).toBe(true);
  // The stop is where the catch's frame presents the thumb, to the nearest
  // value. It never jumps to a value the coast's model read at another
  // moment.
  const caught = await value();
  expect(
    Math.abs(caught - presented),
    `stopped at ${caught}, the catch's frame presents ${presented.toFixed(2)}`,
  ).toBeLessThanOrEqual(0.5);
  // And the thumb rests where it was drawn when the finger landed, to half a
  // value step. The stop and the stylesheet's position follow the track's
  // own length.
  const rest = await thumb.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const track = element
      .closest('.astryx-slider-control')
      ?.getBoundingClientRect();
    return {
      center: rect.left + rect.width / 2,
      length: track?.width ?? 0,
    };
  });
  expect(
    Math.abs(rest.center - drawnCenter),
    `rests at ${rest.center.toFixed(2)} px, drawn at ${drawnCenter.toFixed(2)} px when caught`,
  ).toBeLessThanOrEqual((rest.length - THUMB) / range / 2);
  // The interrupted coast reports where it stopped, then the catching touch
  // ends there too, and nothing moves on (after the minimum Home set).
  await expect(page.getByTestId('slider-change-end')).toHaveText(
    `Brightness 0, Brightness ${caught}, Brightness ${caught}`,
  );
  expect(await thumb.evaluate(element => element.style.translate)).toBe('');
});

test('a finger held on a thumb or on the track starts no selection: the thumb’s pan refuses one until the lift, and the track’s own style keeps it unselectable', async ({
  page,
}) => {
  const {driver, thumb, center} = await openSlider(
    page,
    'core-slider--touch-tracking',
    {name: 'Brightness'},
  );
  const control = thumb.locator(
    'xpath=ancestor::*[contains(@class, "astryx-slider-control")][1]',
  );
  // The thumb's pan brings the gesture host's selection lock. Where iOS
  // WebKit's touch-callout query holds, it writes `user-select: none` inline
  // on the held element. An engine keeps the standard or the prefixed form
  // in its CSSOM. Elsewhere it cancels the `selectstart` a long press fires,
  // with no style write.
  const refusesSelection = async () =>
    thumb.evaluate(node => {
      if (CSS.supports('(-webkit-touch-callout: none)')) {
        const {style} = node as HTMLElement;
        return (
          (style.getPropertyValue('user-select') ||
            style.getPropertyValue('-webkit-user-select')) === 'none'
        );
      }
      const event = new Event('selectstart', {bubbles: true, cancelable: true});
      node.dispatchEvent(event);
      return event.defaultPrevented;
    });
  const at = await center();
  const [onThumb] = await playReading(
    page,
    driver,
    tap(at, {holdMs: 600}),
    [0],
    async () => {
      await page.waitForTimeout(300);
      return refusesSelection();
    },
  );
  expect(onThumb).toBe(true);
  await frames(page, 4);
  expect(await refusesSelection()).toBe(false);
  const box = await control.boundingBox();
  if (box == null) {
    throw new Error('no control');
  }
  // A finger held on the track does nothing. So the track's tap takes no
  // lock (spec:AST-094 FR41). The control's own style keeps its text
  // unselectable, and the hold selects nothing.
  const onTrack = {x: box.x + box.width * 0.9, y: box.y + box.height / 2};
  const [held] = await playReading(
    page,
    driver,
    tap(onTrack, {holdMs: 600}),
    [0],
    async () => {
      await page.waitForTimeout(300);
      return control.evaluate(node => {
        const style = getComputedStyle(node);
        return {
          inline: (node as HTMLElement).style.getPropertyValue('user-select'),
          // WebKit applies only the prefixed property (it reads the
          // standard one back as `text`); Chromium reports both.
          computed:
            style.getPropertyValue('-webkit-user-select') ||
            style.getPropertyValue('user-select'),
          selected: String(getSelection() ?? ''),
        };
      });
    },
  );
  expect(held).toEqual({inline: '', computed: 'none', selected: ''});
});

test('a finger lifted outside the tracking bounds coasts back to the lift value', async ({
  page,
}) => {
  const {driver, center, value} = await openSlider(
    page,
    'core-slider--default',
  );
  const at = await center();
  // Drag right 40 px, then 150 px up (outside the 70 px tracking margin),
  // and lift while moving right at 400 px/s.
  const right = {x: at.x + 40, y: at.y};
  const up = {x: right.x, y: at.y - 150};
  const out = {x: up.x + 20, y: up.y};
  const {script, ends} = legs(
    at,
    [
      {to: right, durationMs: 300},
      {to: up, durationMs: 300, restMs: 100},
      {to: out, durationMs: 50},
    ],
    {hz: 120},
  );
  const [atLift] = await playReading(page, driver, script, [ends[2]], value);
  await page.waitForTimeout(900);
  // Outside the tracking bounds the release does not project: the value
  // settles where the finger left it.
  expect(await value()).toBe(atLift);
});

test('coincident range thumbs: the first movement picks the thumb that can follow it', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-slider--touch-tracking');
  const driver = await touchDriver(page);
  const low = page.getByRole('slider', {name: 'Minimum value'});
  const high = page.getByRole('slider', {name: 'Maximum value'});
  await expect.poll(async () => touchTarget(high)).not.toBeNull();
  expect(await low.getAttribute('aria-valuenow')).toBe(
    await high.getAttribute('aria-valuenow'),
  );
  const box = await high.boundingBox();
  if (box == null) {
    throw new Error('no thumb');
  }
  const at = {x: box.x + box.width / 2, y: box.y + box.height / 2};
  await driver.play(
    drag(at, {x: at.x - 60, y: at.y}, {durationMs: 400, hz: 60, restMs: 150}),
  );
  await page.waitForTimeout(800);
  expect(Number(await low.getAttribute('aria-valuenow'))).toBeLessThan(40);
  expect(await high.getAttribute('aria-valuenow')).toBe('40');
});

test('a vertical swipe from a thumb scrolls the list; a horizontal one drags it', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-slider--in-scrolling-list');
  const driver = await touchDriver(page);
  test.skip(
    !driver.drivesNativeGestures,
    'these touches cannot scroll natively in this engine (README: engine limits)',
  );
  const list = page.getByTestId('slider-list');
  const thumb = page.getByRole('slider', {name: 'Channel 2'});
  // Present and painted first: the swipe below must leave this thumb's value.
  await expect(thumb).toBeVisible();
  await expect.poll(async () => touchTarget(thumb)).not.toBeNull();
  const before = await thumb.getAttribute('aria-valuenow');
  const box = await thumb.boundingBox();
  if (box == null) {
    throw new Error('no thumb');
  }
  const at = {x: box.x + box.width / 2, y: box.y + box.height / 2};
  await driver.play(
    drag(at, {x: at.x, y: at.y - 120}, {durationMs: 200, hz: 60}),
  );
  await page.waitForTimeout(600);
  expect(await list.evaluate(element => element.scrollTop)).toBeGreaterThan(40);
  expect(await thumb.getAttribute('aria-valuenow')).toBe(before);
  // Let the list's own deceleration finish: a finger on a moving list
  // brakes it and the control does not track that touch. The list must come
  // to rest (two reads 100 ms apart agree). If it never does, the test fails
  // here instead of dragging on a moving list.
  await expect
    .poll(
      async () => {
        const first = await list.evaluate(element => element.scrollTop);
        await page.waitForTimeout(100);
        return (await list.evaluate(element => element.scrollTop)) === first;
      },
      {timeout: 4000, intervals: [0]},
    )
    .toBe(true);
  // Where the list rests: the horizontal drag below must not move it.
  const top = await list.evaluate(element => element.scrollTop);
  // A thumb in view after the scroll.
  const listBox = await list.boundingBox();
  const visible = page.getByRole('slider', {name: 'Channel 6'});
  await expect(visible).toBeVisible();
  const visibleBefore = await visible.getAttribute('aria-valuenow');
  const next = await visible.boundingBox();
  if (next == null || listBox == null) {
    throw new Error('no thumb');
  }
  expect(next.y).toBeGreaterThan(listBox.y);
  expect(next.y + next.height).toBeLessThan(listBox.y + listBox.height);
  const from = {x: next.x + next.width / 2, y: next.y + next.height / 2};
  await driver.play(
    drag(
      from,
      {x: from.x + 70, y: from.y},
      {durationMs: 300, hz: 60, restMs: 150},
    ),
  );
  await page.waitForTimeout(800);
  expect(await list.evaluate(element => element.scrollTop)).toBe(top);
  expect(Number(await visible.getAttribute('aria-valuenow'))).toBeGreaterThan(
    Number(visibleBefore),
  );
});

test('right to left: dragging toward the inline end raises the value', async ({
  page,
}) => {
  const {driver, center, value, length} = await openSlider(
    page,
    'core-slider--default',
    {direction: 'rtl'},
  );
  const start = await value();
  const at = await center();
  const {script, ends} = legs(at, [
    {to: {x: at.x - 60, y: at.y}, durationMs: 400, restMs: 150},
  ]);
  const [reached] = await playReading(page, driver, script, ends, value);
  expect(reached).toBe(Math.round(trackedValue(start, 60, length)));
});

test(
  'the coast keeps advancing every frame while the main thread is blocked',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    // A fast throw with room ahead: about 90 px of coast, never clamped.
    const {driver, thumb, center} = await openSlider(
      page,
      'core-slider--touch-tracking',
      {name: 'Brightness'},
    );
    test.skip(
      !driver.scriptedTimestamps,
      'WebKit stamps an injected touch when it arrives, so a stalled dispatch bunches the throw, and its cast moves in 2 px steps (README: engine limits)',
    );
    await markElement(thumb);
    // A compositor-only control in the same screencast: the coast is judged
    // against what this machine's compositor presented in the block.
    await startBusyControl(page);
    const cast = await startScreencast(page);
    const at = await center();
    // Block mid-flight, once the coast itself runs: the harness cannot judge
    // an animation that has not started. The page waits from before the
    // release, frame by frame, until the coast in the fill has run three
    // frames. Nothing else animates there, since the lift scales the thumb
    // alone. It blocks from that frame, so no round trip to the test sits
    // between the coast's start and the block.
    const blocking = blockMainThread(page, 400, {
      during: fillOf(thumb),
      minProgressMs: 48,
    });
    // A moderate iPhone flick, 900 px/s over 60 ms, with the script's own
    // timestamps.
    await driver.play(flick(at, {velocity: {x: 900, y: 0}, durationMs: 60}));
    const block = await blocking;
    await page.waitForTimeout(150);
    const castFrames = await cast.stop();
    const tracked = await trackMarker(page, castFrames);
    const control = await trackMarker(page, castFrames, {rgb: CONTROL_RGB});
    // Judged until 2 px from rest: two of the cast's 1 px position steps.
    const proof = busyWindowProof(tracked, block, {
      axis: 'x',
      settledWithin: 2,
      control,
    });
    await writeEvidence(
      'busy-main-thread/slider-coast',
      {
        [`${testInfo.project.name}.json`]: JSON.stringify(
          {
            block,
            proof,
            frames: tracked.map(f => ({
              t: +(f.t - block.from).toFixed(1),
              x: f.box?.x ?? null,
            })),
          },
          null,
          1,
        ),
      },
      testInfo,
    );
    // A cast is the screen's own frames: the harness applies no clip to it.
    const film = await castStoryboard(page, castFrames, {
      name: 'slider-coast-busy-main-thread',
      zero: block.from,
      from: block.from - 40,
      to: proof.judged.to + 40,
      columns: 8,
      cellScale: 0.5,
      data: t => ({x: tracked.find(f => f.t === t)?.box?.x ?? -1}),
    });
    await film.write(testInfo, {block, judged: proof.judged});
    testInfo.annotations.push({
      type: 'busy-main-thread',
      description: proof.summary,
    });
    expect(proof.verdict.failures, proof.summary).toEqual([]);
  },
);

test('every touch screen gets the same touch model, whatever its engine: touch targets, the lift, the travel and a tap that sets the value on its lift', async ({
  page,
}) => {
  const {driver, thumb, center, value, length} = await openSlider(
    page,
    'core-slider--touch-tracking',
    {name: 'Brightness'},
  );
  // Nothing here is iOS's engine (no -webkit-touch-callout, as on Android's
  // Chromium): the touch presentation keys on the coarse pointer alone.
  expect(
    await page.evaluate(() => CSS.supports('(-webkit-touch-callout: none)')),
  ).toBe(false);
  const control = thumb.locator(
    'xpath=ancestor::*[contains(@class, "astryx-slider-control")][1]',
  );
  // A held thumb lifts.
  const at = await center();
  const [scale] = await playReading(
    page,
    driver,
    tap(at, {holdMs: 500}),
    [0],
    async () => {
      await page.waitForTimeout(400);
      return thumb.evaluate(element => Number(getComputedStyle(element).scale));
    },
  );
  expect(scale).toBeCloseTo(UISLIDER.liftScale, 2);
  await waitForRest(thumb);
  // A drag moves the value by the travel past the threshold, not to the
  // finger.
  const start = await value();
  const from = await center();
  const script = drag(
    from,
    {x: from.x - 70, y: from.y},
    {durationMs: 500, hz: 60, restMs: 200},
  );
  const [dragged] = await playReading(
    page,
    driver,
    script,
    [script.length - 2],
    value,
  );
  expect(dragged).toBe(Math.round(trackedValue(start, -70, length)));
  await waitForRest(thumb);
  // A tap on the track sets the value when it lifts. (The control's width
  // follows the value text beside it. So it is read now.)
  const box = await control.boundingBox();
  if (box == null) {
    throw new Error('no control');
  }
  const target = onPixel({
    x: box.x + box.width * 0.85,
    y: box.y + box.height / 2,
  });
  const [held] = await playReading(
    page,
    driver,
    tap(target, {holdMs: 300}),
    [0],
    async () => {
      await page.waitForTimeout(150);
      return value();
    },
  );
  expect(held).toBe(await value());
  await waitForRest(thumb);
  await frames(page, 4);
  expect(await value()).toBe(
    Math.round(((target.x - box.x - THUMB / 2) / (box.width - THUMB)) * 100),
  );
});

test('a drag lays out nothing per move, and the coast neither lays out nor paints', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
  const {driver, thumb, center, value} = await openSlider(
    page,
    'core-slider--default',
    {
      args: {valueDisplay: 'none'},
    },
  );
  const at = await center();
  const before = await value();
  let moves = {from: 0, to: 0};
  let coast = {from: 0, to: 0};
  const {script, ends} = legs(
    at,
    [
      {to: {x: at.x + 90, y: at.y}, durationMs: 500},
      {to: {x: at.x + 110, y: at.y}, durationMs: 50},
    ],
    {hz: 60},
  );
  const trace = await traceRendering(page, async () => {
    const played = await driver.play(script);
    moves = {
      from: played[3].dispatchedAt,
      to: played[ends[0]].dispatchedAt,
    };
    const start = played[played.length - 1].dispatchedAt;
    await waitForRest(thumb);
    coast = {from: start, to: Date.now()};
  });
  // The drag moved the thumb, so "nothing laid out" measures a real drag.
  expect(await value()).toBeGreaterThan(before + 20);
  const duringMoves = countBetween(trace, moves.from, moves.to);
  expect(duringMoves.Layout ?? 0, JSON.stringify(duringMoves)).toBe(0);
  const duringCoast = countBetween(trace, coast.from + 80, coast.to - 120);
  expect(duringCoast.Layout ?? 0, JSON.stringify(duringCoast)).toBe(0);
  expect(duringCoast.Paint ?? 0, JSON.stringify(duringCoast)).toBe(0);
});
