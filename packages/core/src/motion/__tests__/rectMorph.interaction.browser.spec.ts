// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file rectMorph.interaction.browser.spec.ts
 * @input The rect morph and the motion source bundled with esbuild onto a
 *   blank fixture page; the interaction harness's busy-main-thread,
 *   screencast and trace instruments; Chromium and WebKit on the phone
 *   profile
 * @output Proof that the engine shows the morph's path: seeked frame by
 *   frame, a present and a dismissal put the element's box on screen on the
 *   path's rect within 0.5 px (a straight line with a fade, a popover's edge
 *   growth); the morph keeps moving through a 1 s main-thread block; no
 *   Layout or Paint runs while it animates (Chromium trace)
 * @position Browser proof for rectMorph.ts, run by `pnpm test:interaction`;
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
// The page's `Motion` global (the bundle) is declared beside the animator's
// proofs, in animator.interaction.browser.spec.ts.

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

/** The surface at rest, and the 22 px square on its control it grows from. */
const BOX = {x: 40, y: 204, width: 320, height: 253};
const SQUARE = {x: 179, y: 160, width: 22, height: 22};
/** UIKit's popover numbers (#8187): 1 % scale, 100 px of length. */
const POPOVER = {origin: {x: 160, y: 0}, collapsedScale: 0.01};
const SPRING = {response: 0.45, dampingRatio: 0.8};
/** A slow spring for the block: well over a px per frame throughout. */
const SLOW = {response: 2, dampingRatio: 1};
const MARKER_INSET = 8;

