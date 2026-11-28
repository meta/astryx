// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createAnimator.interaction.browser.spec.ts
 * @input The public animator (createAnimator), bundled with esbuild onto a
 *   blank fixture page. Chromium and WebKit run it on the phone profile, and
 *   a desktop context gives a fine pointer. The interaction harness holds
 *   and samples its motion.
 * @output Proof of the public animator in a real engine. `animate` plays the
 *   `springs.stateChange` curve on screen, seeked frame by frame. It rests on
 *   its target when its promise resolves. `decay` coasts to the analytic rest
 *   of the normal deceleration. `stop` holds the box where it is. `shift`
 *   keeps a gliding box where it is drawn when the layout moves it, and the
 *   glide goes on from there. Under
 *   Reduce Motion, a move cross-fades on a touch screen, and the box jumps
 *   only while transparent. With a mouse, it lands at once.
 * @position Browser proof for animator/createAnimator.ts, run by
 *   `pnpm test:interaction`; jsdom runs no animations
 */

import {fileURLToPath} from 'node:url';
import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {armHold, sampleCurve} from '@astryxdesign/interaction-harness';
import {build} from 'esbuild';
import type * as Bundle from './animatorBundle';
import type {Animator} from '../createAnimator';

declare global {
  interface Window {
    PublicAnimator: typeof Bundle;
    card: Animator;
  }
}

let script = '';

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [
      fileURLToPath(new URL('./animatorBundle.ts', import.meta.url)),
    ],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'PublicAnimator',
    target: 'es2022',
  });
  script = result.outputFiles[0].text;
});

const TRAVEL = 300;

