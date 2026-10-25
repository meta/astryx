// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file harness.interaction.browser.spec.ts
 * @input Fixture pages written inline (no Storybook), real Chromium/WebKit
 * @output Proof that each harness instrument measures what it claims, with a
 *   negative control beside every positive one: scripted timestamps reach the
 *   page; a flick flings natively (Chromium); a second finger and a pinch
 *   arrive as distinct pointers; the screencast shows a compositor animation
 *   advancing through a blocked main thread while a rAF animation freezes;
 *   the trace counts zero Layout for a transform animation and one per frame
 *   for a `top` animation; the long-task log records the page's own long
 *   task but not a DevTools evaluate, which the trace counts; sampled curves
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
 *   frames with the time they run, and leaves the harness its own frames; a
 *   cast filmstrip keeps exactly the presented frames of its window, labelled
 *   from its zero, as PNG.
 * @position The harness's own test. A component spec trusts these
 *   instruments; this file is why it may.
 */

import fs from 'node:fs';
import path from 'node:path';
import {expect, test, type Page} from '@playwright/test';
import {
  animationStoryboard,
  castStoryboard,
  blockMainThread,
  busyWindowProof,
  compareCurve,
  countBetween,
  cubicBezier,
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
  readInputLog,
  readLongTasks,
  releaseAnimations,
  sampleCurve,
  sampleRects,
  seekAnimations,
  springStep,
  startScreencast,
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
  withFinger,
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
    await fixture(page);
    const box = page.locator('#box');
    await markElement(box, {mode: 'outline'});

    const run = async (driver: 'compositor' | 'raf', everyNthFrame = 1) => {
      await box.evaluate((el, how) => {
        el.getAnimations().forEach(a => a.cancel());
        el.style.transform = 'none';
        if (how === 'compositor') {
          el.animate(
            [{transform: 'translateX(0px)'}, {transform: 'translateX(280px)'}],
            {duration: 1600, easing: 'linear'},
          );
        } else {
          const start = performance.now();
          const step = (now: number) => {
            const p = Math.min(1, (now - start) / 1600);
            el.style.transform = `translateX(${280 * p}px)`;
            if (p < 1) {
              requestAnimationFrame(step);
            }
          };
          requestAnimationFrame(step);
        }
      }, driver);
      const cast = await startScreencast(page, {everyNthFrame});
      await page.waitForTimeout(200);
      const window = await blockMainThread(page, 700);
      await page.waitForTimeout(200);
      const tracked = await trackMarker(page, await cast.stop());
      return busyWindowProof(tracked, window, {axis: 'x'});
    };

    const compositor = await run('compositor');
    testInfo.annotations.push({
      type: 'busy-main-thread compositor',
      description: compositor.summary,
    });
    expect(compositor.verdict.failures, compositor.summary).toEqual([]);
    expect(compositor.monotonic).toBe(true);

    const raf = await run('raf');
    testInfo.annotations.push({
      type: 'busy-main-thread rAF control',
      description: raf.summary,
    });
    // Frozen for the whole block: no presented frame moved (the compositor
    // sends none at all when nothing on screen changes), and the verdict that
    // passes the compositor animation fails it on every criterion.
    expect(raf.changed).toBe(0);
    expect(raf.longestStallMs).toBeGreaterThan(600);
    expect(raf.verdict.pass).toBe(false);
    expect(raf.verdict.failures.join('\n')).toMatch(/longest stall/);
    expect(raf.verdict.failures.join('\n')).toMatch(/expected frames moved/);

    // The verdict judges the frames the screencast delivered, not its rate:
    // at one frame in six (a loaded machine's ~100 ms), the compositor
    // animation still passes and the rAF one still fails.
    const slow = await run('compositor', 6);
    expect(slow.cadenceMs, slow.summary).toBeGreaterThan(60);
    expect(slow.verdict.failures, slow.summary).toEqual([]);
    const slowRaf = await run('raf', 6);
    expect(slowRaf.verdict.pass, slowRaf.summary).toBe(false);
    expect(slowRaf.verdict.failures.join('\n')).toMatch(/longest stall/);
  });

  test('a block that starts during a just-started transition still lets the compositor advance it', async ({
    page,
  }, testInfo) => {
    // `during` blocks in the frame the transition has run 16 ms. In WebKit
    // the transition reaches the compositor in that frame's rendering update,
    // so a loop inside the rAF callback froze it (2 of 29 frames moved).
    // Linear and longer than the block, so every frame of the block moves a
    // whole pixel or more and the transition is still running when it ends.
    await fixture(page);
    const box = page.locator('#box');
    await markElement(box, {mode: 'outline'});
    const cast = await startScreencast(page);
    await box.evaluate(el => {
      el.style.transition = 'transform 1600ms linear';
      el.getBoundingClientRect();
      el.style.transform = 'translateX(280px)';
    });
    const window = await blockMainThread(page, 700, {
      during: box,
      minProgressMs: 16,
    });
    await waitForRest(box);
    const tracked = await trackMarker(page, await cast.stop());
    const proof = busyWindowProof(tracked, window, {axis: 'x'});
    testInfo.annotations.push({
      type: 'busy-main-thread transition',
      description: proof.summary,
    });
    expect(proof.verdict.failures, proof.summary).toEqual([]);
    expect(proof.monotonic).toBe(true);
  });

  test('a block never starts on an animation that is not on the compositor yet', async ({
    page,
  }, testInfo) => {
    // An animation created in the frame the helper looks is still pending (not
    // committed to the compositor). A block that started on it then froze it
    // in Chromium: no presented frame moved.
    await fixture(page);
    const box = page.locator('#box');
    await markElement(box, {mode: 'outline'});
    await box.evaluate(el => {
      el.style.willChange = 'transform';
    });
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
            [{transform: 'translateX(0px)'}, {transform: 'translateX(280px)'}],
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
    const tracked = await trackMarker(page, await cast.stop());
    const proof = busyWindowProof(tracked, window, {axis: 'x'});
    testInfo.annotations.push({
      type: 'busy-main-thread pending animation',
      description: proof.summary,
    });
    expect(proof.verdict.failures, proof.summary).toEqual([]);
    expect(proof.monotonic).toBe(true);
  });

  test('in the WebKit container, compiled shaders outlive the run', async ({
    browser,
  }, testInfo) => {
    // The official Playwright image keeps its browsers here.
    test.skip(
      testInfo.project.name !== 'webkit' ||
        process.env.PLAYWRIGHT_BROWSERS_PATH !== '/ms-playwright',
      'runs inside webkit-container.mjs',
    );
    // A cache inside the container dies with it: every run then compiled each
    // shader again, 450–700 ms in the first frame of a blurred layer.
    const dir = process.env.MESA_SHADER_CACHE_DIR;
    expect(dir, 'MESA_SHADER_CACHE_DIR names the host-kept cache').toBeTruthy();
    // Written on the host by the script before the container starts.
    expect(
      fs.readFileSync(path.join(dir ?? '', 'ASTRYX-SHADER-CACHE'), 'utf8'),
    ).toContain('playwright');
    // Mesa writes what it compiles there once a page draws a blurred layer.
    // Earlier runs have filled the cache already, so this run's browser gets
    // an empty directory beside them, in the same host-kept mount, and the
    // test watches its own writes arrive.
    const fresh = fs.mkdtempSync(path.join(dir ?? '', 'self-test-'));
    try {
      const own = await browser.browserType().launch({
        env: {...process.env, MESA_SHADER_CACHE_DIR: fresh},
      });
      try {
        const page = await own.newPage();
        await page.setContent(
          '<div id="glass" style="width:120px;height:80px;backdrop-filter:blur(16px) saturate(180%)"></div>',
        );
        await page.evaluate(
          () =>
            document
              .getElementById('glass')
              ?.animate([{scale: '1'}, {scale: '0.9'}], {duration: 200})
              .finished,
        );
      } finally {
        await own.close();
      }
      expect(fs.readdirSync(fresh, {recursive: true})).not.toEqual([]);
    } finally {
      fs.rmSync(fresh, {recursive: true, force: true});
    }
  });

  test('rect sampling reads one rect per animation frame while the main thread is free', async ({
    page,
    browserName,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    await box.evaluate(el => {
      el.animate(
        [{transform: 'translateX(0px)'}, {transform: 'translateX(200px)'}],
        {duration: 600, easing: 'linear'},
      );
    });
    const samples = await sampleRects(box, 400);
    const xs = samples.map(s => s.box?.x ?? NaN);
    const gaps = samples
      .slice(1)
      .map((s, i) => s.t - samples[i].t)
      .sort((a, b) => a - b);
    const cadence = gaps[Math.floor(gaps.length / 2)];
    expect(cadence).toBeLessThan(34);
    expect(samples.length).toBeGreaterThanOrEqual(10);
    if (browserName === 'chromium') {
      // One sample per presented frame at 60 Hz. (Headless WebKit's animation
      // frames are irregular, so only the cadence is checked there.)
      expect(samples.length).toBeGreaterThanOrEqual(20);
    }
    expect(xs.every((x, i) => i === 0 || x >= xs[i - 1])).toBe(true);
    expect(xs.at(-1) ?? 0).toBeGreaterThan(xs[0] + 80);
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

  test("the long-task log records the page's own long task but not a DevTools evaluate, which the trace counts", async ({
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
    // A DevTools evaluate that spins 300 ms: the trace counts it, the log
    // never sees it.
    let block = {from: 0, to: 0};
    const trace = await traceRendering(page, async () => {
      block = await blockMainThread(page, 300);
    });
    await frames(page, 2);
    expect(
      trace.longTasks.some(
        t =>
          t.durationMs >= 290 &&
          t.start < block.to &&
          t.start >= block.from - 20,
      ),
    ).toBe(true);
    expect(await readLongTasks(page, block)).toEqual([]);
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
    await page.evaluate(async () => {
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
      run(document.getElementById('box'));
      await new Promise(resolve => setTimeout(resolve, 100));
      run(make('later'));
    });
    const held = await holdAnimations(page);
    expect(held.map(a => a.target)).toEqual(['div#box', 'div#later']);
    const [first, later] = held;
    expect(first.offsetMs).toBe(0);
    expect(later.offsetMs).toBeGreaterThan(80);
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
    // #early starts 100 ms before #box's 600 ms linear move to 300 px.
    await page.evaluate(
      () =>
        new Promise<void>(resolve => {
          const early = document.createElement('div');
          early.id = 'early';
          document.body.append(early);
          early.animate([{opacity: 0}, {opacity: 1}], {duration: 2000});
          setTimeout(() => {
            document
              .getElementById('box')
              ?.animate(
                [
                  {transform: 'translateX(0px)'},
                  {transform: 'translateX(300px)'},
                ],
                {duration: 600, easing: 'linear'},
              );
            resolve();
          }, 100);
        }),
    );
    const box = page.locator('#box');
    await waitForAnimation(box);
    // The later-started element is held first.
    const [first] = await holdAnimations(page, box);
    const [later] = await holdAnimations(page, page.locator('#early'));
    const samples = await sampleCurve(box, [0, 150, 300]);
    expect(
      samples.map(sample => Math.round(sample.transform.translateX)),
    ).toEqual([0, 75, 150]);
    // A later hold's earlier start has a negative offset; the origin stays.
    expect(first.offsetMs).toBe(0);
    expect(later.offsetMs).toBeLessThan(-50);
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

  test('a cast filmstrip keeps exactly the presented frames of its window, labelled from its zero', async ({
    page,
  }, testInfo) => {
    await fixture(page);
    const box = page.locator('#box');
    // JPEG frames (WebKit's are always JPEG) take the conversion path.
    const cast = await startScreencast(page, {format: 'jpeg'});
    await box.evaluate(el =>
      el.animate(
        [{transform: 'translateX(0px)'}, {transform: 'translateX(200px)'}],
        {duration: 600},
      ),
    );
    await page.waitForTimeout(500);
    const presented = await cast.stop();
    expect(presented.length).toBeGreaterThan(8);
    // A window of the middle frames, zeroed on one of them.
    const zero = presented[2].t;
    const from = presented[3].t;
    const to = presented[presented.length - 3].t;
    const inside = presented.filter(f => f.t >= from && f.t <= to);
    const seen: number[] = [];
    const film = await castStoryboard(page, presented, {
      name: 'harness-self-test-cast',
      zero,
      from,
      to,
      data: t => {
        seen.push(t);
        return {t};
      },
    });
    expect(film.frames.map(f => f.t)).toEqual(inside.map(f => f.t - zero));
    expect(film.frames.map(f => f.label)).toEqual(
      inside.map(f => `t=${(f.t - zero).toFixed(1)} ms`),
    );
    expect(seen).toEqual(inside.map(f => f.t));
    // Every cell is a PNG, whatever the screencast delivered.
    for (const frame of film.frames) {
      expect([...frame.png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    }
    const files = await film.write(testInfo);
    expect(files['sheet.png']).toMatch(/sheet\.png$/);
    // A window with no presented frame in it films nothing.
    const empty = await castStoryboard(page, presented, {
      name: 'harness-self-test-cast-empty',
      zero,
      from: to + 1,
      to: to + 2,
    });
    expect(empty.frames).toEqual([]);
    await expect(empty.write(testInfo)).rejects.toThrow(/no frames/);
  });
});
