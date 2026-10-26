// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file harness.interaction.browser.spec.ts
 * @input Fixture pages written inline (no Storybook), real Chromium/WebKit
 * @output Proof that each harness instrument measures what it claims:
 *   scripted timestamps reach the page; a flick flings natively (Chromium);
 *   a second finger and a pinch arrive as distinct pointers; sampled curves
 *   match the oracles; the animation-state waits report a running transition
 *   and its end, and judge rest by presented values even while an animation
 *   holds its end, and a watch taken on first contact ignores an animation
 *   already running and keeps the start of one the page cancels when it ends; individual transform properties are sampled; a sample at
 *   an end reports the time it was read at; holding takes only running
 *   document-timeline animations, each at its own offset, holds each where it
 *   was read, adds a second hold to the held set without moving the first
 *   hold's times, drops one the page cancels, and releases only them;
 *   storyboards write a sheet and a trace that follows the curve, an endless
 *   animation does not set their length, and a photograph Chromium returns
 *   empty is taken again two frames later; a touch filmstrip keeps scripted
 *   event times while a handler clock sees its pacing; the timer gate holds a
 *   component timer until the filmstrip is done, drops callbacks the page
 *   cancels, stamps held frames with the time they run, and leaves the
 *   harness its own frames.
 * @position The harness's own test. A component spec trusts these
 *   instruments; this file is why it may.
 */

import {expect, test, type Page} from '@playwright/test';
import {
  animationStoryboard,
  compareCurve,
  cubicBezier,
  curveOf,
  drag,
  flick,
  frames,
  freezeTimers,
  holdAnimations,
  installInputLog,
  installTimerGate,
  merge,
  parseTransform,
  PARTIAL_LIFT_SKIP,
  pinch,
  readInputLog,
  releaseAnimations,
  sampleCurve,
  seekAnimations,
  springStep,
  Storyboard,
  tap,
  thawTimers,
  timeline,
  touchDriver,
  touchStoryboard,
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

    // One reversed by `reverse()` (a negative playback rate) is reported as
    // starting when it did, running its whole curve, and is refused by a
    // hold, which seeks curves forward only.
    const watch = await watchAnimations(box);
    const readyAt = await box.evaluate(async el => {
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
      return performance.timeOrigin + performance.now();
    });
    const [running] = await watch.started();
    expect(Math.abs(running.from - readyAt)).toBeLessThan(100);
    expect(running.to - running.from).toBeCloseTo(1000, -1);
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

  test('a run going backward is dated from when it began: with a delay, ended before the look, or cancelled when it ends', async ({
    page,
  }) => {
    await fixture(page);
    const box = page.locator('#box');
    const frames = [
      {translate: '0px 0px', offset: 0},
      {translate: '100px 0px', offset: 1},
    ];

    // A 300 ms delay plays last when going backward: the curve starts at once.
    let watch = await watchAnimations(box);
    let readyAt = await box.evaluate(async (el, keyframes) => {
      const animation = el.animate(keyframes, {duration: 400, delay: 300});
      animation.reverse();
      await animation.ready;
      return performance.timeOrigin + performance.now();
    }, frames);
    const [delayed] = await watch.started();
    expect(Math.abs(delayed.from - readyAt)).toBeLessThan(50);
    expect(delayed.to - delayed.from).toBeCloseTo(400, 0);
    await box.evaluate(el => el.getAnimations().forEach(a => a.finish()));

    // A short one that ended before the look keeps its curve inside its life.
    watch = await watchAnimations(box);
    readyAt = await box.evaluate(async (el, keyframes) => {
      const animation = el.animate(keyframes, {duration: 60});
      animation.reverse();
      await animation.ready;
      return performance.timeOrigin + performance.now();
    }, frames);
    await page.waitForTimeout(200);
    const [ended] = await watch.started();
    expect(ended.finishedAt).not.toBeNull();
    expect(Math.abs(ended.from - readyAt)).toBeLessThan(50);
    expect(ended.to).toBeLessThanOrEqual((ended.finishedAt ?? 0) + 1);

    // One the page cancels when it ends keeps its start.
    watch = await watchAnimations(box);
    readyAt = await box.evaluate(async (el, keyframes) => {
      const animation = el.animate(keyframes, {duration: 60});
      animation.addEventListener('finish', () => animation.cancel(), {
        once: true,
      });
      animation.reverse();
      await animation.ready;
      return performance.timeOrigin + performance.now();
    }, frames);
    await page.waitForTimeout(200);
    const [cancelled] = await watch.started();
    expect(Math.abs(cancelled.from - readyAt)).toBeLessThan(50);
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
      expect(Math.abs((read.finishedAt ?? 0) - read.to)).toBeLessThan(50);
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
});