// A real navigation (not setContent): the page keeps its own window.
async function open(page: Page) {
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html, body { margin: 0; background: #fff; }
  #card { position: absolute; top: 40px; left: 0; width: 48px; height: 64px; background: #36c; border-radius: 6px; }
</style>
<div id="card"></div>
<script>${script}</script>
<script>window.card = PublicAnimator.createAnimator(document.getElementById('card'));</script>`;
  await page.route('http://animator.test/', async route =>
    route.fulfill({contentType: 'text/html', body: html}),
  );
  await page.goto('http://animator.test/');
}

/** The card's left edge on screen. */
async function left(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (document.getElementById('card') as HTMLElement).getBoundingClientRect()
        .left,
  );
}

test('animate plays the springs.stateChange curve on screen, seeked frame by frame', async ({
  page,
}) => {
  await open(page);
  const card = page.locator('#card');
  // The animator retires an animation once its own time passes the curve's
  // end. So the page holds the motion as soon as the browser has started it,
  // before a starved runner's late frame can reach that end.
  const hold = await armHold(page, card, {
    judges: {target: card, property: 'translate'},
    minProgressMs: 1,
  });
  await page.evaluate(travel => {
    void window.card.animate({x: travel});
  }, TRAVEL);
  await hold.held();
  const times = [40, 120, 250, 400, 650];
  const samples = await sampleCurve(card, times);
  const curve = await page.evaluate(
    ([travel, ms]) => {
      const {solveSpring, toSpring, springs} = window.PublicAnimator;
      const spring = solveSpring(toSpring(springs.stateChange), {
        from: 0,
        to: travel,
      });
      return ms.map(t => spring.value(t / 1000));
    },
    [TRAVEL, times] as const,
  );
  const rows = samples.map((sample, index) => ({
    ms: sample.t,
    // The card sits at the left edge, so its translate is where it shows.
    onScreen: sample.transform.translateX,
    expected: curve[index],
  }));
  for (const {ms, onScreen, expected} of rows) {
    expect(Math.abs(onScreen - expected), `at ${ms} ms`).toBeLessThan(0.5);
  }
  // It moves: the samples are not all at one end.
  expect(rows[0].onScreen).toBeLessThan(rows[rows.length - 1].onScreen);
});

test('animate resolves with the card resting on its target', async ({page}) => {
  await open(page);
  await page.evaluate(async travel => {
    await window.card.animate({x: travel});
  }, TRAVEL);
  expect(await left(page)).toBeCloseTo(TRAVEL, 0);
  const values = await page.evaluate(() => window.card.get());
  expect(values.x).toBeCloseTo(TRAVEL, 3);
});

test('decay coasts to the rest of the normal deceleration', async ({page}) => {
  await open(page);
  const rest = await page.evaluate(async () => {
    await window.card.decay({x: 900});
    return window.PublicAnimator.solveDecay({from: 0, velocity: 900}).rest;
  });
  expect(Math.abs((await left(page)) - rest)).toBeLessThan(1);
});

test('shift keeps a gliding card where it is drawn when the layout moves it, and the glide goes on', async ({
  page,
}) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const element = document.getElementById('card') as HTMLElement;
    const top = () => element.getBoundingClientRect().top;
    const frame = async () =>
      new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    // A fold's glide: the card comes down 300 px to its place.
    window.card.set({y: -300});
    void window.card.animate({y: 0});
    for (let i = 0; i < 6; i += 1) {
      await frame();
    }
    const stepBefore = top();
    await frame();
    const before = top();
    // Another fold mid-glide: the layout moves the card down 200 px, and the
    // shift puts it back where it is drawn, in the same task.
    const speed = window.card.getVelocity().y / 1000;
    element.style.top = '240px';
    window.card.shift({y: -200});
    // The shift reads the motion at the call's time, which is later than the
    // frame this task draws by the time the task has run so far.
    const lag = performance.now() - Number(document.timeline.currentTime);
    const after = top();
    const frames: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      await frame();
      frames.push(top());
    }
    return {
      step: before - stepBefore,
      before,
      after,
      frames,
      drift: speed * lag,
    };
  });
  expect(result.step).toBeGreaterThan(0);
  // Drawn where it was, in the shift's own task: at most the travel of the
  // time the task ran before the call.
  expect(Math.abs(result.after - result.before)).toBeLessThan(
    result.drift + 0.5,
  );
  // The glide goes on toward the card's new place: down, frame by frame, at
  // about the speed it had, not from rest.
  let last = result.after;
  for (const at of result.frames) {
    expect(at).toBeGreaterThan(last);
    expect(at).toBeLessThanOrEqual(240 + 0.5);
    last = at;
  }
  expect(result.frames[0] - result.after).toBeGreaterThan(result.step * 0.3);
});

test('stop holds the card where it is on screen', async ({page}) => {
  await open(page);
  const held = await page.evaluate(async travel => {
    void window.card.animate({x: travel});
    await new Promise(resolve => setTimeout(resolve, 150));
    // A busy machine can draw no frame in that time, and nothing moves
    // before one. Wait for the frame that commits the move, and the next.
    await new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    window.card.stop();
    return window.card.get().x;
  }, TRAVEL);
  expect(held).toBeGreaterThan(0);
  expect(held).toBeLessThan(TRAVEL);
  await page.waitForTimeout(400);
  expect(Math.abs((await left(page)) - held)).toBeLessThan(0.5);
});

test('under Reduce Motion on a touch screen, a move cross-fades: the card jumps only while transparent', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await open(page);
  // Sampled every frame in real time. The travel lands with a style write at
  // the bottom of the fade, and no seek of the running animations shows it.
  // A first cross-fade warms the page up (a fresh WebKit page skips frames
  // for about 100 ms); the second, back home, is the one measured.
  const {frames, landed} = await page.evaluate(async travel => {
    const card = document.getElementById('card') as HTMLElement;
    await window.card.animate({x: travel});
    const samples: {left: number; opacity: number}[] = [];
    // The travel lands with a style write, so the card's opacity is read as
    // that write runs. The next frame can come well into the fade back in on
    // a loaded runner, and a landing that runs late enough appears at once.
    // Only a change of `translate` counts: the animator writes other inline
    // styles too (`will-change`).
    const landed: number[] = [];
    const {style} = card;
    const setProperty = style.setProperty.bind(style);
    style.setProperty = (property, value, priority) => {
      if (property !== 'translate') {
        setProperty(property, value, priority);
        return;
      }
      const was = style.getPropertyValue(property);
      const opacity = Number(getComputedStyle(card).opacity);
      setProperty(property, value, priority);
      if (style.getPropertyValue(property) !== was) {
        landed.push(opacity);
      }
    };
    let done = false;
    void window.card.animate({x: 0}).then(() => {
      done = true;
    });
    while (!done && samples.length < 120) {
      await new Promise(requestAnimationFrame);
      samples.push({
        left: card.getBoundingClientRect().left,
        opacity: Number(getComputedStyle(card).opacity),
      });
    }
    delete (style as {setProperty?: unknown}).setProperty;
    return {frames: samples, landed};
  }, TRAVEL);
  // Never between the ends: the travel is substituted, not slowed.
  for (const {left: x} of frames) {
    expect(x === 0 || Math.abs(x - TRAVEL) < 0.5, `left ${x}`).toBe(true);
  }
  const jump = frames.findIndex(f => f.left === 0);
  expect(jump).toBeGreaterThan(0);
  // It fades out where it was, lands at the bottom of the fade, and fades
  // back in where it landed. It never shows moving, and it never brightens
  // before it lands.
  const before = frames.slice(0, jump).map(f => f.opacity);
  const after = frames.slice(jump).map(f => f.opacity);
  for (let i = 1; i < before.length; i++) {
    expect(before[i]).toBeLessThanOrEqual(before[i - 1] + 0.01);
  }
  for (let i = 1; i < after.length; i++) {
    expect(after[i]).toBeGreaterThanOrEqual(after[i - 1] - 0.01);
  }
  // It lands once, while transparent.
  expect(landed).toHaveLength(1);
  expect(landed[0]).toBeLessThan(0.1);
  expect(frames[frames.length - 1].opacity).toBeCloseTo(1, 2);
});

test('under Reduce Motion with a mouse, a move lands at once', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: {width: 800, height: 600},
    hasTouch: false,
    isMobile: false,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  try {
    await open(page);
    const coarse = await page.evaluate(
      () => matchMedia('(pointer: coarse)').matches,
    );
    expect(coarse).toBe(false);
    const sameTask = await page.evaluate(travel => {
      void window.card.animate({x: travel});
      return (
        document.getElementById('card') as HTMLElement
      ).getBoundingClientRect().left;
    }, TRAVEL);
    expect(sameTask).toBeCloseTo(TRAVEL, 0);
  } finally {
    await context.close();
  }
});
