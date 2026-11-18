// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SpinnerMotion.a11y.chromium.spec.ts
 * @input Built Spinner stories in real Chromium (CDP screencast and tracing)
 * @output Browser evidence that the ring turns on the compositor and keeps
 *   turning while a script runs, and a storyboard of one revolution
 * @position Chromium proof for Spinner's rotor
 *
 * SYNC: Keep the timings here equal to Spinner.tsx (`styles.rotor`).
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {
  animationStoryboard,
  blockMainThread,
  busyWindowProof,
  CONTROL_SIDE,
  parseTransform,
  startBusyControl,
  startScreencast,
  timeline,
  trackControl,
  traceRendering,
  type CastFrame,
  type TrackedFrame,
} from '@astryxdesign/interaction-harness';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

const BLOCK_MS = 700;
const DPR = 2;

test.use({viewport: {width: 402, height: 420}, deviceScaleFactor: DPR});

/** The four sizes, sm → xl, each with its rotor. */
async function openSizes(page: Page) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-spinner--sizes&viewMode=story`,
  );
  const spinners = page.locator('.astryx-spinner');
  await expect(spinners).toHaveCount(4);
  // Every rotor is running and has been pinned to the timeline origin.
  await page.waitForFunction(() => {
    const animations = document.getAnimations();
    return (
      animations.length >= 4 &&
      animations.every(a => a.playState === 'running' && a.startTime === 0)
    );
  });
  return spinners;
}

/**
 * Records the mount announcement from before the story loads. A Spinner that
 * first renders before the page has loaded stays silent. Otherwise the polite
 * live region shows the label, then empties 2 s later. Call it before
 * `openSizes`.
 */
async function recordAnnouncement(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __spinnerAnnouncement?: 'shown' | 'ended';
      __spinnerIsSilent?: boolean;
    };
    new MutationObserver(() => {
      // The page's state when the first Spinner mounts decides whether it
      // announces.
      if (
        w.__spinnerIsSilent == null &&
        document.querySelector('.astryx-spinner') != null
      ) {
        w.__spinnerIsSilent = document.readyState !== 'complete';
      }
      const region = document.querySelector(
        '[data-astryx-live-region="polite"]',
      );
      if (region == null) {
        return;
      }
      if (region.textContent !== '') {
        w.__spinnerAnnouncement = 'shown';
      } else if (w.__spinnerAnnouncement === 'shown') {
        w.__spinnerAnnouncement = 'ended';
      }
    }).observe(document, {childList: true, characterData: true, subtree: true});
  });
}

/** Resolves once the mount announcement has ended, or was never made. */
async function waitForAnnouncementToEnd(page: Page, timeout?: number) {
  await page.waitForFunction(
    () => {
      const w = window as unknown as {
        __spinnerAnnouncement?: string;
        __spinnerIsSilent?: boolean;
      };
      return (
        w.__spinnerAnnouncement === 'ended' || w.__spinnerIsSilent === true
      );
    },
    undefined,
    {timeout},
  );
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Each ring's angle in each frame, in degrees, decoded in a scratch page. The
 * reading is the direction of the ring's arc from the centre of its box. It is
 * the mean direction of the box's pixels, each weighted by its colour
 * difference from the box's corner. The track is even all round, so only the
 * arc moves the mean. Each reading continues from the frame before, so a full
 * turn adds 360.
 */
async function angles(
  page: Page,
  frames: ReadonlyArray<CastFrame>,
  boxes: ReadonlyArray<Box>,
): Promise<number[][]> {
  const scratch = await page.context().newPage();
  const viewportWidth = page.viewportSize()?.width ?? 402;
  try {
    const readings: number[][] = [];
    for (let i = 0; i < frames.length; i += 10) {
      const batch = frames.slice(i, i + 10).map(f => f.data);
      readings.push(
        ...(await scratch.evaluate(
          async ({items, crops, vw}) => {
            const result: number[][] = [];
            for (const item of items) {
              const blob = await (
                await fetch(`data:image/png;base64,${item}`)
              ).blob();
              const bitmap = await createImageBitmap(blob);
              const scale = bitmap.width / vw;
              const directions: number[] = [];
              for (const box of crops) {
                const w = Math.ceil(box.width * scale);
                const h = Math.ceil(box.height * scale);
                const canvas = new OffscreenCanvas(w, h);
                const context = canvas.getContext('2d');
                if (context == null) {
                  throw new Error('no 2d context');
                }
                context.drawImage(
                  bitmap,
                  Math.floor(box.x * scale),
                  Math.floor(box.y * scale),
                  w,
                  h,
                  0,
                  0,
                  w,
                  h,
                );
                const {data} = context.getImageData(0, 0, w, h);
                let sumX = 0;
                let sumY = 0;
                for (let y = 0; y < h; y += 1) {
                  for (let x = 0; x < w; x += 1) {
                    const p = (y * w + x) * 4;
                    const weight =
                      Math.abs(data[p] - data[0]) +
                      Math.abs(data[p + 1] - data[1]) +
                      Math.abs(data[p + 2] - data[2]);
                    const dx = x + 0.5 - w / 2;
                    const dy = y + 0.5 - h / 2;
                    const distance = Math.hypot(dx, dy);
                    if (distance > 0) {
                      sumX += (weight * dx) / distance;
                      sumY += (weight * dy) / distance;
                    }
                  }
                }
                directions.push((Math.atan2(sumY, sumX) * 180) / Math.PI);
              }
              result.push(directions);
            }
            return result;
          },
          {items: batch, crops: boxes, vw: viewportWidth},
        )),
      );
    }
    // The shortest change from frame to frame: a ring turns far less than
    // half a turn between two frames.
    const continued = readings.map(frame => [...frame]);
    for (let i = 1; i < readings.length; i += 1) {
      for (let ring = 0; ring < boxes.length; ring += 1) {
        const change =
          ((readings[i][ring] - readings[i - 1][ring] + 540) % 360) - 180;
        continued[i][ring] = continued[i - 1][ring] + change;
      }
    }
    return continued;
  } finally {
    await scratch.close();
  }
}

/**
 * The time of one turn, in ms, and the turns in one iteration. One iteration
 * holds many turns, so the period is the iteration's duration divided by the
 * turns its last keyframe makes.
 */
async function turnTiming(
  rotor: ReturnType<Page['locator']>,
): Promise<{period: number; turns: number}> {
  return rotor.evaluate(element => {
    const [animation] = element.getAnimations();
    const effect = animation.effect as KeyframeEffect;
    const frames = effect.getKeyframes();
    const end = String(frames[frames.length - 1].transform);
    const degrees = Number(/rotate\((-?[\d.]+)deg\)/.exec(end)?.[1]);
    const turns = degrees / 360;
    return {period: Number(effect.getTiming().duration) / turns, turns};
  });
}

/** The rotor's angle in degrees, from 0 up to 360. */
function angleOf(transform: string): number {
  return (parseTransform(transform).rotate + 360) % 360;
}

test('the ring keeps turning while a script holds the main thread', async ({
  page,
}) => {
  const spinners = await openSizes(page);
  const boxes: Box[] = [];
  for (let i = 0; i < 4; i += 1) {
    const box = await spinners.nth(i).boundingBox();
    if (box == null) {
      throw new Error('no spinner box');
    }
    boxes.push(box);
  }
  // The control crosses the top strip, so every ring sits below it.
  for (const box of boxes) {
    expect(box.y).toBeGreaterThan(CONTROL_SIDE);
  }
  await startBusyControl(page);
  const cast = await startScreencast(page);
  await page.waitForTimeout(300);
  const busy = await blockMainThread(page, BLOCK_MS);
  await page.waitForTimeout(200);
  const frames = await cast.stop();
  const control = await trackControl(page, frames);
  const readings = await angles(page, frames, boxes);
  // Each ring is judged against the compositor-only control in the same
  // frames. It shows a new angle on every frame the control moved on, and it
  // stalls no longer than the control. A control with too few frames in the
  // block throws FrameStarvationError.
  for (let ring = 0; ring < 4; ring += 1) {
    const turning: TrackedFrame[] = frames.map((frame, i) => ({
      t: frame.t,
      box: {x: readings[i][ring], y: 0, width: 1, height: 1},
      pixels: 1,
      engine: frame.engine,
    }));
    const proof = busyWindowProof(turning, busy, {axis: 'x', control});
    test.info().annotations.push({
      type: `busy window, ring ${ring}`,
      description: proof.summary,
    });
    expect(proof.verdict.failures, `ring ${ring}: ${proof.summary}`).toEqual(
      [],
    );
  }
});

test('turning paints nothing on the main thread', async ({page}) => {
  await recordAnnouncement(page);
  await openSizes(page);
  await page.waitForTimeout(200);
  // Clearing the mount announcement repaints the shared live region, not the
  // rotor. The trace starts once that announcement ended, or the Spinner
  // stayed silent. A check for empty regions alone also passes before the
  // announcement.
  await waitForAnnouncementToEnd(page);
  // Four rings turn for two seconds. A paint animation repaints every frame;
  // a transform animation paints none. React listens for
  // `animationiteration`, so Chromium recalculates style a few times at each
  // iteration boundary. One turn per iteration gives about 14 recalculations
  // here. With many turns in one iteration, no boundary occurs, and the bound
  // allows only unrelated single recalculations.
  const trace = await traceRendering(page, async () =>
    page.waitForTimeout(2000),
  );
  expect(trace.paint).toBe(0);
  expect(trace.layout).toBe(0);
  expect(trace.styleRecalc).toBeLessThanOrEqual(2);
});

test('the arc turns clockwise at a constant rate, once per period', async ({
  page,
}) => {
  const spinners = await openSizes(page);
  const rotor = spinners.first().locator('span[aria-hidden="true"]');
  const {period, turns} = await turnTiming(rotor);
  const samples = await rotor.evaluate((element, periodMs) => {
    const [animation] = element.getAnimations();
    animation.pause();
    const out: {t: number; transform: string}[] = [];
    for (let i = 0; i <= 8; i += 1) {
      // Inside the period at both ends: 0, P/8 … P − 1 ms.
      const t = i === 8 ? periodMs - 1 : (periodMs * i) / 8;
      animation.currentTime = t;
      out.push({t, transform: getComputedStyle(element).transform});
    }
    return {
      duration: Number(animation.effect?.getTiming().duration),
      cssDuration: getComputedStyle(element).animationDuration,
      easing: animation.effect?.getTiming().easing,
      out,
    };
  }, period);
  // The period is the `--duration-slow-min` token the theme resolves.
  expect(period).toBeGreaterThan(0);
  expect(Number.isInteger(turns) && turns > 1).toBe(true);
  expect(Number.parseFloat(samples.cssDuration) * 1000).toBeCloseTo(
    samples.duration,
    3,
  );
  expect(samples.easing).toBe('linear');
  // Angle = 360 × t / P, clockwise (positive in CSS), at every sample.
  for (const {t, transform} of samples.out) {
    const expected = ((360 * t) / period) % 360;
    const actual = angleOf(transform);
    const error = Math.min(
      Math.abs(actual - expected),
      360 - Math.abs(actual - expected),
    );
    expect(error, `angle at ${t.toFixed(1)} ms`).toBeLessThan(0.5);
  }
});

test('reduced motion slows the ring to 3 s per turn, as before, still clockwise and still turning', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  const spinners = await openSizes(page);
  const rotor = spinners.first().locator('span[aria-hidden="true"]');
  const {period} = await turnTiming(rotor);
  const samples = await rotor.evaluate((element, periodMs) => {
    const [animation] = element.getAnimations();
    animation.pause();
    const out: {t: number; transform: string}[] = [];
    for (let i = 0; i < 4; i += 1) {
      const t = (periodMs * i) / 4;
      animation.currentTime = t;
      out.push({t, transform: getComputedStyle(element).transform});
    }
    return {
      iterations: animation.effect?.getTiming().iterations,
      out,
    };
  }, period);
  // The reduced-motion period this component had before the change: slowed,
  // never frozen (`Spinner.tsx`, `animationDuration` under the media query).
  expect(period).toBeCloseTo(3000, 6);
  expect(samples.iterations).toBe(Infinity);
  for (const {t, transform} of samples.out) {
    const expected = (360 * t) / period;
    const actual = angleOf(transform);
    const error = Math.min(
      Math.abs(actual - expected),
      360 - Math.abs(actual - expected),
    );
    expect(error, `angle at ${t} ms`).toBeLessThan(0.5);
  }
});

test('every ring on the page turns in phase', async ({page}) => {
  await openSizes(page);
  const angles = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll('.astryx-spinner > span[aria-hidden="true"]'),
    ).map(rotor => {
      const [animation] = rotor.getAnimations();
      return {
        startTime: animation.startTime,
        currentTime: animation.currentTime,
      };
    }),
  );
  expect(angles).toHaveLength(4);
  for (const angle of angles) {
    expect(angle.startTime).toBe(0);
    expect(angle.currentTime).toBe(angles[0].currentTime);
  }
});

test('storyboard: one revolution, frame by frame @storyboard', async ({
  page,
}, testInfo) => {
  const spinners = await openSizes(page);
  const xl = spinners.nth(3);
  const rotor = xl.locator('span[aria-hidden="true"]');
  const {period: duration} = await turnTiming(rotor);
  const {storyboard} = await animationStoryboard(page, {
    name: 'spinner-ring-cycle',
    clip: xl,
    scope: xl,
    judges: {target: rotor, property: 'transform'},
    columns: 12,
    cellScale: 2,
    times: timeline(duration - 1),
    measure: async () => ({
      angle: angleOf(
        await rotor.evaluate(element => getComputedStyle(element).transform),
      ),
    }),
  });
  // The trace is the assertion: every frame sits at 360 × t / P, so the ring
  // never stalls, jumps or reverses inside a period.
  for (const frame of storyboard.frames) {
    const expected = ((360 * frame.t) / duration) % 360;
    const actual = Number(frame.data.angle);
    const error = Math.min(
      Math.abs(actual - expected),
      360 - Math.abs(actual - expected),
    );
    expect(error, `angle at ${frame.label}`).toBeLessThan(0.5);
  }
  await storyboard.write(testInfo, {
    story: 'core-spinner--sizes (xl)',
    duration,
  });
});
