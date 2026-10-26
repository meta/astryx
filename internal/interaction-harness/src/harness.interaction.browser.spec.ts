// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file harness.interaction.browser.spec.ts
 * @input Fixture pages written inline (no Storybook), real Chromium/WebKit
 * @output Proof that each harness instrument measures what it claims:
 *   scripted timestamps reach the page; a flick flings natively (Chromium);
 *   a second finger and a pinch arrive as distinct pointers; sampled curves
 *   match the oracles; a held end is not part of the curve, and individual
 *   transform properties are sampled; a sample at
 *   an end reports the time it was read at; holding takes only running
 *   document-timeline animations, each at its own offset, holds each where it
 *   was read, adds a second hold to the held set without moving the first
 *   hold's times, drops one the page cancels, and releases only them.
 * @position The harness's own test. A component spec trusts these
 *   instruments; this file is why it may.
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  compareCurve,
  cubicBezier,
  curveOf,
  drag,
  flick,
  holdAnimations,
  installInputLog,
  merge,
  PARTIAL_LIFT_SKIP,
  pinch,
  readInputLog,
  releaseAnimations,
  sampleCurve,
  seekAnimations,
  springStep,
  tap,
  timeline,
  touchDriver,
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

/** Until an animation on the element runs with a start time, `ms` into it. */
async function untilRunning(locator: Locator, ms = 0) {
  await expect
    .poll(() =>
      locator.evaluate(
        (el, min) =>
          el
            .getAnimations()
            .some(
              a =>
                a.playState === 'running' &&
                a.startTime != null &&
                Number(a.currentTime ?? 0) >= min,
            ),
        ms,
      ),
    )
    .toBe(true);
}

/** Until nothing on the element is running. */
async function untilIdle(locator: Locator) {
  await expect
    .poll(() =>
      locator.evaluate(el =>
        el.getAnimations().some(a => a.playState === 'running'),
      ),
    )
    .toBe(false);
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

  test('a faster playback rate is read on the timeline by seeks and samples', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    // At playback rate 2 a seek or sample at t reads the curve at 2t.
    await box.evaluate(el => {
      const animation = el.animate(
        [{translate: '0px 0px'}, {translate: '100px 0px'}],
        {duration: 1000, easing: 'linear'},
      );
      animation.playbackRate = 2;
    });
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
    await box.evaluate(el => {
      el.animate(
        [
          {translate: '0px 0px', offset: 0},
          {translate: '100px 0px', offset: 0.5},
          {translate: '100px 0px', offset: 1},
        ],
        {duration: 1000, easing: 'cubic-bezier(0.42, 0, 1, 1)'},
      );
    });
    const [held] = await holdAnimations(page, box);
    // The keyframe offset 0.5 is progress, not 500 ms of time: the run starts
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
    expect(held.curveEndMs).toBeCloseTo(lo * 1000, 0);
    expect(held.curveEndMs).toBeGreaterThan(600);
    await releaseAnimations(page, {finish: true});

    // Played in reverse, the held run is where the motion starts: the curve
    // runs to the full end.
    await box.evaluate(el => {
      el.animate(
        [
          {translate: '0px 0px', offset: 0},
          {translate: '100px 0px', offset: 0.5},
          {translate: '100px 0px', offset: 1},
        ],
        {duration: 1000, easing: 'linear', direction: 'reverse'},
      );
    });
    const [reversed] = await holdAnimations(page, box);
    expect(reversed.curveEndMs).toBeCloseTo(1000, 0);
    await releaseAnimations(page, {finish: true});

    // One reversed by `reverse()` (a negative playback rate) is refused by
    // a hold, which seeks curves forward only.
    await box.evaluate(async el => {
      const animation = el.animate(
        [
          {translate: '0px 0px', offset: 0},
          {translate: '100px 0px', offset: 0.5},
          {translate: '100px 0px', offset: 1},
        ],
        {duration: 1000, easing: 'linear'},
      );
      animation.reverse();
      await animation.ready;
    });
    // Chromium lists a reversed run in getAnimations() a frame after ready.
    await untilRunning(box);
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
      await box.evaluate((el, frames) => {
        el.animate(frames, {duration: 1000, easing: 'linear'});
      }, keyframes);
      const [moving] = await holdAnimations(page, box);
      expect(moving.curveEndMs).toBeCloseTo(1000, 0);
      await releaseAnimations(page, {finish: true});
    }

    await box.evaluate(el => {
      el.animate([{rotate: 'x 0deg'}, {rotate: 'x 60deg'}], {
        duration: 300,
        easing: 'linear',
      });
    });
    await holdAnimations(page, box);
    const [end] = await sampleCurve(box, [300]);
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
    await untilRunning(box, 50);
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
    await untilIdle(box);
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
    await untilRunning(box);
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
    await untilRunning(box);
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
    await untilIdle(box);
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

test.describe('held ends', () => {
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
