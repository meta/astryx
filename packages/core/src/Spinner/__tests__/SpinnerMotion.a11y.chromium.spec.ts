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
  frameStats,
  parseTransform,
  startScreencast,
  timeline,
  traceRendering,
  type CastFrame,
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

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A checksum of each box in each frame, decoded in a scratch page. */
async function checksums(
  page: Page,
  frames: ReadonlyArray<CastFrame>,
  boxes: ReadonlyArray<Box>,
): Promise<number[][]> {
  const scratch = await page.context().newPage();
  const viewportWidth = page.viewportSize()?.width ?? 402;
  try {
    const out: number[][] = [];
    for (let i = 0; i < frames.length; i += 10) {
      const batch = frames.slice(i, i + 10).map(f => f.data);
      out.push(
        ...(await scratch.evaluate(
          async ({items, crops, vw}) => {
            const result: number[][] = [];
            for (const item of items) {
              const blob = await (
                await fetch(`data:image/png;base64,${item}`)
              ).blob();
              const bitmap = await createImageBitmap(blob);
              const scale = bitmap.width / vw;
              const sums: number[] = [];
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
                let sum = 0;
                for (let p = 0; p < data.length; p += 4) {
                  sum =
                    (sum * 31 + data[p] * 3 + data[p + 1] * 5 + data[p + 2]) %
                    1000000007;
                }
                sums.push(sum);
              }
              result.push(sums);
            }
            return result;
          },
          {items: batch, crops: boxes, vw: viewportWidth},
        )),
      );
    }
    return out;
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
  const cast = await startScreencast(page);
  await page.waitForTimeout(300);
  const busy = await blockMainThread(page, BLOCK_MS);
  await page.waitForTimeout(200);
  const frames = await cast.stop();
  const sums = await checksums(page, frames, boxes);

  // Judge the block's inside, a frame clear of each edge.
  const from = busy.from + 20;
  const to = busy.to - 20;
  const inside = frames
    .map((frame, i) => ({t: frame.t, sums: sums[i]}))
    .filter(f => f.t >= from && f.t <= to);
  const expected = Math.floor((to - from) / (1000 / 60));
  // The compositor keeps presenting frames at display rate…
  expect(inside.length).toBeGreaterThanOrEqual(Math.floor(expected * 0.85));
  // …and every ring moves in nearly every one of them.
  for (let ring = 0; ring < 4; ring += 1) {
    const stats = frameStats(
      inside.map(f => ({t: f.t, value: f.sums[ring]})),
      {from, to},
    );
    expect(stats.changed, `ring ${ring} frames changed`).toBeGreaterThanOrEqual(
      Math.floor((inside.length - 1) * 0.9),
    );
    expect(
      stats.longestStallMs,
      `ring ${ring} longest stall`,
    ).toBeLessThanOrEqual(50);
  }
});

test('turning paints nothing on the main thread', async ({page}) => {
  await openSizes(page);
  await page.waitForTimeout(200);
  // Four rings turn for two seconds. A paint animation repaints every frame;
  // a transform animation paints none. React listens for
  // `animationiteration`, so Chromium recalculates style at each iteration
  // boundary. With many turns in one iteration, no boundary occurs here.
  const trace = await traceRendering(page, async () =>
    page.waitForTimeout(2000),
  );
  expect(trace.paint).toBe(0);
  expect(trace.layout).toBe(0);
  expect(trace.styleRecalc).toBe(0);
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
