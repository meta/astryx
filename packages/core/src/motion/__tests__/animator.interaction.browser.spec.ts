// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file animator.interaction.browser.spec.ts
 * @input The motion source (animator, springs, spring math) bundled with
 *   esbuild onto a blank fixture page; the interaction harness's screencast,
 *   busy-main-thread and trace instruments; Chromium and WebKit on the phone
 *   profile
 * @output Proof that the animator's motion runs on the compositor (law M1):
 *   a spring keeps advancing every frame through a 1 s main-thread block, on
 *   its analytic curve; a spring that ends inside the block keeps its end
 *   state; no Layout or Paint runs while it animates (Chromium trace); the
 *   engine plays the analytic curve when seeked; a finished animation leaves
 *   within a frame or two of the curve's end; a dialog's ::backdrop follows
 *   the curve and holds its end state; a theme that retunes a table spring
 *   changes the curve the engine plays
 * @position Browser proof for animator.ts, run by `pnpm test:interaction`;
 *   jsdom runs no animations
 */

import {fileURLToPath} from 'node:url';
import {
  blockMainThread,
  busyWindowProof,
  countBetween,
  markElement,
  startScreencast,
  traceRendering,
  trackMarker,
} from '@astryxdesign/interaction-harness';
import {expect, test, type Page} from '@playwright/test';
import {build} from 'esbuild';
import type {Animator} from '../animator';
import type * as MotionBundle from './motionBundle';

let script = '';

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('./motionBundle.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'Motion',
    target: 'es2022',
  });
  script = result.outputFiles[0].text;
});

/**
 * A slow, critically damped spring: over 1 px per frame through the whole
 * block, so every frame inside it has to move.
 */
const SLOW = {response: 2, dampingRatio: 1};
/** Settles about 450 ms into the block. */
const FAST = {response: 0.25, dampingRatio: 1};
const TRAVEL = 300;
/** The marker chip sits this far inside the box\u2019s top-left corner. */
const MARKER_INSET = 8;

