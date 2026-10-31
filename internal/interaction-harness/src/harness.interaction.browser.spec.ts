// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file harness.interaction.browser.spec.ts
 * @input Fixture pages written inline (no Storybook), real Chromium/WebKit
 * @output Proof that each harness instrument measures what it claims (the
 *   busy-main-thread proof and the rendering-trace counts with a negative
 *   control beside their positive checks): scripted timestamps reach the
 *   page; a flick flings natively (Chromium); a wheel step arrives as
 *   exactly its deltas, with Control when held, and a pen stroke as trusted
 *   pen pointers with its pressure and times (Chromium); a second finger and
 *   a pinch arrive as distinct pointers; the screencast shows a compositor
 *   animation advancing through a blocked main thread while a rAF animation
 *   freezes; the trace counts zero Layout for a transform animation and one
 *   per frame for a `top` animation; the long-task log records the page's
 *   own long task but not a DevTools evaluate, which the trace counts;
 *   sampled curves
 *   match the oracles, individual transform properties included; a sample at
 *   an end reports the time it was read at; holding takes only running
 *   document-timeline animations, each at its own offset, holds each where it
 *   was read, adds a second hold to the held set without moving the first
 *   hold's times, drops one the page cancels, and releases only them; the
 *   animation-state waits report a running transition and its end, and judge
 *   rest by presented values even while an animation holds its end, and a
 *   watch taken on first contact ignores an animation already running and
 *   keeps the start of one the page cancels when it ends; storyboards write a
 *   sheet and a trace that follows the curve, an endless animation does not
 *   set their length, and a photograph Chromium returns empty is taken again
 *   two frames later; a touch filmstrip keeps scripted event times while a
 *   handler clock sees its pacing; the timer gate holds a component timer
 *   until the filmstrip is done, drops callbacks the page cancels, stamps held
 *   frames with the time they run, and leaves the harness its own frames.
 * @position The harness's own test. A component spec trusts these
 *   instruments; this file is why it may.
 */

import fs from 'node:fs';

import {expect, test, type Page} from '@playwright/test';
import type {CastFrame, TrackedFrame} from './frames';
import {
  animationStoryboard,
  blockMainThread,
  busyWindowProof,
  compareCurve,
  countBetween,
  cubicBezier,
  CONTROL_RGB,
  curveOf,
  drag,
  flick,
  frames,
  freezeTimers,
  holdAnimations,
  installInputLog,
  installLongTaskLog,
  installTimerGate,
  markElement,
  merge,
  parseTransform,
  PARTIAL_LIFT_SKIP,
  pinch,
  pooledBusyProof,
  readInputLog,
  readLongTasks,
  releaseAnimations,
  retakeOnWheelPacing,
  sampleCurve,
  seekAnimations,
  springStep,
  startCompositorTrace,
  startScreencast,
  startBusyControl,
  Storyboard,
  tap,
  thawTimers,
  timeline,
  touchDriver,
  touchStoryboard,
  traceRendering,
  trackMarker,
  waitForAnimation,
  waitForRest,
  watchAnimations,
  webInputDriver,
  WheelPacingError,
  WheelPageStallError,
  PEN_SKIP,
  WHEEL_SKIP,
  withFinger,
  writeEvidence,
} from './index';

const FIXTURE = `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
<style>
  body { margin: 0; font: 14px sans-serif; background: #fff; }
  #pad { position: fixed; inset: 0 0 auto 0; height: 300px; background: #eef; touch-action: none; }
  #box { position: absolute; left: 20px; top: 360px; width: 80px; height: 80px; background: #36c; }
  #scroller { position: absolute; top: 460px; left: 0; right: 0; height: 240px; overflow: auto; }
  .row { height: 48px; border-bottom: 1px solid #ccc; }
</style>
<div id=pad aria-label="pad"></div>
<div id=box></div>
<div id=scroller>${Array.from({length: 200}, (_, i) => `<div class=row>row ${i}</div>`).join('')}</div>`;

// The busy-main-thread proofs' page: one box with room to move 560 px down,
// nothing over it. 560 px in 1,600 ms is about 4.8 px a frame, more than two
// of WebKit's 2 px position steps (README: frame evidence), so every frame's
// motion is resolvable.
const BUSY_FIXTURE = `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
<style>
  body { margin: 0; background: #fff; }
  #box { position: absolute; left: 20px; top: 40px; width: 80px; height: 80px; background: #36c; }
</style>
<div id=box></div>`;

/**
 * The red channel at a CSS-px point in each cast frame (a 16 px square's mean),
 * as a tracked value on x: what a backdrop's dim shows there. Decoded in a
 * scratch page, as `trackMarker` does.
 */
async function brightnessAt(
  page: Page,
  castFrames: readonly CastFrame[],
  {x, y}: {x: number; y: number},
): Promise<TrackedFrame[]> {
  const scratch = await page.context().newPage();
  try {
    const values: number[] = [];
    for (let i = 0; i < castFrames.length; i += 12) {
      const batch = castFrames.slice(i, i + 12);
      values.push(
        ...(await scratch.evaluate(
          async ({items, px, py}) => {
            const out: number[] = [];
            for (const item of items) {
              const blob = await (
                await fetch(`data:image/${item.format};base64,${item.data}`)
              ).blob();
              const bitmap = await createImageBitmap(blob);
              const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
              const context = canvas.getContext('2d');
              if (context == null) {
                throw new Error('no 2d context');
              }
              context.drawImage(bitmap, 0, 0);
              const scale = bitmap.width / item.viewportWidth;
              const {data} = context.getImageData(
                Math.round(px * scale),
                Math.round(py * scale),
                16,
                16,
              );
              let sum = 0;
              for (let o = 0; o < data.length; o += 4) {
                sum += data[o];
              }
              out.push(sum / (data.length / 4));
            }
            return out;
          },
          {
            items: batch.map(f => ({
              data: f.data,
              format: f.format,
              viewportWidth: f.viewportWidth,
            })),
            px: x,
            py: y,
          },
        )),
      );
    }
    return castFrames.map((f, i) => ({
      t: f.t,
      box: {x: values[i], y: 0, width: 1, height: 1},
      pixels: 1,
    }));
  } finally {
    await scratch.close();
  }
}

async function busyFixture(page: Page) {
  await page.route('http://busy.test/', route =>
    route.fulfill({contentType: 'text/html', body: BUSY_FIXTURE}),
  );
  await page.goto('http://busy.test/');
}

// A real navigation (not setContent, whose document.open() erases the window
// listeners the input log installs).
async function fixture(page: Page) {
  await installInputLog(page);
  await page.route('http://harness.test/', route =>
    route.fulfill({contentType: 'text/html', body: FIXTURE}),
  );
  await page.goto('http://harness.test/');
}

test.describe('touch input', () => {
  test('the page receives trusted touches and pointers at the scripted positions and times', async ({
    page,
    browserName,
  }) => {
    await fixture(page);
    const driver = await touchDriver(page);
    const script = drag(
      {x: 100, y: 100},
      {x: 100, y: 220},
      {durationMs: 200, hz: 60, restMs: 120},
    );
    await driver.play(script);
    const log = await readInputLog(page);
    const moves = log.filter(r => r.type === 'pointermove');
    const down = log.find(r => r.type === 'pointerdown');
    const up = log.find(r => r.type === 'pointerup');
    expect(down?.isTrusted).toBe(true);
    expect(down?.pointerType).toBe('touch');
    expect(up, JSON.stringify(log.map(r => r.type))).toBeDefined();
    // (Not `cancelable`: with only passive listeners an engine may dispatch
    // touchmove as non-blocking, which reads cancelable false.)
    expect(
      log.filter(r => r.type === 'touchmove').every(r => r.isTrusted),
    ).toBe(true);
    expect(moves.at(-1)?.y).toBe(220);
    if (browserName === 'chromium') {
      // The scripted 16.67 ms spacing arrives exactly, and the 120 ms rest
      // before the lift is in the timestamps too.
      const deltas = moves
        .slice(1)
        .map((m, i) => m.timeStamp - moves[i].timeStamp);
      for (const delta of deltas) {
        expect(delta).toBeCloseTo(1000 / 60, 0);
      }
      expect(
        (up?.timeStamp ?? NaN) - (moves.at(-1)?.timeStamp ?? NaN),
      ).toBeCloseTo(120, 0);
    } else {
      // WebKit stamps the real dispatch time: real-time pacing keeps it close.
      const deltas = moves
        .slice(1)
        .map((m, i) => m.timeStamp - moves[i].timeStamp);
      const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
      expect(mean).toBeGreaterThan(14);
      expect(mean).toBeLessThan(20);
    }
  });

  test('a flick flings a native scroller, farther for a faster finger', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'injected WebKit touches drive no native scrolling (README: engine limits)',
    );
    await fixture(page);
    const driver = await touchDriver(page);
    const scroller = page.locator('#scroller');
    const distanceFor = async (velocity: number) => {
      await scroller.evaluate(el => (el.scrollTop = 0));
      await driver.play(
        flick(
          {x: 200, y: 680},
          {velocity: {x: 0, y: -velocity}, durationMs: 60, hz: 120},
        ),
      );
      await expect
        .poll(
          async () => {
            const a = await scroller.evaluate(el => el.scrollTop);
            await page.waitForTimeout(150);
            return a === (await scroller.evaluate(el => el.scrollTop));
          },
          {timeout: 8_000},
        )
        .toBe(true);
      return scroller.evaluate(el => el.scrollTop);
    };
    const slow = await distanceFor(800);
    const fast = await distanceFor(2400);
    expect(slow).toBeGreaterThan(48); // it coasted past the finger's own travel
    expect(fast).toBeGreaterThan(slow * 1.8);
  });

  test('lifting one of two fingers releases only that finger', async ({
    page,
  }) => {
    await fixture(page);
    const driver = await touchDriver(page);
    test.skip(!driver.partialLifts, PARTIAL_LIFT_SKIP);
    const first = drag(
      {x: 80, y: 80},
      {x: 80, y: 240},
      {durationMs: 400, hz: 60},
    );
    const second = withFinger(tap({x: 300, y: 120}, {holdMs: 100}), 1, 100);
    await driver.play(merge(first, second));
    const log = await readInputLog(page);
    const [stays, lifts] = log.filter(r => r.type === 'pointerdown');
    const upOf = (down?: {pointerId?: number}) =>
      log.find(r => r.type === 'pointerup' && r.pointerId === down?.pointerId);
    const lifted = upOf(lifts);
    const last = upOf(stays);
    if (stays == null || lifted == null || last == null) {
      throw new Error('expected two fingers down, each released');
    }
    // Released when it lifted (~200 ms in), while the first finger was down.
    expect(lifted.timeStamp).toBeLessThan(last.timeStamp - 150);
    expect(
      log.filter(
        r =>
          r.type === 'pointermove' &&
          r.pointerId === stays.pointerId &&
          r.timeStamp > lifted.timeStamp,
      ).length,
      'the other finger keeps moving',
    ).toBeGreaterThan(5);
    // As iOS sends it: the lift's touchend still lists the finger down.
    expect(log.filter(r => r.type === 'touchend').map(r => r.touches)).toEqual([
      1, 0,
    ]);
  });

  test('a second finger and a pinch arrive as distinct touch pointers', async ({
    page,
  }) => {
    await fixture(page);
    const driver = await touchDriver(page);
    const first = drag(
      {x: 80, y: 80},
      {x: 80, y: 200},
      {durationMs: 300, hz: 60},
    );
    const second = withFinger(tap({x: 300, y: 120}, {holdMs: 100}), 1, 120);
    await driver.play(merge(first, second));
    const downs = (await readInputLog(page, {clear: true})).filter(
      r => r.type === 'pointerdown',
    );
    expect(downs).toHaveLength(2);
    expect(new Set(downs.map(d => d.pointerId)).size).toBe(2);

    await driver.play(
      pinch({
        center: {x: 200, y: 150},
        fromDistance: 60,
        toDistance: 200,
        durationMs: 200,
      }),
    );
    const log = await readInputLog(page);
    expect(log.filter(r => r.type === 'pointerdown')).toHaveLength(2);
    expect(
      Math.max(
        ...log.filter(r => r.type === 'touchmove').map(r => r.touches ?? 0),
      ),
    ).toBe(2);
  });
});

