// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file animator.interaction.browser.spec.ts
 * @input The motion source (animator, springs, spring math) bundled with
 *   esbuild onto a blank fixture page; the interaction harness's screencast,
 *   busy-main-thread and trace instruments; Chromium and WebKit on the phone
 *   profile
 * @output Proof that the animator's motion runs on the compositor
 *   (`spec:AST-094` FR5): a spring keeps advancing every frame through a 1 s
 *   main-thread block, on its analytic curve; a spring that ends inside the
 *   block keeps its end state; no Layout or Paint runs while it animates
 *   (Chromium trace); the engine plays the analytic curve when seeked; a
 *   finished animation leaves within a frame or two of the curve's end; a
 *   fade-in on an element its stylesheet hides stays visible once it retires;
 *   a dialog's ::backdrop follows the curve and holds its end state; a frame
 *   painted before the compositor has a curve shows the element where it is;
 *   a role variable set on a scope changes nothing, as the per-role tables
 *   stay internal (DEC-15)
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
import type {Animator, MotionHandle} from '../animator';
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
/** One frame at 60 Hz, in ms. */
const FRAME_MS = 1000 / 60;
/** The marker chip sits this far inside the box\u2019s top-left corner. */
const MARKER_INSET = 8;

/**
 * Waits for the held-dip call to end: on the call's own `finished`, then on
 * the browser's own animations still running or waiting for their first
 * frame, never on a count of frames. The dip lands on a timer due on the
 * call's clock, which a loaded page runs whenever it can, so a frame window
 * can close before the landing. Reads no animator value: a call would look
 * for the start again.
 */
async function dipDone(page: Page) {
  await page.evaluate(async () => {
    await (window as unknown as {dip: MotionHandle}).dip.finished;
    const box = document.getElementById('box') as HTMLElement;
    await Promise.all(
      box
        .getAnimations()
        .filter(
          animation => animation.pending || animation.playState === 'running',
        )
        .map(async animation =>
          animation.finished.catch((error: unknown) => {
            // A retired animation's cancel rejects its finished with an
            // AbortError; any other rejection is a real failure.
            if (!(
              error instanceof DOMException && error.name === 'AbortError'
            )) {
              throw error;
            }
          }),
        ),
    );
  });
}

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
  // The harness's verdict: no stall over two dropped frames, and nearly
  // every expected frame moved (what a loaded runner still meets and a
  // main-thread animation never does). It sets no display-rate bound.
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
  // when an animation ends during a block; the keyframes' hold of the end
  // state past the curve keeps the end on screen until script runs again.
  for (const x of xs.slice(landed)) {
    expect(x).toBeGreaterThanOrEqual(TRAVEL - 1);
  }
});

test('a frame painted before the compositor has the curve shows the element where it is', async ({
  page,
}) => {
  await open(page);
  // What a frame shows without the curve is the element's own style: drop the
  // curves right after they are created and read it. A present from rest,
  // then a retarget mid-flight.
  const result = await page.evaluate(
    async ({travel}) => {
      const fresh = (now?: () => number) => {
        const element = document.createElement('div');
        element.style.cssText =
          'position:absolute;top:120px;left:0;width:48px;height:48px;background:#c63';
        document.body.append(element);
        return {
          element,
          animator: Motion.createAnimator(element, now ? {now} : {}),
        };
      };
      const x = (element: HTMLElement) =>
        Number.parseFloat(getComputedStyle(element).translate.split(' ')[0]) ||
        0;
      const present = fresh();
      present.animator.animate({x: travel}, {spring: Motion.springs.settle});
      for (const animation of present.element.getAnimations()) {
        animation.cancel();
      }
      const presentX = x(present.element);

      // One instant for the read and the retarget: 150 ms into the settle the
      // curve moves about a pixel a millisecond, so two clock reads would
      // differ by however long a busy page took between them.
      let frozen: number | null = null;
      const retarget = fresh(() => frozen ?? performance.now());
      await retarget.animator.animate(
        {x: travel},
        {spring: Motion.springs.settle},
      ).started;
      await new Promise(resolve => setTimeout(resolve, 150));
      frozen = performance.now();
      const onScreen = retarget.animator.get('x');
      retarget.animator.animate({x: 0}, {spring: Motion.springs.settle});
      frozen = null;
      for (const animation of retarget.element.getAnimations()) {
        animation.cancel();
      }
      return {presentX, onScreen, retargetX: x(retarget.element)};
    },
    {travel: TRAVEL},
  );
  test.info().annotations.push({
    type: 'without the curve',
    description: JSON.stringify(result),
  });
  expect(result.presentX).toBeCloseTo(0, 1);
  expect(result.onScreen).toBeGreaterThan(20);
  // The inline value is written to a thousandth of a pixel.
  expect(result.retargetX).toBeCloseTo(result.onScreen, 2);
});