// A real navigation (not setContent): the page keeps its own window.
async function open(page: Page) {
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html, body { margin: 0; background: #fff; }
  #box { position: absolute; top: 40px; left: 0; width: 48px; height: 48px; background: #36c; }
</style>
<div id="box"></div>
<script>${script}</script>
<script>window.animator = Motion.createAnimator(document.getElementById('box'));</script>`;
  await page.route('http://motion.test/', async route =>
    route.fulfill({contentType: 'text/html', body: html}),
  );
  await page.goto('http://motion.test/');
}

/**
 * Starts a spring of TRAVEL px on x, blocks the main thread for 1 s mid-flight
 * and returns the screencast frames with the run\u2019s clock (epoch ms).
 */
async function blockedRun(
  page: Page,
  spring: {response: number; dampingRatio: number},
) {
  await open(page);
  const box = page.locator('#box');
  await markElement(box, {inset: MARKER_INSET});
  const cast = await startScreencast(page);
  // The curve starts when the browser commits it (handle.started).
  const start = await page.evaluate(
    async ({spring: s, travel}) => {
      const handle = window.animator.animate({x: travel}, {spring: s});
      return performance.timeOrigin + (await handle.started);
    },
    {spring, travel: TRAVEL},
  );
  // The page blocks itself in the frame that sees the curve 40 ms in, however
  // loaded the machine is.
  const busy = await blockMainThread(page, 1000, {
    during: box,
    minProgressMs: 40,
  });
  await page.waitForTimeout(200);
  const tracked = await trackMarker(page, await cast.stop());
  return {start, busy, tracked};
}

test('a spring keeps advancing every frame through a 1 s main-thread block, on its curve', async ({
  page,
  browserName,
}) => {
  const {start, busy, tracked} = await blockedRun(page, SLOW);
  const proof = busyWindowProof(tracked, busy, {axis: 'x', settledWithin: 2});
  test
    .info()
    .annotations.push({type: 'busy window', description: proof.summary});
  expect(busy.to - busy.from).toBeGreaterThanOrEqual(1000);
  // The harness's verdict: display rate, no stall over two dropped frames,
  // nearly every expected frame moved (what a loaded runner still meets and a
  // main-thread animation never does).
  expect(proof.verdict.failures, proof.summary).toEqual([]);
  expect(proof.monotonic).toBe(true);
  // And it is the spring: placing each frame inside the block on the
  // analytic curve (inverting it at the frame's position) gives the same time
  // offset for every frame. Chromium stamps frames on the page's clock, so its
  // offset is also near zero; WebKit's screencast clock is rebased, so only
  // the spread is judged there.
  const inside = tracked.filter(
    f => f.box != null && f.t > busy.from + 20 && f.t < busy.to - 20,
  );
  expect(inside.length).toBeGreaterThan(30);
  const offsets = await page.evaluate(
    ({spring, travel, frames}) => {
      const solved = Motion.solveSpring(Motion.toSpring(spring), {
        from: 0,
        to: travel,
      });
      return frames.map(({t, x}) => {
        let lo = 0;
        let hi = 3;
        for (let i = 0; i < 60; i++) {
          const mid = (lo + hi) / 2;
          if (solved.value(mid) < x) {
            lo = mid;
          } else {
            hi = mid;
          }
        }
        return t - lo * 1000;
      });
    },
    {
      spring: SLOW,
      travel: TRAVEL,
      frames: inside.map(f => ({
        t: f.t - start,
        x: (f.box?.x ?? NaN) - MARKER_INSET,
      })),
    },
  );
  const sorted = [...offsets].sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)];
  const spread =
    sorted[Math.floor(sorted.length * 0.9)] -
    sorted[Math.floor(sorted.length * 0.1)];
  test.info().annotations.push({
    type: 'time offset of the frames on the curve',
    description: JSON.stringify({median, spread}),
  });
  expect(spread).toBeLessThan(25);
  if (browserName === 'chromium') {
    expect(Math.abs(median)).toBeLessThan(20);
  }
});

test('a spring that ends inside the block keeps showing its end state', async ({
  page,
}) => {
  const {busy, tracked} = await blockedRun(page, FAST);
  // Frames from the block's start on, through the frames after it: a screen
  // that holds still sends no frames, so a fallback to an older value would
  // show up as a new frame.
  const after = tracked.filter(f => f.box != null && f.t > busy.from + 20);
  const xs = after.map(f => (f.box?.x ?? NaN) - MARKER_INSET);
  test.info().annotations.push({
    type: 'positions from the block on',
    description: xs.map(x => Math.round(x)).join(' '),
  });
  const landed = xs.findIndex(x => x >= TRAVEL - 1);
  expect(landed).toBeGreaterThanOrEqual(0);
  // WebKit's compositor falls back to the main thread's last committed value
  // when an animation ends during a block; the animator's end-state hold
  // keeps the end on screen until script runs again.
  for (const x of xs.slice(landed)) {
    expect(x).toBeGreaterThanOrEqual(TRAVEL - 1);
  }
});

test('a spring started right before a block plays in full after it', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'WebKit starts a pending animation at its last frame time before the block (animator header, known limits)',
  );
  await open(page);
  const box = page.locator('#box');
  await markElement(box, {inset: MARKER_INSET});
  const cast = await startScreencast(page);
  // Started and blocked in one task: the browser has not committed it yet.
  // It starts when the first frame after the block commits it, as Core
  // Animation starts an animation at its transaction's commit, instead of
  // landing 400 ms into its curve.
  const busy = await page.evaluate(
    ({spring, travel}) => {
      window.animator.animate({x: travel}, {spring});
      const from = performance.timeOrigin + performance.now();
      const end = performance.now() + 400;
      while (performance.now() < end) {
        // the main thread is busy
      }
      return {from, to: performance.timeOrigin + performance.now()};
    },
    {spring: SLOW, travel: TRAVEL},
  );
  await page.waitForTimeout(300);
  const tracked = await trackMarker(page, await cast.stop());
  const xs = tracked
    .filter(f => f.box != null)
    .map(f => ({t: f.t, x: (f.box?.x ?? NaN) - MARKER_INSET}));
  const firstMoving = xs.find(f => f.x > 0.5);
  test.info().annotations.push({
    type: 'first moving frame after the block',
    description: JSON.stringify({
      x: firstMoving?.x,
      after: firstMoving == null ? null : firstMoving.t - busy.to,
    }),
  });
  expect(firstMoving).toBeDefined();
  // 400 ms into this spring is 107 px; the start of the curve is a few px.
  expect(firstMoving?.x ?? Infinity).toBeLessThan(30);
});

test('no Layout or Paint runs while it animates', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'tracing is a Chromium protocol');
  await open(page);
  let start = 0;
  const trace = await traceRendering(page, async () => {
    start = await page.evaluate(
      ({spring, travel}) => {
        window.animator.animate({x: travel, opacity: 0.5}, {spring});
        return performance.timeOrigin + performance.now();
      },
      {spring: SLOW, travel: TRAVEL},
    );
    await page.waitForTimeout(1900);
  });
  // After the frame that starts the animation.
  const counts = countBetween(trace, start + 50, trace.window.to);
  test.info().annotations.push({
    type: 'rendering work while animating',
    description: JSON.stringify(counts),
  });
  expect(counts.Layout ?? 0).toBe(0);
  expect(counts.Paint ?? 0).toBe(0);
});

test('the engine plays the analytic curve, all channels on one clock', async ({
  page,
}) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const spring = Motion.springs.snappy;
    const handle = window.animator.animate({x: 300, opacity: 0.4}, {spring});
    // From rest, the animations start in the frame after the call.
    await handle.started;
    const animations = document.getAnimations();
    const starts = animations.map(a => Number(a.startTime));
    const start = starts[0];
    const box = document.getElementById('box') as HTMLElement;
    let worstX = 0;
    let worstOpacity = 0;
    const duration = Math.max(
      ...animations.map(a => Number(a.effect?.getComputedTiming().endTime)),
    );
    for (const a of animations) {
      a.pause();
    }
    for (let t = 0; t <= duration; t += 4) {
      for (const a of animations) {
        a.currentTime = t;
      }
      const style = getComputedStyle(box);
      const x = Number.parseFloat(style.translate || '0');
      const opacity = Number.parseFloat(style.opacity);
      worstX = Math.max(
        worstX,
        Math.abs(x - window.animator.get('x', start + t)),
      );
      worstOpacity = Math.max(
        worstOpacity,
        Math.abs(opacity - window.animator.get('opacity', start + t)),
      );
    }
    return {count: animations.length, starts, worstX, worstOpacity};
  });
  test.info().annotations.push({
    type: 'seeked curve',
    description: JSON.stringify(result),
  });
  expect(result.count).toBe(2);
  expect(new Set(result.starts).size).toBe(1);
  expect(result.worstX).toBeLessThan(0.06);
  expect(result.worstOpacity).toBeLessThan(0.003);
});

test('a theme that retunes a table spring changes the curve the engine plays', async ({
  page,
}) => {
  // The theme writes the role's variable on its scope, as defineTheme's CSS
  // does; the box outside the scope keeps the table's spring.
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html, body { margin: 0; background: #fff; }
  .box { position: absolute; top: 40px; width: 48px; height: 48px; background: #36c; }
  @scope ([data-astryx-theme="soft"]) { :scope { --motion-springs-sheet-present: 0.8s 0.3; } }
</style>
<div class="box" id="plain" style="left: 0"></div>
<div data-astryx-theme="soft"><div class="box" id="themed" style="left: 80px"></div></div>
<script>${script}</script>`;
  await page.route('http://motion.test/', async route =>
    route.fulfill({contentType: 'text/html', body: html}),
  );
  await page.goto('http://motion.test/');
  const result = await page.evaluate(async () => {
    const curves = {
      plain: Motion.solveSpring(Motion.toSpring(Motion.springs.sheetPresent), {
        from: 300,
        to: 0,
      }),
      themed: Motion.solveSpring(
        Motion.toSpring({duration: 0.8, bounce: 0.3}),
        {
          from: 300,
          to: 0,
        },
      ),
    };
    const report: Record<string, {worst: number; lowest: number}> = {};
    for (const id of ['plain', 'themed'] as const) {
      const element = document.getElementById(id) as HTMLElement;
      const animator = Motion.createAnimator(element);
      animator.set({y: 300});
      const handle = animator.animate(
        {y: 0},
        {spring: Motion.springs.sheetPresent},
      );
      await handle.started;
      const animations = element.getAnimations();
      for (const a of animations) {
        a.pause();
      }
      let worst = 0;
      let lowest = Infinity;
      for (let t = 0; t <= 1200; t += 8) {
        for (const a of animations) {
          a.currentTime = t;
        }
        const [, y = '0'] = getComputedStyle(element).translate.split(' ');
        const value = Number.parseFloat(y) || 0;
        lowest = Math.min(lowest, value);
        worst = Math.max(worst, Math.abs(value - curves[id].value(t / 1000)));
      }
      report[id] = {worst, lowest};
    }
    return report;
  });
  test.info().annotations.push({
    type: 'themed spring',
    description: JSON.stringify(result),
  });
  // Each box plays its own spring: the themed one overshoots, the table's
  // (critically damped) does not.
  expect(result.plain.worst).toBeLessThan(0.06);
  expect(result.themed.worst).toBeLessThan(0.06);
  expect(result.themed.lowest).toBeLessThan(-10);
  expect(result.plain.lowest).toBeGreaterThan(-0.5);
});

