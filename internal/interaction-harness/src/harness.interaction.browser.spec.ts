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
 *   for a `top` animation; sampled curves match the oracles, individual
 *   transform properties included; the animation-state waits report a
 *   running transition and its end, and judge rest by presented values even
 *   while an animation holds its end; storyboards write a sheet and a trace
 *   that follows the curve, and the timer gate holds a component timer until
 *   the filmstrip is done.
 * @position The harness's own test. A component spec trusts these
 *   instruments; this file is why it may.
 */

import {expect, test, type Page} from '@playwright/test';
import {
  animationStoryboard,
  blockMainThread,
  busyWindowProof,
  compareCurve,
  countBetween,
  cubicBezier,
  curveOf,
  drag,
  flick,
  freezeTimers,
  holdAnimations,
  installInputLog,
  installTimerGate,
  markElement,
  merge,
  parseTransform,
  PARTIAL_LIFT_SKIP,
  pinch,
  readInputLog,
  sampleCurve,
  sampleRects,
  springStep,
  startScreencast,
  tap,
  thawTimers,
  timeline,
  touchDriver,
  touchStoryboard,
  traceRendering,
  trackMarker,
  waitForAnimation,
  waitForRest,
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
  test('a compositor animation advances every frame through a blocked main thread; a rAF one freezes', async ({
    page,
  }, testInfo) => {
    await fixture(page);
    const box = page.locator('#box');
    await markElement(box, {mode: 'outline'});

    const run = async (driver: 'compositor' | 'raf') => {
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
      const cast = await startScreencast(page);
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

test.describe('storyboards', () => {
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
});