test('under Reduce Motion, a dip a busy main thread lands late still ends within its 200 ms cross-fade', async ({
  page,
}) => {
  // design:reduced-motion DR2 on a touch screen: the move dips (fades out,
  // lands while transparent, fades back in) in 200 ms or less, opacity only.
  await page.emulateMedia({reducedMotion: 'reduce'});
  await open(page);
  const read = await page.evaluate(async travel => {
    const box = document.getElementById('box') as HTMLElement;
    const handle = window.animator.animate(
      {x: travel},
      {spring: Motion.springs.navigationPush},
    );
    const start = await handle.started;
    // What the dip animates, read while it runs.
    const animated = box
      .getAnimations()
      .flatMap(animation =>
        (animation.effect as KeyframeEffect)
          .getKeyframes()
          .flatMap(frame =>
            Object.keys(frame).filter(
              key =>
                !['offset', 'easing', 'composite', 'computedOffset'].includes(
                  key,
                ),
            ),
          ),
      );
    // The main thread is busy from 60 to 180 ms into the dip, so the task
    // that lands it (due at 100 ms) runs 80 ms late.
    await new Promise(resolve =>
      setTimeout(resolve, Math.max(0, start + 60 - performance.now())),
    );
    while (performance.now() < start + 180) {
      // the main thread is busy
    }
    await new Promise(resolve =>
      setTimeout(resolve, Math.max(0, start + 230 - performance.now())),
    );
    const style = getComputedStyle(box);
    return {
      at: performance.now() - start,
      opacity: Number(style.opacity),
      translate: style.translate,
      animated,
    };
  }, TRAVEL);
  test.info().annotations.push({
    type: '30 ms after the cross-fade was due to end',
    description: JSON.stringify(read),
  });
  // Landed, and fully back in by then: the late landing did not stretch it.
  expect(read.translate).toBe(`${TRAVEL}px`);
  expect(read.opacity).toBeCloseTo(1, 2);
  // Opacity only, read while the dip ran: the travel is never animated.
  expect(read.animated).toContain('opacity');
  expect(read.animated.every(key => key === 'opacity')).toBe(true);
});

test('under Reduce Motion, a dip held before its first frame lands once the hold is finished', async ({
  page,
}) => {
  // A sampler can pause a call's animations before the browser starts them
  // (the interaction harness's hold landing ahead of the call's first frame
  // under load, or a page pausing every animation). Its release with finish
  // ends the held fade out; with no animator call after it, the dip still
  // lands and fades back in.
  await page.emulateMedia({reducedMotion: 'reduce'});
  await open(page);
  await page.evaluate(travel => {
    (window as unknown as {dip: MotionHandle}).dip = window.animator.animate(
      {x: travel},
      {spring: Motion.springs.navigationPush},
    );
    // In the call's own task, ahead of its first frame.
    const held = document.getAnimations();
    for (const animation of held) {
      animation.pause();
    }
    (window as unknown as {held: Animation[]}).held = held;
  }, TRAVEL);
  await page.evaluate(
    async () =>
      new Promise<void>(resolve =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => setTimeout(resolve, 40)),
        ),
      ),
  );
  await page.evaluate(() => {
    for (const animation of (window as unknown as {held: Animation[]}).held) {
      animation.finish();
    }
  });
  // Read from the page only: an animator call would look for the start again.
  const read = async () =>
    page.evaluate(() => {
      const box = document.getElementById('box') as HTMLElement;
      const style = getComputedStyle(box);
      return {opacity: Number(style.opacity), translate: style.translate};
    });
  await dipDone(page);
  expect(await read()).toEqual({opacity: 1, translate: `${TRAVEL}px`});
});