test('a finished animation leaves the element once the curve ends', async ({
  page,
}) => {
  await open(page);
  const result = await page.evaluate(
    async spring =>
      new Promise<{curveEnd: number; leftAt: number}>(resolve => {
        const start = performance.now();
        window.animator.animate({x: 120}, {spring});
        const box = document.getElementById('box') as HTMLElement;
        const solved = Motion.solveSpring(Motion.toSpring(spring), {
          from: 0,
          to: 120,
        });
        const curveEnd = solved.settleTime(0.05) * 1000;
        const tick = () => {
          if (box.getAnimations().length === 0) {
            resolve({curveEnd, leftAt: performance.now() - start});
          } else {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      }),
    {response: 0.3, dampingRatio: 1},
  );
  test.info().annotations.push({
    type: 'animation lifetime',
    description: JSON.stringify(result),
  });
  // Gone within a couple of frames of the curve's end, not after the hold.
  expect(result.leftAt).toBeGreaterThanOrEqual(result.curveEnd - 1);
  expect(result.leftAt).toBeLessThan(result.curveEnd + 100);
});

test('a dialog\u2019s ::backdrop plays the curve and holds its end state', async ({
  page,
}) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const dialog = document.createElement('dialog');
    document.body.append(dialog);
    dialog.showModal();
    const backdrop = Motion.createAnimator(dialog, {
      pseudoElement: '::backdrop',
    });
    backdrop.set({opacity: 0});
    await backdrop.animate({opacity: 1}, {spring: Motion.springs.alertPresent})
      .started;
    const animations = document
      .getAnimations()
      .filter(a => (a.effect as KeyframeEffect).target === dialog);
    const start = Number(animations[0].startTime);
    let worst = 0;
    const read = () =>
      Number.parseFloat(getComputedStyle(dialog, '::backdrop').opacity);
    for (const a of animations) {
      a.pause();
    }
    for (let t = 0; t <= 400; t += 5) {
      for (const a of animations) {
        a.currentTime = t;
      }
      worst = Math.max(
        worst,
        Math.abs(read() - backdrop.get('opacity', start + t)),
      );
    }
    for (const a of animations) {
      a.currentTime = 20_000; // long after the curve and the hold
    }
    return {count: animations.length, worst, held: read()};
  });
  test.info().annotations.push({
    type: 'backdrop curve',
    description: JSON.stringify(result),
  });
  expect(result.count).toBe(1);
  expect(result.worst).toBeLessThan(0.003);
  expect(result.held).toBeCloseTo(1, 6);
});

declare global {
  interface Window {
    animator: Animator;
  }
  const Motion: typeof MotionBundle;
}