test.describe('frame evidence', () => {
  test('a compositor animation advances every frame through a blocked main thread; a rAF one freezes, whatever the screencast rate', async ({
    page,
  }, testInfo) => {
    await busyFixture(page);
    const box = page.locator('#box');
    await markElement(box, {mode: 'outline'});
    // A loaded runner's compositor skips frames the display-rate bound
    // counts: the component is judged against what the compositor presented
    // in the same window, and the bound's own verdict is recorded beside it.
    const control = await startBusyControl(page);

    // The README's order: the cast, then the animation, then the block once
    // it runs (on the compositor, for the compositor's run).
    const run = async (
      driver: 'compositor' | 'raf',
      everyNthFrame = 1,
      blockMs = 700,
    ) => {
      const cast = await startScreencast(page, {everyNthFrame});
      await box.evaluate((el, how) => {
        el.getAnimations().forEach(a => a.cancel());
        el.style.transform = 'none';
        if (how === 'compositor') {
          el.animate(
            [{transform: 'translateY(0px)'}, {transform: 'translateY(560px)'}],
            {duration: 1600, easing: 'linear'},
          );
        } else {
          const start = performance.now();
          const step = (now: number) => {
            const p = Math.min(1, (now - start) / 1600);
            el.style.transform = `translateY(${560 * p}px)`;
            if (p < 1) {
              requestAnimationFrame(step);
            }
          };
          requestAnimationFrame(step);
        }
      }, driver);
      // A rendering update first: until one commits the cancel, the
      // compositor keeps playing the previous run's animation into the block.
      await page.evaluate(
        () =>
          new Promise<void>(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const window = await blockMainThread(
        page,
        blockMs,
        driver === 'compositor' ? {during: box} : {},
      );
      await page.waitForTimeout(200);
      const frames = await cast.stop();
      const tracked = await trackMarker(page, frames);
      const controlFrames = await trackMarker(page, frames, {rgb: CONTROL_RGB});
      const alone = busyWindowProof(tracked, window, {axis: 'y'});
      return {
        proof: busyWindowProof(tracked, window, {
          axis: 'y',
          control: controlFrames,
        }),
        alone,
      };
    };

    const {proof: compositor, alone: compositorAlone} = await run('compositor');
    testInfo.annotations.push({
      type: 'busy-main-thread compositor',
      description: `${compositor.summary} | without the control: ${compositorAlone.verdict.failures.join('; ') || 'pass'}`,
    });
    expect(compositor.verdict.failures, compositor.summary).toEqual([]);
    expect(compositor.monotonic).toBe(true);
    // Resolvable on the cast's grid: two position steps or more per frame.
    expect(compositor.pxPerFrame).toBeGreaterThanOrEqual(2 * compositor.stepPx);

    const {proof: raf, alone: rafAlone} = await run('raf');
    testInfo.annotations.push({
      type: 'busy-main-thread rAF control',
      description: raf.summary,
    });
    // Frozen for the block: the compositor sends no frame while nothing on
    // screen changes, so at most the frame presented as the block starts
    // moved, and the bound's verdict fails it as the control's does.
    expect(raf.changed).toBeLessThanOrEqual(1);
    expect(raf.longestStallMs).toBeGreaterThan(600);
    expect(raf.verdict.failures.join('\n')).toMatch(
      /moved on [01] of the \d+ frames the control moved/,
    );
    expect(raf.verdict.failures.join('\n')).toMatch(
      /longest stall .* longer than the control's/,
    );
    expect(rafAlone.verdict.pass).toBe(false);
    expect(rafAlone.verdict.failures.join('\n')).toMatch(/longest stall/);

    // The verdict judges the frames the screencast delivered, not its rate:
    // at one frame in six (a loaded machine's ~100 ms), the compositor
    // animation still passes and the rAF one still fails. A 1.4 s block keeps
    // the control's four frames on a runner that presents half the rate.
    const {proof: slow} = await run('compositor', 6, 1400);
    expect(slow.cadenceMs, slow.summary).toBeGreaterThan(60);
    expect(slow.verdict.failures, slow.summary).toEqual([]);
    const {proof: slowRaf} = await run('raf', 6, 1400);
    expect(slowRaf.verdict.pass, slowRaf.summary).toBe(false);
    expect(slowRaf.verdict.failures.join('\n')).toMatch(/longest stall/);
    await control.remove();
  });

  test('frames the screencast skips while the compositor presents them are not a stall; a frozen animation still fails with the compositor record', async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(
      browserName !== 'chromium',
      'compositor traces are Chromium-only (README: engine limits)',
    );
    await busyFixture(page);
    const box = page.locator('#box');
    await markElement(box, {mode: 'outline'});
    const run = async (driver: 'compositor' | 'raf') => {
      // Judged against what the compositor presented in the same window too:
      // a loaded runner's compositor skips frames a display-rate bound counts.
      const control = await startBusyControl(page);
      const cast = await startScreencast(page);
      const compositor = await startCompositorTrace(page);
      // Started once the control, the cast and the trace run, so the whole
      // window lies inside its motion however long they take to start on a
      // loaded runner. The block is long enough to judge a drop of four cast
      // intervals at one frame in six (below).
      await box.evaluate((el, how) => {
        el.getAnimations().forEach(a => a.cancel());
        el.style.transform = 'none';
        if (how === 'compositor') {
          el.animate(
            [{transform: 'translateY(0px)'}, {transform: 'translateY(560px)'}],
            {duration: 3000, easing: 'linear'},
          );
        } else {
          const start = performance.now();
          const step = (now: number) => {
            const p = Math.min(1, (now - start) / 3000);
            el.style.transform = `translateY(${560 * p}px)`;
            if (p < 1) {
              requestAnimationFrame(step);
            }
          };
          requestAnimationFrame(step);
        }
      }, driver);
      await page.waitForTimeout(200);
      const window = await blockMainThread(page, 1200);
      await page.waitForTimeout(200);
      const presented = await compositor.stop();
      const frames = await cast.stop();
      await control.remove();
      const tracked = await trackMarker(page, frames);
      const controlTracked = await trackMarker(page, frames, {
        rgb: CONTROL_RGB,
      });
      return {window, tracked, presented, controlTracked};
    };

    const moving = await run('compositor');
    expect(moving.presented.length).toBeGreaterThan(0);
    // The whole cast, judged with the compositor record: the screencast's and
    // the compositor's own intervals around the block.
    const whole = busyWindowProof(moving.tracked, moving.window, {
      axis: 'y',
      presented: moving.presented,
    });
    const castMs = whole.cadenceMs;
    const drawMs = whole.compositorFrameMs;
    test.skip(drawMs == null, 'no compositor frames recorded around the block');
    // The screencast as a loaded machine delivers it: every frame of four of
    // its own intervals skipped, which the compositor still presented. With
    // the frames either side, a gap of five intervals, over the stall
    // bound's three at the cast's measured rate. The drop sits where the
    // compositor presented steadily (no interval of its own over the stall
    // bound), so the record has frames to excuse it with, and the judged part
    // keeps four of the control's frames outside it.
    const dropMs = 4 * castMs;
    const inner = {from: moving.window.from + 20, to: moving.window.to - 20};
    const draws = [...moving.presented].sort((a, b) => a - b);
    const steady = (from: number, to: number) => {
      const span = draws.filter(t => t >= from && t <= to);
      return (
        span.length >= 2 &&
        span[0] - from <= 3 * (drawMs ?? 0) &&
        to - span[span.length - 1] <= 3 * (drawMs ?? 0) &&
        span.slice(1).every((t, i) => t - span[i] <= 3 * (drawMs ?? 0))
      );
    };
    const middle = (inner.from + inner.to - dropMs) / 2;
    const starts: number[] = [];
    for (
      let t = inner.from + castMs;
      t + dropMs <= inner.to - castMs;
      t += castMs / 2
    ) {
      starts.push(t);
    }
    starts.sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle));
    const from = starts.find(t => steady(t, t + dropMs));
    test.skip(
      inner.to - inner.from < dropMs + 4 * castMs || from == null,
      `no ${dropMs.toFixed(0)} ms span of the block to drop: the screencast delivered a frame every ${castMs.toFixed(0)} ms, the compositor every ${(drawMs ?? 0).toFixed(0)} ms`,
    );
    const to = (from ?? 0) + dropMs;
    const kept = (f: {t: number}) => f.t <= (from ?? 0) || f.t > to;
    const skipped = moving.tracked.filter(kept);
    const alone = busyWindowProof(skipped, moving.window, {axis: 'y'});
    expect(alone.verdict.failures.join('\n'), alone.summary).toMatch(
      /longest stall/,
    );
    // Only the compositor record excuses the drop: with it, the frames the
    // compositor presented there count as skipped by the screencast, more of
    // them than the whole cast had.
    const excused = busyWindowProof(skipped, moving.window, {
      axis: 'y',
      presented: moving.presented,
    });
    expect(excused.recorderSkipped, excused.summary).toBeGreaterThan(
      whole.recorderSkipped,
    );
    // Judged against the busy control, read from the same frames, so it
    // misses the same ones, the component passes.
    const proof = busyWindowProof(skipped, moving.window, {
      axis: 'y',
      control: moving.controlTracked.filter(kept),
    });
    testInfo.annotations.push({
      type: 'busy-main-thread compositor record',
      description: `${excused.summary}; against the control: ${proof.summary}`,
    });
    expect(proof.verdict.failures, proof.summary).toEqual([]);

    // A rAF animation presents no change for the whole block: the record
    // excuses nothing, whatever the compositor drew meanwhile.
    const frozen = await run('raf');
    const still = busyWindowProof(frozen.tracked, frozen.window, {
      axis: 'y',
      presented: frozen.presented,
    });
    testInfo.annotations.push({
      type: 'busy-main-thread rAF control, compositor record',
      description: `${still.summary}; compositor frames inside the block: ${frozen.presented.filter(t => t > frozen.window.from && t < frozen.window.to).length}`,
    });
    // The freeze is still a stall with the record: the element presents no
    // change in the block, so no gap there lies between two moved frames,
    // and the record excuses none of it.
    expect(still.verdict.pass).toBe(false);
    expect(still.verdict.failures.join('\n')).toMatch(/longest stall/);
  });

  test('a block that starts during a just-started transition still lets the compositor advance it', async ({
    page,
  }, testInfo) => {
    // `during` blocks in the frame the transition has run 16 ms. In WebKit
    // the transition reaches the compositor in that frame's rendering update,
    // so a loop inside the rAF callback froze it (2 of 29 frames moved).
    // Linear and longer than the block, so every frame of the block moves two
    // position steps or more and the transition is still running when it
    // ends. The cast shows the box at rest first, so a transition that reaches
    // the screen after the block began is judged from there (onScreenFromMs).
    await busyFixture(page);
    const box = page.locator('#box');
    await markElement(box, {mode: 'outline'});
    // Judged against what the compositor presented in the same window: a
    // loaded runner's compositor skips frames a display-rate bound counts.
    const control = await startBusyControl(page);
    const cast = await startScreencast(page);
    await expect.poll(() => cast.frameCount()).toBeGreaterThan(0);
    await box.evaluate(el => {
      el.style.transition = 'transform 1600ms linear';
      el.getBoundingClientRect();
      el.style.transform = 'translateY(560px)';
    });
    const window = await blockMainThread(page, 700, {
      during: box,
      minProgressMs: 16,
    });
    await waitForRest(box);
    const frames = await cast.stop();
    await control.remove();
    const tracked = await trackMarker(page, frames);
    const proof = busyWindowProof(tracked, window, {
      axis: 'y',
      control: await trackMarker(page, frames, {rgb: CONTROL_RGB}),
    });
    testInfo.annotations.push({
      type: 'busy-main-thread transition',
      description: proof.summary,
    });
    expect(proof.verdict.failures, proof.summary).toEqual([]);
    expect(proof.monotonic).toBe(true);
  });

  test('against a compositor-only control in the same window, a compositor animation passes and a rAF one fails, whatever the screencast rate', async ({
    page,
  }, testInfo) => {
    await busyFixture(page);
    const box = page.locator('#box');
    await markElement(box, {mode: 'outline'});
    const control = await startBusyControl(page);

    const run = async (
      driver: 'compositor' | 'raf',
      everyNthFrame = 1,
      blockMs = 700,
    ) => {
      // Endless, so the animation still runs when the block starts however
      // long a loaded runner takes to start the cast, and wrapping from 560 px
      // back to 0 rather than turning, so every frame changes: two frames
      // straddling a turnaround evenly would read one position.
      await box.evaluate((el, how) => {
        el.getAnimations().forEach(a => a.cancel());
        el.style.transform = 'none';
        if (how === 'compositor') {
          el.animate(
            [{transform: 'translateY(0px)'}, {transform: 'translateY(560px)'}],
            {duration: 1600, easing: 'linear', iterations: Infinity},
          );
        } else {
          const start = performance.now();
          const step = (now: number) => {
            const p = ((now - start) / 1600) % 1;
            el.style.transform = `translateY(${560 * p}px)`;
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      }, driver);
      const cast = await startScreencast(page, {everyNthFrame});
      await page.waitForTimeout(200);
      // The compositor's run is blocked only once it is on the compositor.
      const window = await blockMainThread(
        page,
        blockMs,
        driver === 'compositor' ? {during: box} : {},
      );
      await page.waitForTimeout(200);
      const frames = await cast.stop();
      const tracked = await trackMarker(page, frames);
      const controlFrames = await trackMarker(page, frames, {rgb: CONTROL_RGB});
      const proof = busyWindowProof(tracked, window, {
        axis: 'y',
        control: controlFrames,
      });
      // The judgment without the control, for the record only: on a
      // two-core runner it can fail where the control shows the compositor
      // itself presented no more.
      const alone = busyWindowProof(tracked, window, {axis: 'y'});
      testInfo.annotations.push({
        type: `busy-main-thread ${driver} 1/${everyNthFrame} against the control`,
        description: `${proof.summary} | without the control: ${alone.verdict.failures.join('; ') || 'pass'}`,
      });
      return proof;
    };

    const compositor = await run('compositor');
    expect(compositor.verdict.failures, compositor.summary).toEqual([]);
    expect(compositor.control?.moved).toBeGreaterThanOrEqual(4);

    // The mutant: a main-thread animation freezes while the control moves. A
    // frame presented as the block starts can still show its last step, so
    // it can read as moved on one of the control's frames; never on the rest.
    const raf = await run('raf');
    expect(raf.verdict.pass, raf.summary).toBe(false);
    const rafFailures = raf.verdict.failures.join('\n');
    expect(rafFailures).toMatch(
      /moved on [01] of the \d+ frames the control moved/,
    );
    expect(rafFailures).toMatch(/longest stall .* longer than the control's/);

    // A slower screencast samples the control and the component alike; a
    // 1.4 s block keeps the control's four frames on a loaded runner.
    const slow = await run('compositor', 6, 1400);
    expect(slow.verdict.failures, slow.summary).toEqual([]);
    const slowRaf = await run('raf', 6, 1400);
    expect(slowRaf.verdict.pass, slowRaf.summary).toBe(false);
    await control.remove();
  });

  test("mounted within an open modal dialog, the control leaves the dialog's backdrop animation on the compositor", async ({
    page,
  }) => {
    // A dimming backdrop over a black page: its brightness at a point is the
    // value judged, read from the same frames as the control.
    await page.route('http://backdrop.test/', route =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#000;height:100vh}dialog{width:120px;height:80px;padding:0;border:0;background:#fff}dialog::backdrop{background:rgb(255,255,0);opacity:.2}</style><dialog id="sheet"></dialog>`,
      }),
    );
    await page.goto('http://backdrop.test/');
    const dialog = page.locator('#sheet');
    // The dim runs from the dialog's open, endlessly and wrapping rather than
    // turning, so it is on screen and changing on every frame by the block.
    await dialog.evaluate(el => {
      (el as HTMLDialogElement).showModal();
      el.animate([{opacity: 0.2}, {opacity: 1}], {
        duration: 900,
        easing: 'linear',
        iterations: Infinity,
        pseudoElement: '::backdrop',
      });
    });
    const control = await startBusyControl(page, {within: dialog});
    const cast = await startScreencast(page);
    await page.waitForTimeout(200);
    const window = await blockMainThread(page, 600, {during: dialog});
    await page.waitForTimeout(200);
    const castFrames = await cast.stop();
    await control.remove();
    const controlFrames = await trackMarker(page, castFrames, {
      rgb: CONTROL_RGB,
    });
    const dim = await brightnessAt(page, castFrames, {x: 40, y: 600});
    const proof = busyWindowProof(dim, window, {
      axis: 'x',
      control: controlFrames,
    });
    expect(proof.verdict.failures, proof.summary).toEqual([]);
  });

  test("waitForAnimation and blockMainThread's during never count the control's own animation inside a dialog", async ({
    page,
  }) => {
    await page.setContent(
      '<dialog id="d" style="width:200px;height:200px">still</dialog>',
    );
    await page.evaluate(() =>
      (document.getElementById('d') as HTMLDialogElement).showModal(),
    );
    const dialog = page.locator('#d');
    const control = await startBusyControl(page, {within: dialog});
    // The dialog animates nothing of its own: both gates keep waiting.
    await expect(
      blockMainThread(page, 100, {during: dialog, timeout: 600}),
    ).rejects.toThrow(/no animation started/);
    await expect(waitForAnimation(dialog, {timeout: 600})).rejects.toThrow();
    // Its own animation answers both.
    await dialog.evaluate(el =>
      el.animate([{opacity: 1}, {opacity: 0.5}], {duration: 2000}),
    );
    await waitForAnimation(dialog);
    await blockMainThread(page, 100, {during: dialog});
    await control.remove();
  });

  test('a hold that starts before the block is judged from its first presented change inside it; a single change and then a freeze still fails', async ({
    page,
  }) => {
    await busyFixture(page);
    const box = page.locator('#box');
    await markElement(box, {mode: 'outline'});
    const control = await startBusyControl(page);
    // On the compositor: a move, a 300 ms hold (as WebKit holds a sheet's
    // just-started release on screen), then a move; or one jump inside the
    // block and nothing after it.
    const run = async (
      keyframes: Keyframe[],
      options: KeyframeAnimationOptions,
    ) => {
      const cast = await startScreencast(page);
      await page.waitForTimeout(150);
      await box.evaluate(
        (el, [frames, timing]) => {
          el.getAnimations().forEach(a => a.cancel());
          el.animate(frames, timing);
        },
        [keyframes, options] as const,
      );
      // The block starts inside the hold, which began before it.
      const window = await blockMainThread(page, 600, {
        during: box,
        minProgressMs: 700,
      });
      await page.waitForTimeout(150);
      const frames = await cast.stop();
      return busyWindowProof(await trackMarker(page, frames), window, {
        axis: 'y',
        control: await trackMarker(page, frames, {rgb: CONTROL_RGB}),
      });
    };
    const held = await run(
      [
        {transform: 'translateY(0px)', offset: 0},
        {transform: 'translateY(100px)', offset: 0.3},
        {transform: 'translateY(100px)', offset: 0.45},
        {transform: 'translateY(560px)', offset: 1},
      ],
      {duration: 2000, easing: 'linear'},
    );
    expect(held.verdict.failures, held.summary).toEqual([]);
    const jumpThenFreeze = await run(
      [{transform: 'translateY(0px)'}, {transform: 'translateY(50px)'}],
      {duration: 800, easing: 'steps(1, end)', fill: 'forwards'},
    );
    expect(jumpThenFreeze.verdict.pass, jumpThenFreeze.summary).toBe(false);
    await control.remove();
  });

  test('a block too short to judge alone is judged over pooled runs: a compositor animation passes, and a rAF one fails, timed or frame-counted', async ({
    page,
  }, testInfo) => {
    await busyFixture(page);
    const box = page.locator('#box');
    await markElement(box, {mode: 'outline'});
    const control = await startBusyControl(page);

    // Six 70 ms blocks: each judged part (20 ms margins, 30 ms) holds at most
    // three frames even at WebKit's 14 ms cast, under the four one window
    // needs, as a short fade's does.
    const runs = async (
      driver: 'compositor' | 'raf' | 'counted 1' | 'counted 2',
    ) => {
      await box.evaluate((el, how) => {
        el.getAnimations().forEach(a => a.cancel());
        el.style.transform = 'none';
        if (how === 'compositor') {
          // Endless, wrapping from 560 px back to 0 rather than turning, so
          // every frame changes: two frames straddling a turnaround evenly
          // would read one position.
          el.animate(
            [{transform: 'translateY(0px)'}, {transform: 'translateY(560px)'}],
            {duration: 1600, easing: 'linear', iterations: Infinity},
          );
        } else if (how === 'raf') {
          const start = performance.now();
          // The same endless run on the main thread.
          const step = (now: number) => {
            const p = ((now - start) / 1600) % 1;
            el.style.transform = `translateY(${560 * p}px)`;
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        } else {
          // A fixed step a frame, counted rather than timed: after a block it
          // goes on from where it stood instead of catching up.
          const px = how === 'counted 1' ? 1 : 2;
          let y = 0;
          let direction = 1;
          const step = () => {
            if (y + direction * px > 560 || y + direction * px < 0) {
              direction = -direction;
            }
            y += direction * px;
            el.style.transform = `translateY(${y}px)`;
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      }, driver);
      const cast = await startScreencast(page);
      await page.waitForTimeout(200);
      const windows = [];
      for (let i = 0; i < 6; i += 1) {
        windows.push(await blockMainThread(page, 70));
        await page.waitForTimeout(150);
      }
      const frames = await cast.stop();
      const tracked = await trackMarker(page, frames);
      const controlFrames = await trackMarker(page, frames, {rgb: CONTROL_RGB});
      return windows.map(window => ({tracked, control: controlFrames, window}));
    };

    const compositor = await runs('compositor');
    const single = busyWindowProof(
      compositor[0].tracked,
      compositor[0].window,
      {axis: 'y', control: compositor[0].control},
    );
    expect(single.verdict.failures.join('\n'), single.summary).toMatch(
      /too little in this window to judge/,
    );
    const pooled = pooledBusyProof(compositor, {axis: 'y'});
    testInfo.annotations.push({
      type: 'busy-pooled compositor',
      description: pooled.summary,
    });
    expect(pooled.verdict.failures, pooled.summary).toEqual([]);

    // The mutant: a main-thread animation freezes in every block.
    const raf = pooledBusyProof(await runs('raf'), {axis: 'y'});
    testInfo.annotations.push({
      type: 'busy-pooled raf',
      description: raf.summary,
    });
    expect(raf.verdict.pass, raf.summary).toBe(false);
    expect(raf.verdict.failures.join('\n')).toMatch(
      /moved on \d+ of the \d+ frames the control moved over 6 runs/,
    );

    // A frame-counted loop stalls in every block too and then steps on, one
    // cast step a frame at 1 px: its stall is longer than its runs before it.
    for (const counted of ['counted 1', 'counted 2'] as const) {
      const proof = pooledBusyProof(await runs(counted), {axis: 'y'});
      testInfo.annotations.push({
        type: `busy-pooled ${counted}`,
        description: proof.summary,
      });
      expect(proof.verdict.pass, `${counted}: ${proof.summary}`).toBe(false);
    }
    await control.remove();
  });

  test('a block never starts on an animation that is not on the compositor yet', async ({
    page,
  }, testInfo) => {
    // An animation created in the frame the helper looks is still pending (not
    // committed to the compositor). A block that started on it then froze it
    // in Chromium: no presented frame moved.
    await busyFixture(page);
    const box = page.locator('#box');
    await markElement(box, {mode: 'outline'});
    await box.evaluate(el => {
      el.style.willChange = 'transform';
    });
    // Judged against what the compositor presented in the same window: a
    // loaded runner's compositor skips frames a display-rate bound counts.
    const control = await startBusyControl(page);
    const cast = await startScreencast(page);
    // A rAF loop registered before the helper's tick runs ahead of it in every
    // frame; on its 12th frame it creates the animation, and the helper's tick
    // looks in that same frame.
    await box.evaluate(el => {
      let n = 0;
      const loop = () => {
        n += 1;
        if (n === 12) {
          el.animate(
            [{transform: 'translateY(0px)'}, {transform: 'translateY(560px)'}],
            {duration: 1600, easing: 'linear'},
          );
          return;
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    const window = await blockMainThread(page, 700, {
      during: box,
      minProgressMs: 0,
    });
    await waitForRest(box);
    const frames = await cast.stop();
    await control.remove();
    const tracked = await trackMarker(page, frames);
    const proof = busyWindowProof(tracked, window, {
      axis: 'y',
      control: await trackMarker(page, frames, {rgb: CONTROL_RGB}),
    });
    testInfo.annotations.push({
      type: 'busy-main-thread pending animation',
      description: proof.summary,
    });
    expect(proof.verdict.failures, proof.summary).toEqual([]);
    expect(proof.monotonic).toBe(true);
  });

  test('the trace counts no Layout for a transform animation and one per frame for `top`', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'rendering traces are Chromium-only (README: engine limits)',
    );
    await fixture(page);
    const box = page.locator('#box');
    // Count the animation's steady middle: starting and ending it may lay out once each.
    const animate = async (property: 'transform' | 'top') => {
      let started = 0;
      const trace = await traceRendering(page, async () => {
        started = await box.evaluate((el, prop) => {
          const keyframes =
            prop === 'transform'
              ? [
                  {transform: 'translateY(0px)'},
                  {transform: 'translateY(200px)'},
                ]
              : [{top: '360px'}, {top: '560px'}];
          el.animate(keyframes, {duration: 600});
          return performance.timeOrigin + performance.now();
        }, property);
        await page.waitForTimeout(700);
      });
      return countBetween(trace, started + 100, started + 500);
    };
    const transform = await animate('transform');
    const top = await animate('top');
    expect(transform.Layout ?? 0).toBe(0);
    expect(transform.Paint ?? 0).toBe(0);
    // ~24 frames in 400 ms: one layout per frame.
    expect(top.Layout ?? 0).toBeGreaterThan(18);
  });

  test('the compositor record refuses another open page, whose frames it could not tell apart', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'the compositor record is a Chromium trace (README: engine limits)',
    );
    await fixture(page);
    // Another page animating: its presented frames would be credited to
    // this one, so the record refuses to start.
    const other = await page.context().newPage();
    await other.setContent(
      '<style>@keyframes spin{to{transform:rotate(360deg)}}</style><div style="width:50px;height:50px;background:red;animation:spin 1s linear infinite"></div>',
    );
    await expect(startCompositorTrace(page)).rejects.toThrow(
      /another page is open as the trace starts/,
    );
    await other.close();
    // A page opened mid-trace: stop() refuses too, whether it is still open
    // or closed again before the record stops.
    const record = await startCompositorTrace(page);
    const late = await page.context().newPage();
    await expect(record.stop()).rejects.toThrow(
      /another page opened during the record/,
    );
    await late.close();
    const brief = await startCompositorTrace(page);
    const spinner = await page.context().newPage();
    await spinner.setContent(
      '<style>@keyframes spin{to{transform:rotate(360deg)}}</style><div style="width:50px;height:50px;background:red;animation:spin 1s linear infinite"></div>',
    );
    await page.waitForTimeout(200);
    await spinner.close();
    await expect(brief.stop()).rejects.toThrow(
      /another page opened during the record/,
    );
    // In another context too.
    const browser = page.context().browser();
    if (browser != null) {
      const elsewhere = await startCompositorTrace(page);
      const context = await browser.newContext();
      await (await context.newPage()).close();
      await context.close();
      await expect(elsewhere.stop()).rejects.toThrow(
        /another page opened during the record/,
      );
    }
    // Alone, it records.
    const alone = await startCompositorTrace(page);
    await page.waitForTimeout(100);
    await expect(alone.stop()).resolves.toBeInstanceOf(Array);
  });

  test('the long-task log fails closed when it never ran on the document', async ({
    page,
  }) => {
    // No installLongTaskLog before navigating: an empty answer would read as
    // "no long task", so it throws instead.
    await fixture(page);
    await expect(readLongTasks(page)).rejects.toThrow(
      /not running on this document/,
    );
  });

  test("the long-task log records the page's own long task but not a DevTools evaluate, which the trace reports apart", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'the Long Tasks API and rendering traces are Chromium-only',
    );
    await installLongTaskLog(page);
    await fixture(page);
    // The page's own task: a timer that spins 120 ms.
    const own = await page.evaluate(
      () =>
        new Promise<{from: number; to: number}>(resolve => {
          setTimeout(() => {
            const from = performance.timeOrigin + performance.now();
            const end = performance.now() + 120;
            while (performance.now() < end) {
              // spin
            }
            resolve({from, to: performance.timeOrigin + performance.now()});
          }, 0);
        }),
    );
    await frames(page, 2);
    const recorded = await readLongTasks(page, own);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].durationMs).toBeGreaterThanOrEqual(110);
    // A DevTools evaluate that spins 300 ms: the trace reports it apart from
    // the page's long tasks, and the log never sees it.
    let block = {from: 0, to: 0};
    const trace = await traceRendering(page, async () => {
      block = await blockMainThread(page, 300);
    });
    await frames(page, 2);
    const inBlock = (t: {start: number}) =>
      t.start < block.to && t.start >= block.from - 20;
    expect(
      trace.devtoolsTasks.some(t => t.durationMs >= 290 && inBlock(t)),
    ).toBe(true);
    expect(trace.longTasks.filter(inBlock)).toEqual([]);
    expect(await readLongTasks(page, block)).toEqual([]);
  });

  test("a harness read inside a trace is not the page's long task, while a test's own evaluate is, whether it calls the page directly or sets it off", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'rendering traces are Chromium-only (README: engine limits)',
    );
    // Enough animated rows that describing their keyframes takes a DevTools
    // task over 50 ms.
    const rows = Array.from(
      {length: 1200},
      (_, i) => `<div class="row">row ${i}</div>`,
    ).join('');
    await page.setContent(
      `<style>.row { height: 4px; animation: slide 2s linear infinite; } @keyframes slide { from { transform: translateX(0); } 25% { transform: translateX(4px); } 50% { transform: translateX(0); } 75% { transform: translateX(4px); } to { transform: translateX(0); } }</style><button id="slow">slow</button><div id="list">${rows}</div>`,
    );
    const slow = page.locator('#slow');
    await slow.evaluate(el =>
      el.addEventListener('click', () => {
        const end = performance.now() + 60;
        while (performance.now() < end) {
          // spin
        }
      }),
    );
    // Page code a test can call directly, as through a story's own API.
    await page.evaluate(() => {
      (window as unknown as {pageWork: (ms: number) => void}).pageWork = (
        ms: number,
      ) => {
        const end = performance.now() + ms;
        while (performance.now() < end) {
          // spin
        }
      };
    });
    await frames(page, 3);
    const now = () =>
      page.evaluate(() => performance.timeOrigin + performance.now());
    const read = {from: 0, to: 0};
    const click = {from: 0, to: 0};
    const direct = {from: 0, to: 0};
    let timer = {from: 0, to: 0};
    const trace = await traceRendering(page, async () => {
      read.from = await now();
      await waitForAnimation(page.locator('#list'));
      read.to = await now();
      // On a slow machine each frame of 1,200 running rows is a long task of
      // the page's own; the windows below hold only their own work.
      await page.evaluate(() => document.getElementById('list')?.remove());
      await frames(page, 2);
      // The page's own task: a timer that spins 60 ms.
      timer = await page.evaluate(
        () =>
          new Promise<{from: number; to: number}>(resolve => {
            setTimeout(() => {
              const from = performance.timeOrigin + performance.now();
              const end = performance.now() + 60;
              while (performance.now() < end) {
                // spin
              }
              resolve({from, to: performance.timeOrigin + performance.now()});
            }, 0);
          }),
      );
      // Page script run inside a DevTools evaluate: a 60 ms click handler.
      click.from = await now();
      await slow.evaluate(el => (el as HTMLElement).click());
      click.to = await now();
      // Page code a test's evaluate calls directly: 60 ms of the page's work.
      direct.from = await now();
      await page.evaluate(() =>
        (window as unknown as {pageWork: (ms: number) => void}).pageWork(60),
      );
      direct.to = await now();
    });
    const within = (w: {from: number; to: number}) => (t: {start: number}) =>
      t.start >= w.from - 20 && t.start < w.to;
    // The read itself is set apart. The rows' frames around it may be long
    // tasks too, the page's own: they stay in longTasks.
    expect(trace.devtoolsTasks.some(within(read))).toBe(true);
    expect(
      trace.longTasks.some(t => within(timer)(t) && t.durationMs >= 55),
    ).toBe(true);
    expect(
      trace.longTasks.some(t => within(click)(t) && t.durationMs >= 55),
    ).toBe(true);
    expect(
      trace.longTasks.some(t => within(direct)(t) && t.durationMs >= 55),
    ).toBe(true);
    expect(trace.devtoolsTasks.filter(within(direct))).toEqual([]);
  });
});

