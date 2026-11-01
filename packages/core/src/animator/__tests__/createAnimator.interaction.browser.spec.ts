// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createAnimator.interaction.browser.spec.ts
 * @input The public animator (createAnimator) bundled with esbuild onto a
 *   blank fixture page; Chromium and WebKit on the phone profile, and a
 *   desktop context for a fine pointer
 * @output Proof of `spec:AST-107` FR3 in a real engine: `animate` plays the
 *   `springs.stateChange` curve on screen (seeked frame by frame) and rests on
 *   its target when its promise resolves; `decay` coasts to the analytic rest
 *   of the normal deceleration; `stop` holds the box where it is; under
 *   Reduce Motion a move cross-fades on a touch screen (the box jumps only
 *   while transparent) and lands at once with a mouse
 * @position Browser proof for animator/createAnimator.ts, run by
 *   `pnpm test:interaction`; jsdom runs no animations
 */

import {fileURLToPath} from 'node:url';
import {expect, test, type Page} from '@playwright/test';
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
  const rows = await page.evaluate(async travel => {
    void window.card.animate({x: travel});
    // Let the browser commit the motion, then hold it to seek.
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const animations = document.getAnimations();
    for (const animation of animations) {
      animation.pause();
    }
    const {solveSpring, toSpring, springs} = window.PublicAnimator;
    const curve = solveSpring(toSpring(springs.stateChange), {
      from: 0,
      to: travel,
    });
    const card = document.getElementById('card') as HTMLElement;
    return [40, 120, 250, 400, 650].map(ms => {
      for (const animation of animations) {
        animation.currentTime = ms;
      }
      return {
        ms,
        onScreen: card.getBoundingClientRect().left,
        expected: curve.value(ms / 1000),
      };
    });
  }, TRAVEL);
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

test('stop holds the card where it is on screen', async ({page}) => {
  await open(page);
  const held = await page.evaluate(async travel => {
    void window.card.animate({x: travel});
    await new Promise(resolve => setTimeout(resolve, 150));
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
  // Sampled every frame in real time: the travel lands with a style write
  // at the bottom of the fade, which no seek of the running animations
  // shows. A first cross-fade warms the page up (a fresh WebKit page skips
  // frames for about 100 ms); the second, back home, is the one measured.
  const frames = await page.evaluate(async travel => {
    const card = document.getElementById('card') as HTMLElement;
    await window.card.animate({x: travel});
    const samples: {left: number; opacity: number}[] = [];
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
    return samples;
  }, TRAVEL);
  // Never between the ends: the travel is substituted, not slowed.
  for (const {left: x} of frames) {
    expect(x === 0 || Math.abs(x - TRAVEL) < 0.5, `left ${x}`).toBe(true);
  }
  const jump = frames.findIndex(f => f.left === 0);
  expect(jump).toBeGreaterThan(0);
  // It fades out where it was, lands at the bottom of the fade, and fades
  // back in where it landed: never shown moving, never brightening before
  // it lands.
  const before = frames.slice(0, jump).map(f => f.opacity);
  const after = frames.slice(jump).map(f => f.opacity);
  for (let i = 1; i < before.length; i++) {
    expect(before[i]).toBeLessThanOrEqual(before[i - 1] + 0.01);
  }
  for (let i = 1; i < after.length; i++) {
    expect(after[i]).toBeGreaterThanOrEqual(after[i - 1] - 0.01);
  }
  expect(Math.min(before[before.length - 1], after[0])).toBeLessThan(0.1);
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