test('under Reduce Motion, a dip held before its first frame lands once the hold is resumed', async ({
  page,
}) => {
  // The hold's release without finish plays the held fade out again: the
  // browser starts it then, and the dip lands and fades back in on the clock
  // it resumed on, with no animator call after the release.
  await page.emulateMedia({reducedMotion: 'reduce'});
  await open(page);
  await page.evaluate(travel => {
    (window as unknown as {dip: MotionHandle}).dip = window.animator.animate(
      {x: travel},
      {spring: Motion.springs.navigationPush},
    );
    const held = document.getAnimations();
    for (const animation of held) {
      animation.pause();
    }
    (window as unknown as {held: Animation[]}).held = held;
  }, TRAVEL);
  await page.evaluate(
    async () =>
      new Promise<void>(resolve =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => setTimeout(resolve, 40)),
        ),
      ),
  );
  await page.evaluate(() => {
    for (const animation of (window as unknown as {held: Animation[]}).held) {
      animation.play();
    }
  });
  const read = async () =>
    page.evaluate(() => {
      const box = document.getElementById('box') as HTMLElement;
      const style = getComputedStyle(box);
      return {opacity: Number(style.opacity), translate: style.translate};
    });
  await dipDone(page);
  expect(await read()).toEqual({opacity: 1, translate: `${TRAVEL}px`});
});

test('a spring started right before a block plays in full after it', async ({
  page,
}) => {
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
      (window as unknown as {blocked: MotionHandle}).blocked =
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
  // Wait for the motion, not a wall clock: on a loaded machine the frames
  // after the block reach the screencast later than any fixed wait. The page
  // shows the box a quarter of the way along, then three more frames arrive.
  await page.waitForFunction(
    min =>
      (document.getElementById('box')?.getBoundingClientRect().left ?? 0) > min,
    TRAVEL / 4,
    {polling: 'raf', timeout: 0},
  );
  const seen = cast.frameCount();
  await expect
    .poll(() => cast.frameCount(), {timeout: 0})
    .toBeGreaterThan(seen + 2);
  const startedAt = await page.evaluate(
    async () =>
      performance.timeOrigin +
      (await (window as unknown as {blocked: MotionHandle}).blocked.started),
  );
  const tracked = await trackMarker(page, await cast.stop());
  const xs = tracked
    .filter(f => f.box != null)
    .map(f => ({t: f.t, x: (f.box?.x ?? NaN) - MARKER_INSET}));
  // Judged on the first frame after the block, whatever the frames before
  // it showed: it is at the start of the curve, and the frames after it
  // move on from there.
  const first = xs.find(f => f.t >= busy.to);
  const later = xs.filter(f => f.t >= busy.to + 100);
  test.info().annotations.push({
    type: 'first frame after the block',
    description: JSON.stringify({
      x: first?.x,
      after: first == null ? null : first.t - busy.to,
    }),
  });
  expect(first).toBeDefined();
  // The curve starts after the block, as Core Animation commits it.
  expect(startedAt).toBeGreaterThan(busy.to - FRAME_MS);
  // The first frame after the block shows that curve: no further along than
  // one that started a frame before the block ended, at that frame's own
  // time, however sparse the frames a loaded machine sends. A curve dated at
  // the call is 107 px in by then.
  const atMost = await page.evaluate(
    ({spring, travel, ms}) =>
      Motion.solveSpring(Motion.toSpring(spring), {from: 0, to: travel}).value(
        Math.max(0, ms) / 1000,
      ),
    {
      spring: SLOW,
      travel: TRAVEL,
      ms: (first?.t ?? Infinity) - (busy.to - FRAME_MS),
    },
  );
  expect(first?.x ?? Infinity).toBeLessThanOrEqual(atMost + 1);
  expect(later.length).toBeGreaterThan(0);
  expect(Math.max(...later.map(f => f.x))).toBeGreaterThan((first?.x ?? 0) + 1);
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
    const spring = Motion.springs.quickChange;
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
  expect(result.worstX).toBeLessThan(0.26);
  expect(result.worstOpacity).toBeLessThan(0.0045);
});