test.describe('wheel and pen input', () => {
  test("at a device-pixel ratio of 3, a wheel step reaches the page as exactly its delta, where Playwright's own wheel delivers a third of it in Chromium", async ({
    browser,
    browserName,
  }) => {
    // A desktop context at DPR 3: the phone context has no wheel in WebKit.
    const context = await browser.newContext({
      viewport: {width: 402, height: 714},
      deviceScaleFactor: 3,
      isMobile: false,
      hasTouch: false,
    });
    try {
      const page = await context.newPage();
      await page.route('http://wheel.test/', route =>
        route.fulfill({
          contentType: 'text/html',
          body: `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="margin:0;height:3000px"><script>window.__deltas=[];addEventListener('wheel',e=>__deltas.push(e.deltaY),{passive:true});</script>`,
        }),
      );
      await page.goto('http://wheel.test/');
      // Read without draining, so a wrong delta shows in the failure.
      const seen = () =>
        page.evaluate(() =>
          (window as unknown as {__deltas: number[]}).__deltas.slice(),
        );
      expect(await page.evaluate(() => window.devicePixelRatio)).toBe(3);

      const driver = await webInputDriver(page);
      expect(driver.wheels).toBe(true);
      await driver.wheel({x: 200, y: 300, dy: 100});
      // Read once the page has the step, not at a time.
      await expect.poll(seen).toEqual([100]);

      // Playwright's own wheel, pinned: Chromium divides it by the ratio.
      await page.mouse.move(200, 300);
      await page.mouse.wheel(0, 100);
      await expect
        .poll(async () => (await seen())[1])
        .toBeCloseTo(browserName === 'chromium' ? 100 / 3 : 100, 5);
    } finally {
      await context.close();
    }
  });

  test("a wheel step that misses the main document throws its named error within the limit, while a frozen timer gate holds the page's timers too", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: {width: 402, height: 714},
      isMobile: false,
      hasTouch: false,
    });
    try {
      const page = await context.newPage();
      // A frame over the whole page: a step there lands in the frame's
      // document, never the main one.
      await page.route('http://wheel-miss.test/', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><body style="margin:0;height:3000px"><iframe srcdoc="<body style=height:3000px>" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>',
        }),
      );
      await page.goto('http://wheel-miss.test/');
      await installTimerGate(page);
      const driver = await webInputDriver(page);
      test.skip(!driver.wheels, WHEEL_SKIP);
      await freezeTimers(page);
      // Over the frame, the main document receives nothing, and the driver's
      // own limit, not the test's timeout, ends the wait.
      await expect(driver.wheel({x: 200, y: 300, dy: 100})).rejects.toThrow(
        /did not receive the wheel step/,
      );
      await thawTimers(page);
    } finally {
      await context.close();
    }
  });

  test('a wheel burst reaches the page as one run with its whole delta and no gap past the 100 ms a proof allows within a wheel gesture, re-taken once when the runner stalls it', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: {width: 402, height: 714},
      isMobile: false,
      hasTouch: false,
    });
    try {
      const page = await context.newPage();
      // A gesture's listener: not passive, and it takes every step.
      await page.route('http://wheel-burst.test/', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><body style="margin:0;height:3000px"><script>window.__deltas=[];addEventListener("wheel",e=>{__deltas.push(e.deltaX);e.preventDefault();},{passive:false});</script>',
        }),
      );
      await page.goto('http://wheel-burst.test/');
      const driver = await webInputDriver(page);
      test.skip(!driver.wheels, WHEEL_SKIP);
      // A proof allows 100 ms between the steps of one wheel gesture: sent on
      // its schedule, the run stays one gesture however long each step's
      // round trip takes, and a runner stall past that bound is re-taken once.
      await retakeOnWheelPacing(test.info(), async () => {
        await page.evaluate(() => {
          (window as unknown as {__deltas: number[]}).__deltas = [];
        });
        const {receivedSteps, receivedGapsMs} = await driver.wheelBurst({
          x: 200,
          y: 300,
          steps: Array.from({length: 20}, () => ({dx: 40})),
          maxGapMs: 100,
        });
        // Every pixel arrives, in steps of 40 px or, where the engine
        // coalesced steps the page was still handling, their sums.
        const deltas = await page.evaluate(
          () => (window as unknown as {__deltas: number[]}).__deltas,
        );
        expect(deltas.reduce((sum, d) => sum + d, 0)).toBe(800);
        expect(
          deltas.every(d => d > 0 && d % 40 === 0),
          String(deltas),
        ).toBe(true);
        expect(receivedSteps).toBe(deltas.length);
        expect(receivedGapsMs).toHaveLength(receivedSteps - 1);
      });
    } finally {
      await context.close();
    }
  });

  test('a wheel burst sent slower than its maxGapMs throws WheelPacingError, in both engines', async ({
    browser,
  }) => {
    // The negative control for the pacing check the re-take relies on: steps
    // 180 ms apart, on a page that handles each at once, against a 100 ms
    // bound.
    const context = await browser.newContext({
      viewport: {width: 402, height: 714},
      isMobile: false,
      hasTouch: false,
    });
    try {
      const page = await context.newPage();
      await page.route('http://wheel-slow-burst.test/', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><body style="margin:0;height:3000px"><script>addEventListener("wheel",e=>e.preventDefault(),{passive:false});</script>',
        }),
      );
      await page.goto('http://wheel-slow-burst.test/');
      const driver = await webInputDriver(page);
      test.skip(!driver.wheels, WHEEL_SKIP);
      await expect(
        driver.wheelBurst({
          x: 200,
          y: 300,
          steps: Array.from({length: 4}, () => ({dx: 10})),
          everyMs: 180,
          maxGapMs: 100,
        }),
      ).rejects.toBeInstanceOf(WheelPacingError);
    } finally {
      await context.close();
    }
  });

  test('a burst whose steps the dispatch spaces past maxGapMs throws WheelPacingError over a page whose listener takes 30 ms, in both engines', async ({
    browser,
  }) => {
    // The page is free well before each next step arrives, so the gap is the
    // dispatch's, not the page's.
    const context = await browser.newContext({
      viewport: {width: 402, height: 714},
      isMobile: false,
      hasTouch: false,
    });
    try {
      const page = await context.newPage();
      await page.route('http://wheel-busy-listener.test/', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><body style="margin:0;height:3000px"><script>addEventListener("wheel",e=>{e.preventDefault();const end=performance.now()+30;while(performance.now()<end){}},{passive:false});</script>',
        }),
      );
      await page.goto('http://wheel-busy-listener.test/');
      const driver = await webInputDriver(page);
      test.skip(!driver.wheels, WHEEL_SKIP);
      await expect(
        driver.wheelBurst({
          x: 200,
          y: 300,
          steps: Array.from({length: 4}, () => ({dx: 10})),
          everyMs: 125,
          maxGapMs: 100,
        }),
      ).rejects.toBeInstanceOf(WheelPacingError);
    } finally {
      await context.close();
    }
  });

  test('a page whose wheel listener holds its main thread splits a burst itself: never a runner stall, never re-taken', async ({
    browser,
    browserName,
  }) => {
    const context = await browser.newContext({
      viewport: {width: 402, height: 714},
      isMobile: false,
      hasTouch: false,
    });
    try {
      const page = await context.newPage();
      // Each step blocks the main thread for 150 ms, past the 100 ms bound.
      await page.route('http://wheel-stalling-page.test/', route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><body style="margin:0;height:3000px"><script>addEventListener("wheel",e=>{e.preventDefault();const end=performance.now()+150;while(performance.now()<end){}},{passive:false});</script>',
        }),
      );
      await page.goto('http://wheel-stalling-page.test/');
      const driver = await webInputDriver(page);
      test.skip(!driver.wheels, WHEEL_SKIP);
      const testInfo = {
        annotations: [] as {type: string; description?: string}[],
      };
      const attempts: number[] = [];
      const outcome = await retakeOnWheelPacing(testInfo, async n => {
        attempts.push(n);
        return driver.wheelBurst({
          x: 200,
          y: 300,
          steps: Array.from({length: 4}, () => ({dx: 10})),
          maxGapMs: 100,
        });
      }).then(
        () => 'resolved',
        (error: unknown) => error,
      );
      expect(outcome).not.toBeInstanceOf(WheelPacingError);
      expect(attempts).toEqual([1]);
      expect(testInfo.annotations).toEqual([]);
      if (browserName === 'webkit') {
        // WebKit dispatches the next step only once the page is free, so the
        // page's stall widens the gaps, and the error names it.
        expect(outcome).toBeInstanceOf(WheelPageStallError);
        expect(String(outcome)).toMatch(/the page split the run/);
      }
    } finally {
      await context.close();
    }
  });

  /** A non-passive wheel listener: Chromium then waits for the page itself. */
  const listenNonPassively = (page: Page) =>
    page.evaluate(() =>
      window.addEventListener('wheel', () => {}, {passive: false}),
    );
  /** The wheel steps the page received. */
  const wheelsOf = async (page: Page) =>
    (await readInputLog(page)).filter(r => r.type === 'wheel');

  test('a wheel step reaches the page as exactly its deltas, trusted, with Control when held, by the time wheel() resolves on a page whose wheel listeners are all passive', async ({
    page,
  }) => {
    await fixture(page);
    const driver = await webInputDriver(page);
    test.skip(!driver.wheels, WHEEL_SKIP);
    await driver.wheel({x: 60, y: 520, dy: 120});
    // The input log listens passively, so Chromium answers the dispatch
    // before the page has the step: read right after the call.
    expect(await wheelsOf(page)).toHaveLength(1);
    await driver.wheel({x: 60, y: 520, dx: 30, dy: -40, ctrl: true});
    const wheels = await wheelsOf(page);
    expect(wheels).toHaveLength(2);
    // Chromium's phone context has a device scale factor of 3: the driver
    // multiplies back what Chromium divides by, so the page sees CSS px.
    expect(wheels[0]).toMatchObject({
      isTrusted: true,
      deltaX: 0,
      deltaY: 120,
      deltaMode: 0,
      ctrlKey: false,
      x: 60,
      y: 520,
    });
    expect(wheels[1]).toMatchObject({
      isTrusted: true,
      deltaX: 30,
      deltaY: -40,
      deltaMode: 0,
      ctrlKey: true,
    });
  });

  test('a wheel step reaches the page by the time wheel() resolves with a non-passive wheel listener too', async ({
    page,
  }) => {
    await fixture(page);
    const driver = await webInputDriver(page);
    test.skip(!driver.wheels, WHEEL_SKIP);
    await listenNonPassively(page);
    await driver.wheel({x: 60, y: 520, dy: 80});
    expect(await wheelsOf(page)).toHaveLength(1);
    await driver.wheel({x: 60, y: 520, dy: -20, ctrl: true});
    const wheels = await wheelsOf(page);
    expect(wheels).toHaveLength(2);
    expect(wheels[0]).toMatchObject({
      isTrusted: true,
      deltaY: 80,
      ctrlKey: false,
    });
    expect(wheels[1]).toMatchObject({
      isTrusted: true,
      deltaY: -20,
      ctrlKey: true,
    });
  });

  test('a pen stroke reaches the page as trusted pen pointers, with its pressure, at its scripted times', async ({
    page,
  }) => {
    await fixture(page);
    const driver = await webInputDriver(page);
    test.skip(!driver.pens, PEN_SKIP);
    await driver.pen([
      {x: 100, y: 100, t: 0, pressure: 0.3},
      {x: 100, y: 140, t: 50, pressure: 0.6},
      {x: 100, y: 180, t: 100, pressure: 0.6},
    ]);
    const log = await readInputLog(page);
    const down = log.find(r => r.type === 'pointerdown');
    const moves = log.filter(r => r.type === 'pointermove');
    const up = log.find(r => r.type === 'pointerup');
    expect(down).toMatchObject({
      isTrusted: true,
      pointerType: 'pen',
      x: 100,
      y: 100,
    });
    expect(down?.pressure).toBeCloseTo(0.3, 2);
    expect(moves.at(-1)).toMatchObject({pointerType: 'pen', y: 180});
    expect(moves.at(-1)?.pressure).toBeCloseTo(0.6, 2);
    expect(up).toMatchObject({isTrusted: true, pointerType: 'pen'});
    // The scripted 100 ms between the first and last points reach the page.
    expect(
      (moves.at(-1)?.timeStamp ?? NaN) - (down?.timeStamp ?? NaN),
    ).toBeCloseTo(100, 0);
  });

  test('a stroke sent right after a navigation presses where it is scripted', async ({
    page,
  }) => {
    // The driver exists before the page navigates, and the stroke goes out
    // the moment the page has loaded: the press must not take the previous
    // document's page scale (about:blank's, in the phone project).
    const driver = await webInputDriver(page);
    test.skip(!driver.pens, PEN_SKIP);
    await fixture(page);
    await driver.pen([
      {x: 100, y: 100, t: 0, pressure: 0.5},
      {x: 100, y: 120, t: 30, pressure: 0.5},
    ]);
    const down = (await readInputLog(page)).find(r => r.type === 'pointerdown');
    expect(down).toMatchObject({pointerType: 'pen', x: 100, y: 100});
  });

  test('says which inputs it has: WebKit in a phone context has no wheel and no pen', async ({
    page,
    browserName,
  }) => {
    await fixture(page);
    const driver = await webInputDriver(page);
    if (browserName === 'chromium') {
      expect({wheels: driver.wheels, pens: driver.pens}).toEqual({
        wheels: true,
        pens: true,
      });
      return;
    }
    expect({wheels: driver.wheels, pens: driver.pens}).toEqual({
      wheels: false,
      pens: false,
    });
    await expect(driver.wheel({x: 60, y: 520, dy: 120})).rejects.toThrow(
      WHEEL_SKIP,
    );
    await expect(driver.pen([{x: 100, y: 100, t: 0}])).rejects.toThrow(
      PEN_SKIP,
    );
  });

  test.describe('in a desktop context', () => {
    test.use({isMobile: false, hasTouch: false, deviceScaleFactor: 1});

    test('a wheel step reaches the page as exactly its deltas in both engines', async ({
      page,
    }) => {
      await fixture(page);
      const driver = await webInputDriver(page);
      expect(driver.wheels).toBe(true);
      await driver.wheel({x: 60, y: 520, dy: 120});
      expect(await wheelsOf(page)).toHaveLength(1);
      await driver.wheel({x: 60, y: 520, dx: -25, dy: 0, ctrl: true});
      const wheels = await wheelsOf(page);
      expect(wheels).toHaveLength(2);
      expect(wheels[0]).toMatchObject({
        isTrusted: true,
        deltaX: 0,
        deltaY: 120,
        deltaMode: 0,
        ctrlKey: false,
      });
      expect(wheels[1]).toMatchObject({
        isTrusted: true,
        deltaX: -25,
        deltaY: 0,
        deltaMode: 0,
        ctrlKey: true,
      });
    });
  });
});

