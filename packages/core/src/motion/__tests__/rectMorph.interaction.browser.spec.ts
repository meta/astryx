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

// FR6 is verified in a browser too: an interrupted motion continues from the
// box on screen. Two readings: reads on either side of the switch in one
// task, and the composited frames across it.

// One task, two reads either side of the switch: nothing is presented in
// between, so the second read is the new motion's first value. The morph
// reads the document timeline here, the clock the compositor presents on,
// so both reads see one instant whatever the frame timing; on its default
// clock the new motion's start would sit up to the time since the last frame
// ahead of the first read.
async function readAcrossSwitch(page: Page, restart: boolean) {
  return page.evaluate(
    async ({box, square, spring, restart}) => {
      const element = document.getElementById('surface') as HTMLElement;
      const morph = Motion.createRectMorph(element, {
        now: () => Number(document.timeline.currentTime),
      });
      const path = Motion.lerpPath(square, box);
      const read = () => {
        const r = element.getBoundingClientRect();
        return {x: r.x, y: r.y, width: r.width, height: r.height};
      };
      await morph.present(path, spring).started;
      // Partway up the present, with the box well away from both ends.
      await new Promise(resolve => setTimeout(resolve, 160));
      const before = read();
      if (restart) {
        // What a morph that did not continue would do: start the path over.
        morph.reset();
        morph.present(path, spring);
      } else {
        // On the element itself: no copy, so the switch alone moves the box.
        morph.dismiss(path, spring, {target: element});
      }
      const after = read();
      return {
        before,
        after,
        step: Math.max(
          Math.abs(after.x - before.x),
          Math.abs(after.y - before.y),
          Math.abs(after.width - before.width),
          Math.abs(after.height - before.height),
        ),
      };
    },
    {box: BOX, square: SQUARE, spring: SLOW, restart},
  );
}

// The composited frames across a switch, on the morph's default clock. The
// box rises 240 px along a path with no fade, so the marker is tracked in
// every frame; the dismissal (or the restart) takes over 600 ms in, near the
// middle of the travel. The screencast starts once the present has started:
// before that the box sits at rest, and its first step onto the path is not
// the switch.
type Switching = {
  morph: ReturnType<typeof Motion.createRectMorph>;
  path: ReturnType<typeof Motion.lerpPath>;
  from: {x: number; y: number; width: number; height: number};
};
async function trackAcrossSwitch(page: Page, restart: boolean) {
  const surface = page.locator('#surface');
  await markElement(surface, {inset: MARKER_INSET});
  await page.evaluate(
    async ({box, spring}) => {
      const element = document.getElementById('surface') as HTMLElement;
      const morph = Motion.createRectMorph(element);
      const from = {
        x: box.x,
        y: box.y + 240,
        width: box.width * 0.8,
        height: box.height * 0.8,
      };
      const path = Motion.lerpPath(from, box);
      await morph.present(path, spring).started;
      (window as unknown as {switching: Switching}).switching = {
        morph,
        path,
        from,
      };
    },
    {box: BOX, spring: SLOW},
  );
  const cast = await startScreencast(page);
  const geometry = await page.evaluate(
    async ({box, spring, restart}) => {
      const element = document.getElementById('surface') as HTMLElement;
      const {morph, path, from} = (window as unknown as {switching: Switching})
        .switching;
      await new Promise(resolve => setTimeout(resolve, 600));
      const at = element.getBoundingClientRect().y;
      if (restart) {
        morph.reset();
        morph.present(path, spring);
      } else {
        morph.dismiss(path, spring, {target: element});
      }
      await new Promise(resolve => setTimeout(resolve, 600));
      // The smallest move a discontinuity would make from here: back to the
      // path's start (a restart), or to the box at rest (a frame presented
      // without the morph's transform).
      return {jump: Math.min(Math.abs(at - from.y), Math.abs(at - box.y))};
    },
    {box: BOX, spring: SLOW, restart},
  );
  await page.waitForTimeout(100);
  const tracked = (await trackMarker(page, await cast.stop())).filter(
    frame => frame.box != null,
  );
  let rising = 0;
  let falling = 0;
  let worstStep = 0;
  for (let i = 1; i < tracked.length; i++) {
    const dy = tracked[i].box!.y - tracked[i - 1].box!.y;
    if (dy < -0.5) {rising++;}
    if (dy > 0.5) {falling++;}
    worstStep = Math.max(worstStep, Math.abs(dy));
  }
  return {tracked: tracked.length, rising, falling, worstStep, ...geometry};
}

const SUBPIXEL = 0.5;

test('a dismissal mid-present starts from the box: reads either side of the switch, in one task', async ({
  page,
}) => {
  await open(page);
  const reading = await readAcrossSwitch(page, false);
  test
    .info()
    .annotations.push({type: 'switch', description: JSON.stringify(reading)});
  expect(reading.step).toBeLessThanOrEqual(SUBPIXEL);
});

test('on screen, the box keeps moving through the switch without a jump', async ({
  page,
}) => {
  await open(page);
  const reading = await trackAcrossSwitch(page, false);
  test
    .info()
    .annotations.push({type: 'track', description: JSON.stringify(reading)});
  // Frames on both sides of the switch: the box was tracked rising under the
  // present and falling under the dismissal.
  expect(reading.rising).toBeGreaterThanOrEqual(5);
  expect(reading.falling).toBeGreaterThanOrEqual(5);
  // A frame's own travel is a few px; a discontinuity moves the box by at
  // least `jump`. Half of it separates the two.
  expect(reading.worstStep).toBeLessThan(reading.jump / 2);
});

test('a restart fails both readings, so they have teeth', async ({page}) => {
  await open(page);
  const read = await readAcrossSwitch(page, true);
  await open(page);
  const track = await trackAcrossSwitch(page, true);
  test.info().annotations.push({
    type: 'restart',
    description: JSON.stringify({read, track}),
  });
  expect(read.step).toBeGreaterThan(SUBPIXEL);
  expect(track.worstStep).toBeGreaterThanOrEqual(track.jump / 2);
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