test('a role variable set on a scope changes nothing while touch motion stays internal', async ({
  page,
}) => {
  // A page's own style sets the role's variable on a scope; the per-role
  // tables stay internal (spec:AST-094 DEC-15), so both boxes play the
  // table's spring.
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html, body { margin: 0; background: #fff; }
  .box { position: absolute; top: 40px; width: 48px; height: 48px; background: #36c; }
  @scope ([data-astryx-theme="soft"]) { :scope { --motion-springs-settle: 0.8s 0.3; } }
</style>
<div class="box" id="plain" style="left: 0"></div>
<div data-astryx-theme="soft"><div class="box" id="themed" style="left: 80px"></div></div>
<script>${script}</script>`;
  await page.route('http://motion.test/', async route =>
    route.fulfill({contentType: 'text/html', body: html}),
  );
  await page.goto('http://motion.test/');
  const result = await page.evaluate(async () => {
    // Only a registered table's roles resolve: register it as a touch
    // module would, and fail loudly if the role is not there.
    Motion.registerSpringsTable();
    if (Motion.motionRoleOf(Motion.springs.settle)?.id !== 'springs.settle') {
      throw new Error(
        'springs.settle is not a registered role: call registerSpringsTable() first',
      );
    }
    const curves = {
      plain: Motion.solveSpring(Motion.toSpring(Motion.springs.settle), {
        from: 300,
        to: 0,
      }),
      themed: Motion.solveSpring(Motion.toSpring(Motion.springs.settle), {
        from: 300,
        to: 0,
      }),
    };
    const report: Record<string, {worst: number; lowest: number}> = {};
    for (const id of ['plain', 'themed'] as const) {
      const element = document.getElementById(id) as HTMLElement;
      const animator = Motion.createAnimator(element);
      animator.set({y: 300});
      const handle = animator.animate({y: 0}, {spring: Motion.springs.settle});
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
  // Both boxes play the table's (critically damped) spring: neither
  // overshoots.
  expect(result.plain.worst).toBeLessThan(0.26);
  expect(result.themed.worst).toBeLessThan(0.26);
  expect(result.plain.lowest).toBeGreaterThan(-0.5);
  expect(result.themed.lowest).toBeGreaterThan(-0.5);
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

test('a fade-in on an element its stylesheet hides stays visible once it retires', async ({
  page,
}) => {
  await open(page);
  const result = await page.evaluate(
    async spring => {
      const sheet = document.createElement('style');
      sheet.textContent = '.hidden { opacity: 0; }';
      document.head.append(sheet);
      const element = document.createElement('div');
      element.className = 'hidden';
      element.style.cssText =
        'position:absolute;top:120px;left:0;width:48px;height:48px;background:#c63';
      document.body.append(element);
      const animator = Motion.createAnimator(element);
      animator.set({opacity: 0});
      animator.animate({opacity: 1}, {spring});
      await new Promise<void>(resolve => {
        const tick = () => {
          if (element.getAnimations().length === 0) {
            resolve();
          } else {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      });
      // A frame after the retire.
      await new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      return {
        inline: element.style.opacity,
        computed: getComputedStyle(element).opacity,
      };
    },
    {response: 0.3, dampingRatio: 1},
  );
  test.info().annotations.push({
    type: 'after retire',
    description: JSON.stringify(result),
  });
  // The end stays inline over the stylesheet's opacity 0.
  expect(result.computed).toBe('1');
  expect(result.inline).toBe('1');
});

test('a fixed child stays fixed after a motion back to identity', async ({
  page,
}) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const box = document.getElementById('box') as HTMLElement;
    const child = document.createElement('div');
    child.style.cssText =
      'position: fixed; top: 10px; left: 10px; width: 4px; height: 4px;';
    box.appendChild(child);
    const quick = {response: 0.1, dampingRatio: 1};
    await window.animator.animate({x: 120}, {spring: quick}).finished;
    await window.animator.animate({x: 0}, {spring: quick}).finished;
    // At rest: the animation retired and the layer promotion lingered out.
    await new Promise<void>(resolve => {
      const tick = () =>
        box.getAnimations().length === 0 && box.style.willChange === ''
          ? resolve()
          : requestAnimationFrame(tick);
      requestAnimationFrame(tick);
    });
    const rect = child.getBoundingClientRect();
    return {top: rect.top, left: rect.left, translate: box.style.translate};
  });
  // The identity left the element: any translate but none would keep the box
  // (40 px down) its containing block for good.
  expect(result.translate).toBe('');
  expect(result.top).toBe(10);
  expect(result.left).toBe(10);
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
  expect(result.worst).toBeLessThan(0.0045);
  expect(result.held).toBeCloseTo(1, 6);
});

declare global {
  interface Window {
    animator: Animator;
  }
  const Motion: typeof MotionBundle;
}