test.describe('curve sampling', () => {
  test('a CSS transition samples onto its cubic-bezier to 0.05 px', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    await box.evaluate(el => {
      el.style.transition = 'transform 400ms cubic-bezier(0.24, 1, 0.4, 1)';
      void (el as HTMLElement).offsetWidth;
      el.style.transform = 'translateY(200px)';
    });
    const held = await holdAnimations(page, box);
    expect(held).toHaveLength(1);
    expect(held[0].kind).toBe('CSSTransition');
    const samples = curveOf(
      await sampleCurve(box, timeline(400)),
      'translateY',
    );
    const ease = cubicBezier(0.24, 1, 0.4, 1);
    const result = compareCurve(samples, t => 200 * ease(t / 400), 0.05);
    expect(result.maxError, JSON.stringify(result.worst)).toBeLessThanOrEqual(
      0.05,
    );
  });

  test('a spring baked into linear() matches the SwiftUI spring oracle', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    const spring = {response: 0.4, dampingFraction: 0.75};
    const duration = 1200;
    await box.evaluate(
      (el, {stops, ms}) => {
        el.animate(
          [{transform: 'translateX(0px)'}, {transform: 'translateX(200px)'}],
          {duration: ms, easing: `linear(${stops})`},
        );
      },
      {
        stops: timeline(duration, 4)
          .map(t => springStep(spring, t).toFixed(6))
          .join(', '),
        ms: duration,
      },
    );
    await holdAnimations(page, box);
    const samples = curveOf(
      await sampleCurve(box, timeline(duration, 1000 / 60)),
      'translateX',
    );
    // linear() draws chords between the 4 ms stops: at most h²/8 · |x''| =
    // 0.004² / 8 · 200 · (2π / 0.4)² ≈ 0.1 px off the exact oracle.
    const result = compareCurve(
      samples,
      t => 200 * springStep(spring, t),
      0.15,
    );
    expect(result.maxError, JSON.stringify(result.worst)).toBeLessThanOrEqual(
      0.15,
    );
    expect(Math.max(...samples.map(s => s.value))).toBeGreaterThan(200); // the overshoot is presented
  });
});