// A real navigation (not setContent): the page keeps its own window.
async function open(page: Page) {
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html, body { margin: 0; background: #fff; }
  .surface { position: absolute; left: ${BOX.x}px; top: ${BOX.y}px; width: ${BOX.width}px; height: ${BOX.height}px; background: #36c; }
</style>
<div id="surface" class="surface"></div>
<script>${script}</script>`;
  await page.route('http://motion.test/', async route =>
    route.fulfill({contentType: 'text/html', body: html}),
  );
  await page.goto('http://motion.test/');
}

type PathKind = 'line' | 'edge';

/**
 * Plays a present (or, after it, a dismissal on a copy) of `kind`, pauses
 * the engine, seeks it every 1/60 s, and returns the worst gap between the
 * box on screen and the path's rect, px, and between the opacity on screen
 * and the path's.
 */
async function seekedGap(
  page: Page,
  kind: PathKind,
  phase: 'present' | 'dismiss',
) {
  return page.evaluate(
    async ({kind, phase, box, square, popover, spring}) => {
      const surface = document.getElementById('surface') as HTMLElement;
      const morph = Motion.createRectMorph(surface);
      const path =
        kind === 'line'
          ? Motion.lerpPath(square, box, {opacity: [0, 1]})
          : Motion.edgeGrowPath({
              box,
              origin: popover.origin,
              axis: 'y',
              collapsedScale: popover.collapsedScale,
              collapsedLength: 100 / box.height,
            });
      let target = surface;
      let handle = morph.present(path, spring);
      if (phase === 'dismiss') {
        await handle.finished;
        target = surface.cloneNode(true) as HTMLElement;
        target.id = 'copy';
        surface.after(target);
        handle = morph.dismiss(path, spring, {target});
      }
      await handle.started;
      const animations = target.getAnimations();
      const progress = Motion.progressCurve(spring);
      for (const animation of animations) {
        animation.pause();
      }
      let worstRect = 0;
      let worstOpacity = 0;
      const step = 1000 / 60;
      for (let t = 0; t <= progress.duration * 1000 + step; t += step) {
        for (const animation of animations) {
          animation.currentTime = t;
        }
        const p = progress.at(t / 1000);
        // The dismissal runs the path backward, rest to source.
        const at = phase === 'present' ? p : 1 - p;
        // Past the source on an overshoot the scale crosses 0 (the copy is
        // transparent there): the box on screen is the flipped rect.
        const raw = path.rectAt(at);
        const expected = {
          x: Math.min(raw.x, raw.x + raw.width),
          y: Math.min(raw.y, raw.y + raw.height),
          width: Math.abs(raw.width),
          height: Math.abs(raw.height),
        };
        const rect = target.getBoundingClientRect();
        worstRect = Math.max(
          worstRect,
          Math.abs(rect.x - expected.x),
          Math.abs(rect.y - expected.y),
          Math.abs(rect.width - expected.width),
          Math.abs(rect.height - expected.height),
        );
        const opacity = Number.parseFloat(getComputedStyle(target).opacity);
        const expectedOpacity = Math.min(
          1,
          Math.max(0, path.opacityAt?.(at) ?? 1),
        );
        worstOpacity = Math.max(
          worstOpacity,
          Math.abs(opacity - expectedOpacity),
        );
      }
      return {
        animations: animations.length,
        worstRect,
        worstOpacity,
        origin: getComputedStyle(target).transformOrigin,
      };
    },
    {kind, phase, box: BOX, square: SQUARE, popover: POPOVER, spring: SPRING},
  );
}

for (const kind of ['line', 'edge'] as const) {
  for (const phase of ['present', 'dismiss'] as const) {
    test(`the engine shows the path\u2019s rect at every frame: ${kind === 'line' ? 'a straight line with a fade' : 'a popover\u2019s edge growth'}, ${phase}`, async ({
      page,
    }) => {
      await open(page);
      const result = await seekedGap(page, kind, phase);
      test.info().annotations.push({
        type: 'seeked gap',
        description: JSON.stringify(result),
      });
      // translate, scale and opacity, one animation each.
      expect(result.animations).toBe(3);
      expect(result.origin).toBe('0px 0px');
      expect(result.worstRect).toBeLessThanOrEqual(0.5);
      expect(result.worstOpacity).toBeLessThanOrEqual(0.005);
    });
  }
}

test('a dismissal started mid-present continues from the box on screen', async ({
  page,
}) => {
  // FR6 is verified in a browser too: the switch happens on the compositor,
  // so the box must not jump when the dismissal takes over mid-flight.
  await open(page);
  const surface = page.locator('#surface');
  await markElement(surface, {inset: MARKER_INSET});
  const cast = await startScreencast(page);
  const atSwitch = await page.evaluate(
    async ({box, square, spring, restart}) => {
      const element = document.getElementById('surface') as HTMLElement;
      const morph = Motion.createRectMorph(element);
      const path = Motion.lerpPath(square, box, {opacity: [0, 1]});
      const read = () => {
        const r = element.getBoundingClientRect();
        return {x: r.x, y: r.y, width: r.width};
      };
      const frame = async () => new Promise(requestAnimationFrame);
      const step = (a: {x: number; y: number; width: number}, b: typeof a) =>
        Math.max(
          Math.abs(b.x - a.x),
          Math.abs(b.y - a.y),
          Math.abs(b.width - a.width),
        );

      await morph.present(path, spring).started;
      // Partway up the present, with the box well away from both ends.
      await new Promise(resolve => setTimeout(resolve, 160));
      // What one frame of this motion is worth, read from the motion
      // itself just before the switch.
      const a0 = read();
      await frame();
      const a1 = read();
      const travelBefore = step(a0, a1);

      const before = read();
      if (restart) {
        // A restart: the box is put back on the path's start, which is what
        // a morph that did not continue would do.
        morph.reset();
        morph.present(path, spring);
      } else {
        // Dismissing on the element itself: no copy, so the switch is the
        // only thing that can move the box.
        morph.dismiss(path, spring, {target: element});
      }
      await frame();
      const after = read();
      await frame();
      const after2 = read();
      const travelAfter = step(after, after2);

      return {
        before,
        after,
        switchStep: step(before, after),
        travelBefore,
        travelAfter,
      };
    },
    {box: BOX, square: SQUARE, spring: SLOW, restart: false},
  );
  await page.waitForTimeout(200);
  const tracked = await trackMarker(page, await cast.stop());
  test.info().annotations.push({
    type: 'switch',
    description: JSON.stringify(atSwitch),
  });
  // The bound comes from the motion, not from a constant: crossing the
  // switch may cost one frame of travel, and a frame is worth what the
  // frames either side of it are worth. Subpixel rounding is the only
  // slack. A restart from the path's start moves tens of pixels (the
  // source is 160 px from rest on each axis), so it fails this by an order
  // of magnitude — the case below proves that rather than asserting it.
  const SUBPIXEL = 0.5;
  const frameTravel =
    Math.max(atSwitch.travelBefore, atSwitch.travelAfter) + SUBPIXEL;
  expect(atSwitch.switchStep).toBeLessThanOrEqual(frameTravel);
  // And the marker's path across the whole run never jumps.
  const steps = tracked.filter(f => f.box != null);
  const worstStep = steps
    .slice(1)
    .reduce(
      (worst, frame, i) =>
        Math.max(worst, Math.abs(frame.box!.y - steps[i].box!.y)),
      0,
    );
  test
    .info()
    .annotations.push({type: 'worst step', description: String(worstStep)});
  expect(worstStep).toBeLessThanOrEqual(24);
});

test('the same reading fails a restart, so the bound has teeth', async ({
  page,
}) => {
  // The proof above is only worth its bound if a motion that does NOT
  // continue fails it. Forcing a restart at the same moment moves the box
  // back toward the path's start, far beyond one frame of travel.
  await open(page);
  const forced = await page.evaluate(
    async ({box, square, spring}) => {
      const element = document.getElementById('surface') as HTMLElement;
      const morph = Motion.createRectMorph(element);
      const path = Motion.lerpPath(square, box, {opacity: [0, 1]});
      const read = () => {
        const r = element.getBoundingClientRect();
        return {x: r.x, y: r.y, width: r.width};
      };
      const frame = async () => new Promise(requestAnimationFrame);
      const step = (a: {x: number; y: number; width: number}, b: typeof a) =>
        Math.max(
          Math.abs(b.x - a.x),
          Math.abs(b.y - a.y),
          Math.abs(b.width - a.width),
        );
      await morph.present(path, spring).started;
      await new Promise(resolve => setTimeout(resolve, 160));
      const a0 = read();
      await frame();
      const a1 = read();
      const travelBefore = step(a0, a1);
      const before = read();
      morph.reset();
      morph.present(path, spring);
      await frame();
      const after = read();
      return {switchStep: step(before, after), travelBefore};
    },
    {box: BOX, square: SQUARE, spring: SLOW},
  );
  test.info().annotations.push({
    type: 'forced restart',
    description: JSON.stringify(forced),
  });
  expect(forced.switchStep).toBeGreaterThan(forced.travelBefore * 5);
});

test('a present keeps growing every frame through a 1 s main-thread block', async ({
  page,
}) => {
  await open(page);
  const surface = page.locator('#surface');
  await markElement(surface, {inset: MARKER_INSET});
  const cast = await startScreencast(page);
  await page.evaluate(
    async ({box, spring}) => {
      const element = document.getElementById('surface') as HTMLElement;
      const morph = Motion.createRectMorph(element);
      // From 80 % of its size, 240 px lower (on screen the whole way): the
      // marker in the box's corner rises the whole way, over a px a frame.
      const from = {
        x: box.x,
        y: box.y + 240,
        width: box.width * 0.8,
        height: box.height * 0.8,
      };
      await morph.present(Motion.lerpPath(from, box), spring).started;
    },
    {box: BOX, spring: SLOW},
  );
  const busy = await blockMainThread(page, 1000, {
    during: surface,
    minProgressMs: 40,
  });
  await page.waitForTimeout(200);
  const tracked = await trackMarker(page, await cast.stop());
  const proof = busyWindowProof(tracked, busy, {axis: 'y', settledWithin: 2});
  test
    .info()
    .annotations.push({type: 'busy window', description: proof.summary});
  expect(busy.to - busy.from).toBeGreaterThanOrEqual(1000);
  expect(proof.verdict.failures, proof.summary).toEqual([]);
  expect(proof.monotonic).toBe(true);
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
      ({box, square, spring}) => {
        const element = document.getElementById('surface') as HTMLElement;
        const morph = Motion.createRectMorph(element);
        morph.present(Motion.lerpPath(square, box, {opacity: [0, 1]}), spring);
        return performance.timeOrigin + performance.now();
      },
      {box: BOX, square: SQUARE, spring: SLOW},
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