test.describe('holding', () => {
  test('a sample at an end reports the time it was read at', async ({page}) => {
    await fixture(page);
    const box = page.locator('#box');
    await box.evaluate(el =>
      el.animate(
        [{transform: 'translateY(0px)'}, {transform: 'translateY(200px)'}],
        {duration: 300, easing: 'linear'},
      ),
    );
    await holdAnimations(page, box);
    const samples = await sampleCurve(box, [0, 150, 300]);
    // Read just inside the end, and labelled so.
    expect(samples.at(-1)).toMatchObject({t: 300, presentedAt: 299.5});
    const result = compareCurve(
      curveOf(samples, 'translateY'),
      t => (200 * t) / 300,
      0.05,
    );
    expect(result.maxError, JSON.stringify(result.worst)).toBeLessThanOrEqual(
      0.05,
    );
    await releaseAnimations(page);
  });

  test('only running document-timeline animations are held, each at its own offset', async ({
    page,
  }) => {
    await fixture(page);
    // Besides #box: a finished fade, an animation the page paused, one on a
    // scroll timeline, and a second runner started 100 ms after #box's.
    const startGap = await page.evaluate(async () => {
      const make = (id: string) => {
        const el = document.createElement('div');
        el.id = id;
        el.style.cssText =
          'position:absolute;left:0;top:300px;width:40px;height:40px;background:#c63';
        document.body.append(el);
        return el;
      };
      make('finished').animate([{opacity: 0}, {opacity: 1}], {
        duration: 50,
        fill: 'both',
      });
      const paused = make('paused').animate(
        [{transform: 'translateX(0px)'}, {transform: 'translateX(100px)'}],
        {duration: 1000},
      );
      paused.pause();
      paused.currentTime = 500;
      const timelines = window as unknown as {
        ScrollTimeline?: new (options: object) => AnimationTimeline;
      };
      if (timelines.ScrollTimeline != null) {
        new Animation(
          new KeyframeEffect(make('scrolled'), [{opacity: 0}, {opacity: 1}], {
            duration: 1000,
          }),
          new timelines.ScrollTimeline({source: document.scrollingElement}),
        ).play();
      }
      await new Promise(resolve => setTimeout(resolve, 120));
      const run = (el: Element | null) =>
        el?.animate(
          [{transform: 'translateX(0px)'}, {transform: 'translateX(300px)'}],
          {duration: 600, easing: 'linear'},
        );
      const box = run(document.getElementById('box'));
      const gap = new Promise(resolve => setTimeout(resolve, 100));
      // #box's first frame comes late, as on a loaded machine: its start time
      // resolves then, so the runners' offset is the difference of their start
      // times, not the timer's 100 ms.
      const until = performance.now() + 60;
      while (performance.now() < until) {
        // Busy: no frame runs.
      }
      await gap;
      const later = run(make('later'));
      await Promise.all([box?.ready, later?.ready]);
      return Number(later?.startTime) - Number(box?.startTime);
    });
    const held = await holdAnimations(page);
    expect(held.map(a => a.target)).toEqual(['div#box', 'div#later']);
    const [first, later] = held;
    expect(first.offsetMs).toBe(0);
    expect(startGap).toBeGreaterThan(0);
    expect(later.offsetMs).toBeCloseTo(startGap, 0);
    const x = (id: string) =>
      page
        .locator(`#${id}`)
        .evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41);
    expect(await seekAnimations(page, 300)).toBe(300);
    expect(await x('box')).toBeCloseTo(150, 1);
    expect(await x('later')).toBeCloseTo(
      (300 * (300 - later.offsetMs)) / 600,
      1,
    );
    // The finished fade kept its end value; the paused animation stays put.
    expect(
      await page
        .locator('#finished')
        .evaluate(el => getComputedStyle(el).opacity),
    ).toBe('1');
    await releaseAnimations(page);
    await page.waitForTimeout(100);
    expect(
      await page.evaluate(() => {
        const animation = document.getElementById('paused')?.getAnimations()[0];
        return [animation?.playState, Number(animation?.currentTime)];
      }),
    ).toEqual(['paused', 500]);
  });

  test("a sample is labelled from its own element's animations, per channel", async ({
    page,
  }) => {
    await fixture(page);
    // #box moves for 300 ms and fades for 400 ms; another element runs longer.
    await page.evaluate(() => {
      const box = document.getElementById('box');
      box?.animate(
        [{transform: 'translateX(0px)'}, {transform: 'translateX(300px)'}],
        {duration: 300, easing: 'linear'},
      );
      box?.animate([{opacity: 1}, {opacity: 0}], {
        duration: 400,
        easing: 'linear',
      });
      const other = document.createElement('div');
      other.style.cssText =
        'position:absolute;top:300px;width:40px;height:40px';
      document.body.append(other);
      other.animate([{opacity: 0}, {opacity: 1}], {duration: 600});
    });
    await holdAnimations(page);
    const samples = await sampleCurve(page.locator('#box'), [0, 150, 300]);
    // The move is read just inside its end, the fade where it is.
    expect(samples.at(-1)?.presentedAtFor).toEqual({
      transform: 299.5,
      opacity: 300,
    });
    const move = compareCurve(curveOf(samples, 'translateX'), t => t, 0.05);
    expect(move.maxError, JSON.stringify(move.worst)).toBeLessThanOrEqual(0.05);
    const fade = compareCurve(
      curveOf(samples, 'opacity'),
      t => 1 - t / 400,
      0.002,
    );
    expect(fade.maxError, JSON.stringify(fade.worst)).toBeLessThanOrEqual(
      0.002,
    );
    await releaseAnimations(page);
  });

  test("a pseudo-element's animation does not label its element's samples", async ({
    page,
  }) => {
    await fixture(page);
    // #box moves for 300 ms; its ::after fades for 600 ms.
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = "#box::after { content: ''; display: block; }";
      document.head.append(style);
      const box = document.getElementById('box');
      box?.animate(
        [{transform: 'translateX(0px)'}, {transform: 'translateX(300px)'}],
        {duration: 300, easing: 'linear'},
      );
      box?.animate([{opacity: 1}, {opacity: 0}], {
        duration: 600,
        pseudoElement: '::after',
      });
    });
    await holdAnimations(page);
    const samples = await sampleCurve(page.locator('#box'), [0, 150, 300]);
    // The move is read just inside its own end, not at the ::after's time.
    expect(samples.at(-1)?.presentedAt).toBe(299.5);
    await releaseAnimations(page);
  });

  test('a percentage translate resolves against the unrounded border box, and a calc() is refused', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    await box.evaluate(el => {
      el.style.width = '80.6px';
      el.style.height = '40.4px';
      el.animate([{translate: '0% 0%'}, {translate: '100% 50%'}], {
        duration: 300,
        easing: 'linear',
      });
    });
    await holdAnimations(page, box);
    const [mid] = await sampleCurve(box, [150]);
    expect(mid.transform.translateX).toBeCloseTo(40.3, 2);
    expect(mid.transform.translateY).toBeCloseTo(10.1, 2);
    // Finished, so no frame can pass between this release and the next
    // animation with the first one still running.
    await releaseAnimations(page, {finish: true});

    await box.evaluate(el => {
      el.animate(
        [
          {translate: 'calc(10% + 5px) 0px'},
          {translate: 'calc(20% + 5px) 0px'},
        ],
        {duration: 300, easing: 'linear'},
      );
    });
    await holdAnimations(page, box);
    await expect(sampleCurve(box, [150])).rejects.toThrow(
      /cannot resolve translate/,
    );
    await releaseAnimations(page);
  });

  test('a reversed run counts its progress from its end, and a faster playback rate is read on the timeline by waits, seeks and samples', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    // Reversed, the run starts at its end: progress counts down from there,
    // so a wait for 100 ms of it returns once the run has presented that much.
    const watch = await watchAnimations(box);
    await box.evaluate(el => {
      el.animate([{translate: '0px 0px'}, {translate: '100px 0px'}], {
        duration: 1000,
        easing: 'linear',
      }).reverse();
    });
    await watch.started({minProgressMs: 100});
    const presented = await box.evaluate(el => {
      const [animation] = el.getAnimations();
      return (
        Number(animation.effect?.getComputedTiming().endTime ?? 0) -
        Number(animation.currentTime ?? 0)
      );
    });
    expect(presented).toBeGreaterThanOrEqual(100);
    await box.evaluate(el => el.getAnimations().forEach(a => a.finish()));

    // At playback rate 2 a 1,000 ms curve runs 500 ms: its interval, and a
    // seek or sample at t reads the curve at 2t.
    const fast = await watchAnimations(box);
    await box.evaluate(el => {
      const animation = el.animate(
        [{translate: '0px 0px'}, {translate: '100px 0px'}],
        {duration: 1000, easing: 'linear'},
      );
      animation.playbackRate = 2;
    });
    const [running] = await fast.started();
    expect(running.to - running.from).toBeCloseTo(500, 0);
    await holdAnimations(page, box);
    await seekAnimations(page, 125);
    const x = await box.evaluate(
      el =>
        new DOMMatrix(getComputedStyle(el).transform).m41 +
        Number.parseFloat(getComputedStyle(el).translate || '0'),
    );
    expect(x).toBeCloseTo(25, 0);
    const [sample] = await sampleCurve(box, [250]);
    expect(sample.transform.translateX).toBeCloseTo(50, 0);
    await releaseAnimations(page, {finish: true});
  });

  test('a held end is solved through a cubic-bézier effect easing, a reversed one reads to the full end, and a rotate about x composes on its axis', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    // Each run lasts long enough for the hold to reach it while it runs: on a
    // loaded runner the hold read the page as late as 2.4 s after the run was
    // made, past the end of a 1 s run.
    const RUN_MS = 10_000;
    await box.evaluate((el, duration) => {
      el.animate(
        [
          {translate: '0px 0px', offset: 0},
          {translate: '100px 0px', offset: 0.5},
          {translate: '100px 0px', offset: 1},
        ],
        {duration, easing: 'cubic-bezier(0.42, 0, 1, 1)'},
      );
    }, RUN_MS);
    const [held] = await holdAnimations(page, box);
    // The keyframe offset 0.5 is progress, not half the time: the run starts
    // where the eased progress reaches 0.5.
    const ease = cubicBezier(0.42, 0, 1, 1);
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 60; i += 1) {
      const mid = (lo + hi) / 2;
      if (ease(mid) < 0.5) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    expect(held.curveEndMs).toBeCloseTo(lo * RUN_MS, 0);
    expect(held.curveEndMs).toBeGreaterThan(0.6 * RUN_MS);
    await releaseAnimations(page, {finish: true});

    // Played in reverse, the held run is where the motion starts: the curve
    // runs to the full end.
    await box.evaluate((el, duration) => {
      el.animate(
        [
          {translate: '0px 0px', offset: 0},
          {translate: '100px 0px', offset: 0.5},
          {translate: '100px 0px', offset: 1},
        ],
        {duration, easing: 'linear', direction: 'reverse'},
      );
    }, RUN_MS);
    const [reversed] = await holdAnimations(page, box);
    expect(reversed.curveEndMs).toBeCloseTo(RUN_MS, 0);
    await releaseAnimations(page, {finish: true});

    // One reversed by `reverse()` (a negative playback rate) is reported as
    // starting when it did, running its whole curve, and is refused by a
    // hold, which seeks curves forward only.
    const watch = await watchAnimations(box);
    const begunAt = await box.evaluate(async (el, duration) => {
      const animation = el.animate(
        [
          {translate: '0px 0px', offset: 0},
          {translate: '100px 0px', offset: 0.5},
          {translate: '100px 0px', offset: 1},
        ],
        {duration, easing: 'linear'},
      );
      animation.reverse();
      await animation.ready;
      // When it began, by its own clock read at one instant: going backward
      // it starts at its end, so its current time has come down from there
      // by as much as the timeline has moved since.
      const end = Number(animation.effect?.getComputedTiming().endTime ?? 0);
      return (
        performance.timeOrigin +
        Number(document.timeline.currentTime) -
        (end - Number(animation.currentTime)) / Math.abs(animation.playbackRate)
      );
    }, RUN_MS);
    const [running] = await watch.started();
    // Both from the engine's own instants: within the timeline's rounding.
    expect(Math.abs(running.from - begunAt)).toBeLessThanOrEqual(1);
    expect(running.to - running.from).toBeCloseTo(RUN_MS, -1);
    await expect(holdAnimations(page, box)).rejects.toThrow(/runs backward/);
    await box.evaluate(el => el.getAnimations().forEach(a => a.finish()));

    // A property keyed only before the held run, and a last keyframe short of
    // offset 1, each get an implicit end frame: the curve runs to its end.
    for (const keyframes of [
      [
        {translate: '0px 0px', opacity: 0, offset: 0},
        {translate: '100px 0px', offset: 0.5},
        {translate: '100px 0px', offset: 1},
      ],
      [
        {translate: '0px 0px', offset: 0},
        {translate: '100px 0px', offset: 0.5},
        {translate: '100px 0px', offset: 0.8},
      ],
    ]) {
      await box.evaluate(
        (el, {frames, duration}) => {
          el.animate(frames, {duration, easing: 'linear'});
        },
        {frames: keyframes, duration: RUN_MS},
      );
      const [moving] = await holdAnimations(page, box);
      expect(moving.curveEndMs).toBeCloseTo(RUN_MS, 0);
      await releaseAnimations(page, {finish: true});
    }

    await box.evaluate((el, duration) => {
      el.animate([{rotate: 'x 0deg'}, {rotate: 'x 60deg'}], {
        duration,
        easing: 'linear',
      });
    }, RUN_MS);
    await holdAnimations(page, box);
    const [end] = await sampleCurve(box, [RUN_MS]);
    // About x, nothing turns in the plane: no z rotation, and y shrinks by
    // cos 60°.
    expect(end.transform.rotate).toBeCloseTo(0, 1);
    expect(end.transform.scaleY).toBeCloseTo(0.5, 2);
    await releaseAnimations(page, {finish: true});
  });

  test('a hold stays where it was read, not a frame later', async ({page}) => {
    await fixture(page);
    await page.evaluate(() => {
      document
        .getElementById('box')
        ?.animate(
          [{transform: 'translateX(0px)'}, {transform: 'translateX(300px)'}],
          {duration: 1000, easing: 'linear'},
        );
    });
    const box = page.locator('#box');
    await waitForAnimation(box, {minProgressMs: 50});
    const [held] = await holdAnimations(page, box);
    // Two frames later, the held animation is still where the hold read it.
    const after = await box.evaluate(
      el =>
        new Promise<number>(resolve =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              resolve(Number(el.getAnimations()[0]?.currentTime)),
            ),
          ),
        ),
    );
    expect(held.heldAtMs).not.toBeNull();
    expect(Math.abs(after - (held.heldAtMs ?? 0))).toBeLessThan(0.5);
    await releaseAnimations(page);
  });

  test('a run held while its resume is still pending keeps its place through its playback rate: a seek to the hold leaves it where it was held', async ({
    page,
  }) => {
    await fixture(page);
    // #box runs at rate 1; a second run at rate 2 was paused 400 ms into its
    // curve and is resumed by the hold's own first read of the timeline, so
    // its resume is still pending (no start time yet) when the hold takes it.
    // It covers its 400 ms of curve in 200 ms of timeline. Both run long
    // enough for the hold to reach them on a loaded runner, where a hold can
    // read the page seconds after the runs were made.
    await page.evaluate(async () => {
      const frames = [
        {transform: 'translateX(0px)'},
        {transform: 'translateX(300px)'},
      ];
      document
        .getElementById('box')
        ?.animate(frames, {duration: 60_000, easing: 'linear'});
      const other = document.createElement('div');
      other.id = 'faster';
      other.style.cssText =
        'position:absolute;left:0;top:300px;width:40px;height:40px;background:#c63';
      document.body.append(other);
      const faster = other.animate(frames, {
        duration: 60_000,
        easing: 'linear',
      });
      faster.playbackRate = 2;
      faster.pause();
      faster.currentTime = 400;
      await new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      // The hold reads the timeline's time once, just before it lists the
      // page's animations: resumed there, the run is pending when listed. No
      // other read of the timeline's time comes between (the animation
      // recorder reads the clock and the animations, never the timeline).
      // The read is caught on the prototype that defines it, which lives as
      // long as the page: a property set on the timeline object itself is
      // lost when the engine collects and recreates its wrapper.
      let owner: object | null = Object.getPrototypeOf(document.timeline);
      while (
        owner != null &&
        Object.getOwnPropertyDescriptor(owner, 'currentTime') == null
      ) {
        owner = Object.getPrototypeOf(owner);
      }
      const real =
        owner == null
          ? undefined
          : Object.getOwnPropertyDescriptor(owner, 'currentTime');
      if (owner == null || real?.get == null) {
        throw new Error('no currentTime getter on the timeline');
      }
      const prototype = owner;
      const read = real.get;
      Object.defineProperty(prototype, 'currentTime', {
        configurable: true,
        get(this: AnimationTimeline) {
          Object.defineProperty(prototype, 'currentTime', real);
          faster.play();
          return read.call(this);
        },
      });
    });
    const held = await holdAnimations(page);
    expect(held.map(a => a.target)).toEqual(['div#box', 'div#faster']);
    const [box, faster] = held;
    expect(faster.heldAtMs).toBe(400);
    // The moment of the hold, from #box's own place: a seek there leaves
    // every held run where the hold read it.
    await seekAnimations(page, (box.heldAtMs ?? 0) + box.offsetMs);
    const at = await page.evaluate(() =>
      ['box', 'faster'].map(id =>
        Number(document.getElementById(id)?.getAnimations()[0]?.currentTime),
      ),
    );
    expect(Math.abs(at[0] - (box.heldAtMs ?? 0))).toBeLessThanOrEqual(1);
    expect(Math.abs(at[1] - 400)).toBeLessThanOrEqual(1);
    await releaseAnimations(page);
  });

  test('a second hold adds to the held set, and releasing resumes both', async ({
    page,
  }) => {
    await fixture(page);
    await page.evaluate(() => {
      document
        .getElementById('box')
        ?.animate(
          [{transform: 'translateX(0px)'}, {transform: 'translateX(300px)'}],
          {duration: 300, easing: 'linear', fill: 'forwards'},
        );
      const other = document.createElement('div');
      other.id = 'other';
      document.body.append(other);
      other.animate([{opacity: 0}, {opacity: 1}], {
        duration: 300,
        fill: 'forwards',
      });
    });
    const box = page.locator('#box');
    expect(await holdAnimations(page, box)).toHaveLength(1);
    expect(await holdAnimations(page, page.locator('#other'))).toHaveLength(1);
    await releaseAnimations(page);
    // The first hold was released too: the move runs to its end, and rest is
    // its end, not the frame it was held on.
    await waitForRest(box);
    expect(await box.evaluate(el => getComputedStyle(el).transform)).toBe(
      'matrix(1, 0, 0, 1, 300, 0)',
    );
    expect(
      await page.evaluate(
        () =>
          document.getAnimations().filter(a => a.playState === 'paused').length,
      ),
    ).toBe(0);
  });

  test("a later hold of an earlier-started animation keeps the first hold's times", async ({
    page,
  }) => {
    await fixture(page);
    // #early starts before #box's 60 s linear move to 300 px. Each start time
    // resolves at the first frame after its animation is made, which a
    // starved page can hold back past any timer, so #box is made 100 ms after
    // #early's start has resolved, and the gap is read from the two starts.
    // Both run long enough for the holds to reach them on a loaded runner,
    // where a hold read the page as late as 10 s after the runs were made.
    const startGap = await page.evaluate(async () => {
      const early = document.createElement('div');
      early.id = 'early';
      document.body.append(early);
      const fade = early.animate([{opacity: 0}, {opacity: 1}], {
        duration: 120_000,
      });
      await fade.ready;
      await new Promise(resolve => setTimeout(resolve, 100));
      const move = document
        .getElementById('box')
        ?.animate(
          [{transform: 'translateX(0px)'}, {transform: 'translateX(300px)'}],
          {duration: 60_000, easing: 'linear'},
        );
      await move?.ready;
      return Number(fade.startTime) - Number(move?.startTime);
    });
    const box = page.locator('#box');
    await waitForAnimation(box);
    // The later-started element is held first.
    const [first] = await holdAnimations(page, box);
    const [later] = await holdAnimations(page, page.locator('#early'));
    const samples = await sampleCurve(box, [0, 15_000, 30_000]);
    // Unrounded: at 0.005 px a ms, sampling from an origin shifted by the
    // start gap (over 100 ms) moves a sample by 0.5 px or more, while a seek
    // lands within the engines' time rounding of the requested time.
    [0, 75, 150].forEach((x, i) =>
      expect(samples[i].transform.translateX).toBeCloseTo(x, 1),
    );
    // A later hold's earlier start has a negative offset, the difference of
    // the two starts; the origin stays.
    expect(first.offsetMs).toBe(0);
    expect(startGap).toBeLessThan(-50);
    expect(later.offsetMs).toBeCloseTo(startGap, 0);
    await releaseAnimations(page);
  });

  test('a held transition the page retargets is dropped, not revived', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    await box.evaluate(el => {
      el.style.transition = 'transform 300ms linear';
      el.getBoundingClientRect();
      el.style.transform = 'translateX(300px)';
    });
    await waitForAnimation(box);
    expect(await holdAnimations(page, box)).toHaveLength(1);
    // The page sends the box back: the held transition is cancelled, and a
    // new one runs from where the box is.
    await box.evaluate(el => {
      const w = window as unknown as {__cancelled: Animation};
      w.__cancelled = el.getAnimations()[0];
      el.style.transform = 'none';
    });
    const state = () =>
      page.evaluate(() => {
        const w = window as unknown as {
          __cancelled: Animation;
          __harnessHeld: Animation[];
        };
        return {
          cancelled: w.__cancelled.playState,
          held: w.__harnessHeld.length,
        };
      });
    await seekAnimations(page, 150);
    expect(await state()).toEqual({cancelled: 'idle', held: 0});
    await releaseAnimations(page);
    await waitForRest(box);
    expect(await state()).toEqual({cancelled: 'idle', held: 0});
    expect(await box.evaluate(el => getComputedStyle(el).transform)).toBe(
      'none',
    );
  });

  test('finishing resumes an animation that repeats forever and still clears the held set', async ({
    page,
  }) => {
    await fixture(page);
    await page.evaluate(() => {
      const box = document.getElementById('box');
      box?.animate([{rotate: '0deg'}, {rotate: '360deg'}], {
        duration: 800,
        iterations: Infinity,
      });
      const fade = document.createElement('div');
      fade.id = 'fade';
      document.body.append(fade);
      fade.animate([{opacity: 0}, {opacity: 1}], {duration: 300});
    });
    expect(await holdAnimations(page)).toHaveLength(2);
    await releaseAnimations(page, {finish: true});
    expect(
      await page.evaluate(() => ({
        spinner: document.getElementById('box')?.getAnimations()[0]?.playState,
        fade: document.getElementById('fade')?.getAnimations().length,
        held: (window as unknown as {__harnessHeld: Animation[]}).__harnessHeld
          .length,
      })),
    ).toEqual({spinner: 'running', fade: 0, held: 0});
  });
});

test.describe('animation state', () => {
  test('waitForAnimation reports a running transition and waitForRest resolves after it', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    await box.evaluate(el => {
      el.style.transition = 'transform 300ms linear';
      void (el as HTMLElement).offsetWidth;
      el.style.transform = 'translateY(100px)';
    });
    const [running] = await waitForAnimation(box);
    expect(running.kind).toBe('CSSTransition');
    expect(running.name).toBe('transform');
    expect(running.durationMs).toBe(300);
    expect(running.to - running.from).toBeCloseTo(300, 0);
    await waitForRest(box);
    const settledAt = await page.evaluate(
      () => performance.timeOrigin + performance.now(),
    );
    expect(settledAt).toBeGreaterThanOrEqual(running.to);
    const transform = await box.evaluate(el => getComputedStyle(el).transform);
    expect(parseTransform(transform).translateY).toBeCloseTo(100, 1);
  });

  test("waitForAnimation's progress starts after a transition's delay", async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    await box.evaluate(el => {
      el.style.transition = 'transform 300ms linear 200ms';
      void (el as HTMLElement).offsetWidth;
      el.style.transform = 'translateY(100px)';
    });
    await waitForAnimation(box, {minProgressMs: 50});
    // 50 ms along the curve: past the 200 ms delay, not inside it.
    const currentTime = await box.evaluate(el =>
      Number(el.getAnimations()[0]?.currentTime),
    );
    expect(currentTime).toBeGreaterThanOrEqual(250);
    await waitForRest(box);
  });

  test('waitForAnimation reports a short animation that ended before it looked', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    await waitForRest(box);
    await box.evaluate(el => {
      el.style.transition = 'transform 60ms linear';
      void (el as HTMLElement).offsetWidth;
      el.style.transform = 'translateY(40px)';
    });
    // A cold page answers late: the transition is over before the first look.
    await page.waitForTimeout(250);
    const [ended] = await waitForAnimation(box);
    expect(ended.kind).toBe('CSSTransition');
    expect(ended.durationMs).toBe(60);
    expect(ended.finishedAt).not.toBeNull();
    expect(ended.finishedAt ?? 0).toBeGreaterThanOrEqual(ended.to - 1);
  });

  test("a watch taken before the action catches an entrance on the page's first contact", async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    const watch = await watchAnimations(box);
    await box.evaluate(el =>
      el.animate([{opacity: 0}, {opacity: 1}], {duration: 50}),
    );
    await page.waitForTimeout(250);
    const [entrance] = await watch.started();
    expect(entrance.kind).toBe('Animation');
    expect(entrance.durationMs).toBe(50);
    expect(entrance.finishedAt).not.toBeNull();
  });

  test("a watch taken on the page's first contact ignores an animation already running", async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    // An endless spinner, started before the harness has touched the page.
    await box.evaluate(el =>
      el.animate([{rotate: '0deg'}, {rotate: '360deg'}], {
        duration: 1000,
        iterations: Infinity,
      }),
    );
    const watch = await watchAnimations(box);
    await expect(watch.started({timeout: 300})).rejects.toThrow(
      /no animation started/,
    );
    await box.evaluate(el =>
      el.animate([{opacity: 1}, {opacity: 0.5}], {duration: 300}),
    );
    const started = await watch.started();
    expect(started.map(a => a.durationMs)).toEqual([300]);
  });

  test('a wait answers with the animation the action started, not one that finished before it', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    const frames = [{opacity: 0.2}, {opacity: 1}];
    // The recorder runs and is armed from here.
    await waitForRest(box);
    // A short one runs and ends; then the action starts a longer one, still
    // pending when the wait first looks.
    await box.evaluate(
      (el, keyframes) => el.animate(keyframes, {duration: 40}).finished,
      frames,
    );
    await box.evaluate((el, keyframes) => {
      el.animate(keyframes, {duration: 1000});
    }, frames);
    const [found] = await waitForAnimation(box);
    expect(found.durationMs).toBe(1000);
    await box.evaluate(el => el.getAnimations().forEach(a => a.finish()));
  });

  test('a scroll-timeline animation in scope does not hold up a wait', async ({
    page,
  }) => {
    await fixture(page);
    const scroller = page.locator('#scroller');
    await waitForRest(scroller);
    // A row driven by its scroller's timeline (it moves only on scroll), and
    // a short document animation that ends.
    await scroller.evaluate(el => {
      const [row, other] = [...el.children] as HTMLElement[];
      row.animate([{opacity: 0.5}, {opacity: 1}], {
        timeline: new ScrollTimeline({source: el}),
      });
      // Scrolled to its end, the scroll-driven one has finished too: it is
      // not a finished curve either.
      el.scrollTop = el.scrollHeight;
      return other.animate([{opacity: 0.2}, {opacity: 1}], {duration: 40})
        .finished;
    });
    const [found] = await waitForAnimation(scroller, {timeout: 2000});
    expect(found.durationMs).toBe(40);
    expect(found.finishedAt).not.toBeNull();
  });

  test('a watch taken right after a style change does not report that change', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    await waitForRest(box);
    // The step: a transition the next style read creates.
    await box.evaluate(el => {
      el.style.transition = 'opacity 300ms linear';
      el.style.opacity = '0.5';
    });
    const watch = await watchAnimations(box);
    await expect(watch.started({timeout: 200})).rejects.toThrow(
      /waitForAnimation/,
    );
    await box.evaluate(el => el.getAnimations().forEach(a => a.finish()));
  });

  test('an exit whose element the page removes at its end is still reported', async ({
    page,
  }) => {
    await fixture(page);
    await page.evaluate(() => {
      const wrap = document.createElement('div');
      wrap.id = 'wrap';
      const leaf = document.createElement('div');
      leaf.id = 'leaf';
      leaf.style.cssText = 'width:20px;height:20px;background:#c33';
      wrap.append(leaf);
      document.body.append(wrap);
    });
    const wrap = page.locator('#wrap');
    const watch = await watchAnimations(wrap);
    await page.evaluate(() => {
      const leaf = document.getElementById('leaf') as HTMLElement;
      const exit = leaf.animate([{opacity: 1}, {opacity: 0}], {duration: 60});
      exit.finished.then(() => leaf.remove());
    });
    await expect
      .poll(() => page.evaluate(() => document.getElementById('leaf') == null))
      .toBe(true);
    const [exit] = await watch.started();
    expect(exit.durationMs).toBe(60);
    expect(exit.finishedAt).not.toBeNull();
  });

  test('a wait on an element no longer in the document rejects at its own timeout', async ({
    page,
  }) => {
    await fixture(page);
    await page.evaluate(() => {
      const gone = document.createElement('div');
      gone.id = 'gone';
      document.body.append(gone);
    });
    const gone = page.locator('#gone');
    const watch = await watchAnimations(gone);
    await page.evaluate(() => document.getElementById('gone')?.remove());
    for (const wait of [
      () => watch.started({timeout: 300}),
      () => waitForAnimation(gone, {timeout: 300}),
      () => waitForRest(gone, {timeout: 300}),
    ]) {
      const startedAt = Date.now();
      await expect(wait()).rejects.toThrow(/not in the document/);
      expect(Date.now() - startedAt).toBeLessThan(3_000);
    }
  });

  test('a watch reports only what started after it', async ({page}) => {
    await fixture(page);
    const box = page.locator('#box');
    await box.evaluate(el =>
      el.animate([{opacity: 0}, {opacity: 1}], {duration: 40}),
    );
    await page.waitForTimeout(150);
    const watch = await watchAnimations(box);
    await expect(watch.started({timeout: 300})).rejects.toThrow(
      /no animation started/,
    );
    await box.evaluate(el =>
      el.animate([{opacity: 1}, {opacity: 0.5}], {duration: 70}),
    );
    const started = await watch.started();
    expect(started.map(a => a.durationMs)).toEqual([70]);
  });

  test('an entrance the page cancels when it ends keeps its start', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    await page.addStyleTag({
      content:
        '@keyframes enter { from { opacity: 0 } to { opacity: 1 } }' +
        ' .entering { animation: enter 60ms linear }',
    });
    const watch = await watchAnimations(box);
    // The page's time origin, where a lost start lands, is well before the
    // trigger.
    await page.waitForTimeout(200);
    // Removing the class on animationend cancels the finished CSS animation,
    // which nulls its startTime.
    const triggeredAt = await box.evaluate(el => {
      el.addEventListener(
        'animationend',
        () => el.classList.remove('entering'),
        {once: true},
      );
      el.classList.add('entering');
      return performance.timeOrigin + performance.now();
    });
    await expect
      .poll(() => box.evaluate(el => el.classList.contains('entering')))
      .toBe(false);
    const [entrance] = await watch.started();
    expect(entrance.kind).toBe('CSSAnimation');
    expect(entrance.finishedAt).not.toBeNull();
    // It started on a frame after the trigger, not at the page's time origin.
    expect(entrance.from).toBeGreaterThan(triggeredAt - 17);
    expect(entrance.from).toBeLessThan(triggeredAt + 500);
    expect(entrance.to - entrance.from).toBeCloseTo(60, 3);
    expect(entrance.finishedAt ?? 0).toBeGreaterThanOrEqual(entrance.to - 1);
  });

  test('a CSS animation or transition whose element the page removes at its end is dated from its start', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    // A CSS animation is recorded from its start event or a frame that sees
    // it running: one that starts and ends between two frames of a page that
    // has not rendered yet is never seen, so the page renders first and the
    // exit spans several frames.
    await page.evaluate(
      () =>
        new Promise(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    for (const kind of ['animation', 'transition'] as const) {
      // Watched through its container: the element is gone when it is read.
      const watch = await watchAnimations(box);
      const startedAt = await box.evaluate(
        async (el, how) =>
          new Promise<number>(resolve => {
            const style = document.createElement('style');
            style.textContent =
              '@keyframes exit-fade { from { opacity: 1 } to { opacity: 0 } }';
            document.head.append(style);
            const child = document.createElement('div');
            child.style.cssText = 'width:20px;height:20px;background:#36c';
            el.append(child);
            if (how === 'animation') {
              child.style.animation = 'exit-fade 200ms linear';
            } else {
              child.style.transition = 'opacity 200ms linear';
              // Resolve the starting value first, so the change transitions.
              child.style.opacity = getComputedStyle(child).opacity;
              void child.offsetWidth;
              child.style.opacity = '0';
            }
            // Its start time as the engine set it, read from the animation
            // itself, held from its creation: at its finish event or at its
            // end event, whichever first has it (WebKit resolves it after the
            // start event, Chromium cancels it once the page removes the
            // element), and before the page removes the element.
            const animation = child.getAnimations()[0];
            let start: number | null = null;
            const note = () => {
              if (start == null && animation?.startTime != null) {
                start = Number(animation.startTime);
              }
            };
            animation?.addEventListener('finish', note);
            child.addEventListener(`${how}end`, () => {
              note();
              child.remove();
              style.remove();
              resolve(
                start == null ? Number.NaN : performance.timeOrigin + start,
              );
            });
          }),
        kind,
      );
      const [exit] = await watch.started();
      expect(exit.finishedAt, kind).not.toBeNull();
      // Both from the engine's own instants: within the timeline's rounding.
      expect(Math.abs(exit.from - startedAt), kind).toBeLessThanOrEqual(1);
      expect(exit.to - exit.from, kind).toBeCloseTo(200, 0);
      expect(
        Math.abs((exit.finishedAt ?? 0) - exit.to),
        kind,
      ).toBeLessThanOrEqual(1);
    }
  });

  // Each change to a CSS exit partway through, then the page removes its
  // element at its end. The harness holds a 10 s exit (one its hold reaches
  // partway however slowly the page answers) and seeks it 300 ms from its end
  // before releasing it; the page changes a 3 s one on the first frame it is
  // 100 ms in (one a starved page still renders partway).
  for (const change of [
    'held, seeked and released',
    'held, then finished',
    'paused, then resumed',
    'paused, then finished',
    'sped up',
    'reversed',
  ] as const) {
    test(`a CSS exit ${change} partway, then removed at its end, is dated from the start it ended on`, async ({
      page,
    }) => {
      await fixture(page);
      const box = page.locator('#box');
      await page.evaluate(
        () =>
          new Promise(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      const held = change.startsWith('held');
      for (const kind of ['animation', 'transition'] as const) {
        const label = `${kind}, ${change}`;
        const watch = await watchAnimations(box);
        // The page keeps its own dating: the start time the engine set and
        // where that start put the end, read from the animation itself at
        // its finish or end event, whichever first has it, before the page
        // removes the element.
        await box.evaluate(
          (el, {kind, change, durationMs, held}) => {
            const style = document.createElement('style');
            style.textContent =
              '@keyframes exit-fade { from { opacity: 1 } to { opacity: 0 } }';
            document.head.append(style);
            const child = document.createElement('div');
            child.style.cssText = 'width:20px;height:20px;background:#36c';
            el.append(child);
            if (kind === 'animation') {
              child.style.animation = `exit-fade ${durationMs}ms linear`;
            } else {
              child.style.transition = `opacity ${durationMs}ms linear`;
              child.style.opacity = getComputedStyle(child).opacity;
              void child.offsetWidth;
              child.style.opacity = '0';
            }
            const animation = child.getAnimations()[0];
            let dated: {start: number; end: number} | null = null;
            const note = () => {
              if (dated == null && animation?.startTime != null) {
                const rate = animation.playbackRate;
                const end = Number(
                  animation.effect?.getComputedTiming().endTime ?? 0,
                );
                const start =
                  rate < 0
                    ? Number(animation.startTime) - end / Math.abs(rate)
                    : Number(animation.startTime);
                dated = {start, end: start + end / Math.abs(rate || 1)};
              }
            };
            animation?.addEventListener('finish', note);
            const w = window as unknown as {
              __exitDated?: Promise<{start: number; end: number} | null>;
              __exitChanged?: Promise<boolean>;
            };
            w.__exitDated = new Promise(resolve => {
              const ended = () => {
                note();
                child.remove();
                style.remove();
                resolve(
                  dated == null
                    ? null
                    : {
                        start: performance.timeOrigin + dated.start,
                        end: performance.timeOrigin + dated.end,
                      },
                );
              };
              child.addEventListener(`${kind}end`, ended);
              child.addEventListener(`${kind}cancel`, ended);
            });
            // Whether it was changed partway: false once it has stopped
            // running unchanged.
            w.__exitChanged = new Promise(resolve => {
              const look = () => {
                if (animation == null || animation.playState !== 'running') {
                  if (
                    animation == null ||
                    animation.playState === 'finished' ||
                    animation.playState === 'idle'
                  ) {
                    resolve(false);
                    return;
                  }
                  requestAnimationFrame(look);
                  return;
                }
                if (held) {
                  // The harness holds it: running is enough.
                  if (animation.startTime == null) {
                    requestAnimationFrame(look);
                  } else {
                    resolve(true);
                  }
                  return;
                }
                if (
                  animation.startTime == null ||
                  Number(animation.currentTime ?? 0) < 100
                ) {
                  requestAnimationFrame(look);
                  return;
                }
                if (change === 'paused, then resumed') {
                  animation.pause();
                  setTimeout(() => animation.play(), 150);
                } else if (change === 'paused, then finished') {
                  animation.pause();
                  setTimeout(() => animation.finish(), 150);
                } else if (change === 'sped up') {
                  animation.playbackRate = 2;
                } else {
                  animation.reverse();
                }
                resolve(true);
              };
              requestAnimationFrame(look);
            });
          },
          {kind, change, durationMs: held ? 10_000 : 3_000, held},
        );
        const changed = await page.evaluate(
          () =>
            (window as unknown as {__exitChanged: Promise<boolean>})
              .__exitChanged,
        );
        expect(changed, `${label}: changed partway`).toBe(true);
        if (held) {
          const taken = await holdAnimations(page, box);
          expect(taken.length, `${label}: held partway`).toBe(1);
          await page.waitForTimeout(150);
          if (change === 'held, then finished') {
            await releaseAnimations(page, {finish: true});
          } else {
            await seekAnimations(page, 10_000 - 300);
            await releaseAnimations(page);
          }
        }
        const dated = await page.evaluate(
          () =>
            (
              window as unknown as {
                __exitDated: Promise<{start: number; end: number} | null>;
              }
            ).__exitDated,
        );
        expect(dated, label).not.toBeNull();
        const [exit] = await watch.started();
        expect(exit.finishedAt, label).not.toBeNull();
        // From the engine's own instants: within the timeline's rounding.
        expect
          .soft(Math.abs(exit.from - (dated?.start ?? 0)), `${label}: from`)
          .toBeLessThanOrEqual(1);
        expect
          .soft(
            Math.abs((exit.finishedAt ?? 0) - (dated?.end ?? 0)),
            `${label}: finishedAt`,
          )
          .toBeLessThanOrEqual(1);
      }
    });
  }

  test('a run going backward is dated from when it began: with a delay, ended before the look, or cancelled when it ends', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    const frames = [
      {translate: '0px 0px', offset: 0},
      {translate: '100px 0px', offset: 1},
    ];
    // When a run going backward began, by the engine's own clock. It starts
    // at its end: while it runs, its current time has come down from there
    // by as much as the timeline has moved since, read at one instant (a
    // performance.now() read after `ready` drifts later under load). A
    // starved page can reach `ready` after a short run has already ended,
    // when its current time has stopped at 0: then only its start time,
    // which the engine set a whole run after it began, still says when. Read
    // at the first of `ready` and its finish, before the page can cancel it.
    await page.evaluate(() => {
      Object.assign(window, {
        __dateBackwardRun(animation: Animation) {
          let begun = Number.NaN;
          const byStart = () => {
            if (Number.isNaN(begun) && animation.startTime != null) {
              const end = Number(
                animation.effect?.getComputedTiming().endTime ?? 0,
              );
              begun =
                Number(animation.startTime) -
                end / Math.abs(animation.playbackRate);
            }
          };
          animation.addEventListener('finish', byStart, {once: true});
          return () => {
            if (Number.isNaN(begun) && animation.playState === 'running') {
              const end = Number(
                animation.effect?.getComputedTiming().endTime ?? 0,
              );
              begun =
                Number(document.timeline.currentTime) -
                (end - Number(animation.currentTime)) /
                  Math.abs(animation.playbackRate);
            }
            byStart();
            return performance.timeOrigin + begun;
          };
        },
      });
    });

    // A 300 ms delay plays last when going backward: the curve starts at once.
    let watch = await watchAnimations(box);
    let begunAt = await box.evaluate(async (el, keyframes) => {
      const animation = el.animate(keyframes, {duration: 400, delay: 300});
      const begun = (
        window as unknown as {
          __dateBackwardRun: (animation: Animation) => () => number;
        }
      ).__dateBackwardRun(animation);
      animation.reverse();
      await animation.ready;
      return begun();
    }, frames);
    const [delayed] = await watch.started();
    // Both dates come from the engine's own instants (its start and timeline
    // times), so they agree to the timeline's rounding: a millisecond at most.
    expect(Math.abs(delayed.from - begunAt)).toBeLessThanOrEqual(1);
    expect(delayed.to - delayed.from).toBeCloseTo(400, 0);
    await box.evaluate(el => el.getAnimations().forEach(a => a.finish()));

    // A short one that ended before the look keeps its curve inside its life.
    watch = await watchAnimations(box);
    begunAt = await box.evaluate(async (el, keyframes) => {
      const animation = el.animate(keyframes, {duration: 60});
      const begun = (
        window as unknown as {
          __dateBackwardRun: (animation: Animation) => () => number;
        }
      ).__dateBackwardRun(animation);
      animation.reverse();
      await animation.ready;
      return begun();
    }, frames);
    await page.waitForTimeout(200);
    const [ended] = await watch.started();
    expect(ended.finishedAt).not.toBeNull();
    expect(Math.abs(ended.from - begunAt)).toBeLessThanOrEqual(1);
    // It finished where its curve ends, by the engine's clock: not when its
    // finish event arrived, a frame or so later.
    expect(Math.abs((ended.finishedAt ?? 0) - ended.to)).toBeLessThanOrEqual(1);

    // One the page cancels when it ends keeps its start.
    watch = await watchAnimations(box);
    begunAt = await box.evaluate(async (el, keyframes) => {
      const animation = el.animate(keyframes, {duration: 60});
      // Dated before the page's own finish listener cancels it.
      const begun = (
        window as unknown as {
          __dateBackwardRun: (animation: Animation) => () => number;
        }
      ).__dateBackwardRun(animation);
      animation.addEventListener('finish', () => animation.cancel(), {
        once: true,
      });
      animation.reverse();
      await animation.ready;
      return begun();
    }, frames);
    await page.waitForTimeout(200);
    const [cancelled] = await watch.started();
    expect(Math.abs(cancelled.from - begunAt)).toBeLessThanOrEqual(1);
    expect(cancelled.to - cancelled.from).toBeCloseTo(60, 0);

    // Read right after finish(), before the finish event is delivered: the
    // scheduled end goes through the rate (backward, it is the startTime).
    for (const rate of [-1, 2]) {
      watch = await watchAnimations(box);
      await box.evaluate(
        async (el, [keyframes, playbackRate]) => {
          const animation = el.animate(keyframes as Keyframe[], {
            duration: 1000,
          });
          animation.playbackRate = playbackRate as number;
          await animation.ready;
          animation.finish();
        },
        [frames, rate] as const,
      );
      const [read] = await watch.started();
      expect(read.finishedAt).not.toBeNull();
      // Both from the engine's own instants: within the timeline's rounding.
      expect(Math.abs((read.finishedAt ?? 0) - read.to)).toBeLessThanOrEqual(1);
    }

    // Going backward, an end delay presents nothing: a run still inside it
    // has not progressed.
    await box.evaluate((el, keyframes) => {
      const animation = el.animate(keyframes, {duration: 400, endDelay: 500});
      animation.reverse();
    }, frames);
    await expect(
      waitForAnimation(box, {minProgressMs: 100, timeout: 300}),
    ).rejects.toThrow();
    await box.evaluate(el => el.getAnimations().forEach(a => a.finish()));

    // Nor is it rest: waitForRest waits out the end delay and the curve.
    const restFrom = await box.evaluate((el, keyframes) => {
      el.animate(keyframes, {duration: 600, endDelay: 500}).reverse();
      return performance.now();
    }, frames);
    await waitForRest(box, {timeout: 5_000});
    const restAt = await box.evaluate(() => performance.now());
    expect(restAt - restFrom).toBeGreaterThan(1_000);
  });

  test('an end value held by the keyframes is not part of the curve, and individual transform properties are sampled', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    // 300 ms of motion on the individual `translate` and `scale` properties,
    // then 5 s holding the end values: playState stays 'running' throughout.
    await box.evaluate(el => {
      el.animate(
        [
          {translate: '0px 0px', scale: '1', offset: 0},
          {translate: '0px 120px', scale: '1.5', offset: 300 / 5300},
          {translate: '0px 120px', scale: '1.5', offset: 1},
        ],
        {duration: 5300, fill: 'forwards'},
      );
    });
    const startedAt = await page.evaluate(() => performance.now());
    const [active] = await waitForAnimation(box);
    expect(active.to - active.from).toBeCloseTo(300, 0); // the curve, not the hold
    await waitForRest(box, {timeout: 3_000});
    const after = await box.evaluate(el => ({
      at: performance.now(),
      running: el.getAnimations().some(a => a.playState === 'running'),
      translate: getComputedStyle(el).translate,
    }));
    expect(after.running).toBe(true); // still holding its end value
    expect(after.at - startedAt).toBeGreaterThanOrEqual(300);
    expect(after.at - startedAt).toBeLessThan(1_500);
    expect(after.translate).toBe('0px 120px');

    const held = await holdAnimations(page, box);
    expect(held[0].curveEndMs).toBeCloseTo(300, 0);
    const [mid, end] = await sampleCurve(box, [150, 300]);
    expect(mid.raw.translate).toBe('0px 60px');
    expect(mid.transform.translateY).toBeCloseTo(60, 1);
    expect(mid.transform.scaleX).toBeCloseTo(1.25, 3);
    expect(end.transform.translateY).toBeCloseTo(120, 1);
    expect(end.transform.scaleY).toBeCloseTo(1.5, 3);
  });
});

test.describe('evidence files', () => {
  test('evidence reaches the report with no file copy inside the test', async ({
    browserName: _,
  }, testInfo) => {
    // A file copy that never returns, as one on a loaded runner has waited
    // past a test's whole budget: the evidence must not wait on one inside
    // the test's own time.
    test.setTimeout(15_000);
    const promises = fs.promises as unknown as {copyFile: unknown};
    const copyFile = promises.copyFile;
    let copies = 0;
    promises.copyFile = async () => {
      copies += 1;
      await new Promise(() => {});
    };
    try {
      const written = await writeEvidence(
        'harness-self-test/evidence',
        {'a.json': '{"ok":true}'},
        testInfo,
      );
      expect(copies).toBe(0);
      // The file stays for local paths, and the report has its bytes.
      expect(fs.readFileSync(written['a.json'], 'utf8')).toBe('{"ok":true}');
      const attachment = testInfo.attachments.find(
        a => a.name === 'harness-self-test/evidence/a.json',
      );
      expect(attachment?.contentType).toBe('application/json');
      expect(String(attachment?.body)).toBe('{"ok":true}');
    } finally {
      promises.copyFile = copyFile;
    }
  });
});

test.describe('storyboards', {tag: '@storyboard'}, () => {
  test('an animation filmstrip records every frame and its trace follows the curve', async ({
    page,
  }, testInfo) => {
    await fixture(page);
    const box = page.locator('#box');
    await box.evaluate(el =>
      el.animate(
        [{transform: 'translateX(0)'}, {transform: 'translateX(240px)'}],
        {duration: 200, easing: 'ease-out'},
      ),
    );
    const {storyboard} = await animationStoryboard(page, {
      name: 'harness-self-test-animation',
      clip: {x: 0, y: 340, width: 402, height: 120},
      measure: async () => ({
        x: await box.evaluate(el => el.getBoundingClientRect().x),
      }),
      columns: 4,
    });
    const files = await storyboard.write(testInfo);
    const xs = storyboard.frames.map(f => f.data.x as number);
    expect(xs).toHaveLength(13); // t = 0, 16.7 … 200
    expect(xs[0]).toBeCloseTo(20, 1);
    expect(xs.at(-1)).toBeCloseTo(260, 1);
    expect(xs.every((x, i) => i === 0 || x >= xs[i - 1])).toBe(true);
    expect(files['sheet.png']).toMatch(/sheet\.png$/);
  });

  test('a capture Chromium returns empty is taken again two frames later', async ({
    page,
  }) => {
    await fixture(page);
    // Counts the page's frames, so the wait before the second capture shows.
    await page.evaluate(() => {
      const w = window as unknown as {__frames: number};
      w.__frames = 0;
      const tick = () => {
        w.__frames += 1;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const screenshot = page.screenshot.bind(page);
    const calledAt: number[] = [];
    let failures = 1;
    // What Chromium answers when its surface copy comes back empty.
    page.screenshot = (async (options?: Parameters<Page['screenshot']>[0]) => {
      calledAt.push(
        await page.evaluate(
          () => (window as unknown as {__frames: number}).__frames,
        ),
      );
      if (failures-- > 0) {
        throw new Error(
          'page.screenshot: Protocol error (Page.captureScreenshot): Unable to capture screenshot',
        );
      }
      return screenshot(options);
    }) as Page['screenshot'];
    const storyboard = new Storyboard(page, {
      name: 'harness-self-test-recapture',
      clip: {x: 0, y: 340, width: 402, height: 120},
    });
    await storyboard.capture('t=0 ms', 0);
    expect(storyboard.frames).toHaveLength(1);
    expect(calledAt).toHaveLength(2);
    expect(calledAt[1] - calledAt[0]).toBeGreaterThanOrEqual(2);
    expect(storyboard.trace().recaptures).toEqual([
      {label: 't=0 ms', error: expect.stringContaining('Unable to capture')},
    ]);
    // Captures that keep failing still fail, with Chromium's error.
    failures = Infinity;
    await expect(storyboard.capture('t=1 ms', 1)).rejects.toThrow(
      /Unable to capture screenshot/,
    );
    expect(storyboard.frames).toHaveLength(1);
  });

  test('a touch filmstrip photographs every scripted event', async ({
    page,
  }, testInfo) => {
    await fixture(page);
    await page.evaluate(() => {
      const pad = document.getElementById('pad');
      if (pad == null) {
        throw new Error('no pad');
      }
      const dot = document.createElement('div');
      dot.id = 'dot';
      dot.style.cssText =
        'position:absolute;width:24px;height:24px;border-radius:12px;background:#c33;left:-30px;top:0';
      pad.append(dot);
      pad.addEventListener('pointermove', e => {
        dot.style.transform = `translate(${e.clientX - 12 + 30}px, ${e.clientY - 12}px)`;
      });
    });
    const driver = await touchDriver(page);
    const storyboard = await touchStoryboard(
      page,
      driver,
      drag({x: 60, y: 60}, {x: 300, y: 240}, {durationMs: 100, hz: 60}),
      {
        name: 'harness-self-test-touch',
        clip: {x: 0, y: 0, width: 402, height: 300},
        measure: async () => ({
          x: await page
            .locator('#dot')
            .evaluate(el => el.getBoundingClientRect().x + 12),
        }),
        columns: 4,
      },
    );
    await storyboard.write(testInfo);
    // before + touchStart + 6 moves + touchEnd
    expect(storyboard.frames).toHaveLength(9);
    expect(storyboard.frames.at(-2)?.data.x).toBeCloseTo(300, 0);
  });

  test('a touch filmstrip keeps the scripted event times, and a handler clock sees its pacing', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'WebKit stamps events with their real dispatch time',
    );
    await fixture(page);
    await page.evaluate(() => {
      const w = window as unknown as {__moves: [number, number][]};
      w.__moves = [];
      document.getElementById('pad')?.addEventListener('pointermove', e => {
        w.__moves.push([e.timeStamp, performance.now()]);
      });
    });
    const driver = await touchDriver(page);
    await touchStoryboard(
      page,
      driver,
      drag({x: 60, y: 60}, {x: 300, y: 240}, {durationMs: 100, hz: 60}),
      {
        name: 'harness-self-test-touch-clock',
        clip: {x: 0, y: 0, width: 402, height: 300},
      },
    );
    const moves = await page.evaluate(
      () => (window as unknown as {__moves: [number, number][]}).__moves,
    );
    const gaps = (column: 0 | 1) =>
      moves.slice(1).map((move, i) => move[column] - moves[i][column]);
    expect(moves.length).toBeGreaterThanOrEqual(5);
    // The events carry the script's 60 Hz times…
    for (const gap of gaps(0)) {
      expect(gap).toBeCloseTo(1000 / 60, 0);
    }
    // …but the clock a handler reads advances by a photograph per event.
    for (const gap of gaps(1)) {
      expect(gap).toBeGreaterThan(2 * (1000 / 60));
    }
  });

  test("the harness's own waits run on the real timers: a frozen timer gate does not hold blockMainThread's block", async ({
    page,
  }) => {
    await fixture(page);
    await installTimerGate(page);
    const box = page.locator('#box');
    await box.evaluate(el => {
      el.animate(
        [{transform: 'translateX(0px)'}, {transform: 'translateX(200px)'}],
        {duration: 1_500, easing: 'linear'},
      );
    });
    await freezeTimers(page);
    // Settled, or still held after 5 s.
    const within = (work: Promise<unknown>) =>
      Promise.race([
        work.then(() => 'settled'),
        new Promise<string>(resolve =>
          setTimeout(() => resolve('held'), 5_000),
        ),
      ]);
    expect(
      await within(blockMainThread(page, 100, {during: box, timeout: 2_000})),
    ).toBe('settled');
    await thawTimers(page);
  });

  test('the timer gate holds a component timer until the filmstrip is done', async ({
    page,
  }, testInfo) => {
    await fixture(page);
    await installTimerGate(page);
    const box = page.locator('#box');
    // A component that ends its own animation from a timer (a transitionend
    // backstop): without the gate it would finish behind the held storyboard.
    await box.evaluate(el => {
      const animation = el.animate(
        [{transform: 'translateX(0px)'}, {transform: 'translateX(200px)'}],
        {duration: 300, easing: 'linear'},
      );
      setTimeout(() => {
        animation.finish();
        (window as unknown as {timerRan?: boolean}).timerRan = true;
      }, 40);
    });
    await freezeTimers(page);
    await page.waitForTimeout(120); // the timer is due now, and held
    const {storyboard} = await animationStoryboard(page, {
      name: 'harness-self-test-timer-gate',
      clip: {x: 0, y: 340, width: 402, height: 120},
      measure: async () => ({
        x: await box.evaluate(el => el.getBoundingClientRect().x),
      }),
      columns: 6,
    });
    const timerRan = () =>
      page.evaluate(
        () => (window as unknown as {timerRan?: boolean}).timerRan === true,
      );
    expect(await timerRan()).toBe(false);
    await thawTimers(page);
    expect(await timerRan()).toBe(true);
    await storyboard.write(testInfo);
    const xs = storyboard.frames.map(f => f.data.x as number);
    expect(xs).toHaveLength(19); // t = 0 … 300 ms every 16.7 ms
    expect(xs.every((x, i) => i === 0 || x > xs[i - 1])).toBe(true);
  });

  test('an animation that repeats forever does not set the filmstrip length', async ({
    page,
  }, testInfo) => {
    await fixture(page);
    await page.locator('#box').evaluate(el => {
      el.animate([{rotate: '0deg'}, {rotate: '360deg'}], {
        duration: 800,
        iterations: Infinity,
      });
      el.animate([{opacity: 1}, {opacity: 0.4}], {duration: 200});
    });
    const {storyboard, held} = await animationStoryboard(page, {
      name: 'harness-self-test-endless',
      clip: {x: 0, y: 340, width: 402, height: 120},
      columns: 4,
    });
    expect(held.map(a => Number.isFinite(a.curveEndMs))).toEqual([false, true]);
    expect(storyboard.frames).toHaveLength(13); // t = 0 … 200 ms
    await releaseAnimations(page);
    await storyboard.write(testInfo);
  });

  test('a filmstrip runs from the earliest start to the latest end among the animations that end', async ({
    page,
  }, testInfo) => {
    await fixture(page);
    // A spinner that started a second earlier, a 300 ms move, and a 240 ms
    // move that starts 83 ms after it.
    await page.evaluate(async () => {
      const make = (id: string, top: number) => {
        const el = document.createElement('div');
        el.id = id;
        el.style.cssText = `position:absolute;left:0;top:${top}px;width:40px;height:40px;background:#36c`;
        document.body.append(el);
        return el;
      };
      document
        .getElementById('box')
        ?.animate([{rotate: '0deg'}, {rotate: '360deg'}], {
          duration: 800,
          iterations: Infinity,
        });
      await new Promise(resolve => setTimeout(resolve, 1000));
      make('first', 360).animate(
        [{transform: 'translateX(0px)'}, {transform: 'translateX(300px)'}],
        {duration: 300, easing: 'linear'},
      );
      await new Promise(resolve => setTimeout(resolve, 83));
      make('second', 410).animate(
        [{transform: 'translateX(0px)'}, {transform: 'translateX(240px)'}],
        {duration: 240, easing: 'linear'},
      );
    });
    const x = (id: string) =>
      page
        .locator(`#${id}`)
        .evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41);
    const {storyboard, held} = await animationStoryboard(page, {
      name: 'harness-self-test-offsets',
      clip: {x: 0, y: 340, width: 402, height: 120},
      columns: 6,
      measure: async () => ({
        first: await x('first'),
        second: await x('second'),
      }),
    });
    const second = held.find(a => a.target === 'div#second');
    const first = held.find(a => a.target === 'div#first');
    const lag = (second?.offsetMs ?? 0) - (first?.offsetMs ?? 0);
    const firsts = storyboard.frames.map(f => Number(f.data.first));
    const seconds = storyboard.frames.map(f => Number(f.data.second));
    // The film starts with the first move at its start, the spinner aside...
    expect(firsts[0]).toBeCloseTo(0, 1);
    expect(firsts[6]).toBeCloseTo(100, 0);
    // ...and ends with the second move at its end, not cut off.
    expect(seconds.at(-1)).toBeGreaterThan(239);
    expect(storyboard.frames.at(-1)?.t).toBeCloseTo(lag + 240, 0);
    await releaseAnimations(page);
    await storyboard.write(testInfo);
  });

  test('a filmstrip of endless animations alone asks for its times', async ({
    page,
  }) => {
    await fixture(page);
    await page.locator('#box').evaluate(el =>
      el.animate([{rotate: '0deg'}, {rotate: '360deg'}], {
        duration: 800,
        iterations: Infinity,
      }),
    );
    await expect(
      animationStoryboard(page, {
        name: 'harness-self-test-endless-only',
        clip: {x: 0, y: 340, width: 402, height: 120},
      }),
    ).rejects.toThrow(/repeats forever/);
    await releaseAnimations(page);
  });

  test('the timer gate drops callbacks the page cancels and stamps held frames with the time they run', async ({
    page,
  }) => {
    await fixture(page);
    await installTimerGate(page);
    await freezeTimers(page);
    await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      w.frozenAt = performance.now();
      w.timer = setTimeout(() => {
        w.cancelledTimerRan = true;
      }, 20);
      w.frame = requestAnimationFrame(() => {
        w.cancelledFrameRan = true;
      });
      requestAnimationFrame(time => {
        w.heldFrameTime = time;
      });
    });
    await page.waitForTimeout(150); // both are due now, and held
    // The harness's own frame waits still resolve while the page's are held.
    await Promise.race([
      frames(page, 2),
      page.waitForTimeout(5000).then(() => {
        throw new Error('frames() did not resolve while the gate was frozen');
      }),
    ]);
    await page.evaluate(() => {
      const w = window as unknown as {timer: number; frame: number};
      clearTimeout(w.timer);
      cancelAnimationFrame(w.frame);
    });
    await thawTimers(page);
    const state = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      return {
        timer: w.cancelledTimerRan === true,
        frame: w.cancelledFrameRan === true,
        heldFor: Number(w.heldFrameTime) - Number(w.frozenAt),
      };
    });
    expect(state).toMatchObject({timer: false, frame: false});
    expect(state.heldFor).toBeGreaterThanOrEqual(140);
  });
});
