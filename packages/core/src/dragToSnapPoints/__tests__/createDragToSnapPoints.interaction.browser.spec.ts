// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createDragToSnapPoints.interaction.browser.spec.ts
 * @input The public snap-point drag, bundled with esbuild onto a blank page.
 *   Real touches come through the interaction harness's touch driver, in
 *   Chromium and WebKit on the phone profile.
 * @output Proof of `spec:AST-107` FR2 in a real engine. A slow drag settles
 *   on the nearest snap point, and a quick flick carries to the next one. A
 *   release that moves back returns to the snap point the drag started from.
 *   `settleTo` from a key settles without a drag. Each reports `onSettle`
 *   once, and the element rests on the snap point.
 * @position Browser proof for dragToSnapPoints/createDragToSnapPoints.ts, run
 *   by `pnpm test:interaction`
 */

import {fileURLToPath} from 'node:url';
import {touchDriver, type TouchDriver} from '@astryxdesign/interaction-harness';
import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {build} from 'esbuild';

let script = '';

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('./snapBundle.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'PublicSnap',
    target: 'es2022',
  });
  script = result.outputFiles[0].text;
});

const POINTS = [0, 240, 480];

// WebKit stamps a touch when it reaches the page, so a loaded runner can hand
// the page another release than the script's. Each play that depends on its
// release fails by name when the page's strays past what its settle allows.
// The flick's script releases at 1,375 px/s: within a quarter of it, the page
// reads at least 1,031 px/s, past the flick speed (1,008).
const FLICK_TOLERANCE = 0.25;
// The move back releases at -303 px/s: within 90% of it, the page still reads
// it moving back, all its settle depends on.
const MOVE_BACK_TOLERANCE = 0.9;

// A real navigation: touch emulation exposes the Touch Events API to
// documents it creates.
async function open(page: Page): Promise<TouchDriver> {
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #fff; }
  #panel { position: absolute; left: 20px; right: 20px; top: 40px; height: 120px; background: #36c; border-radius: 12px; }
</style>
<div id="panel"></div>
<script>${script}</script>
<script>
  window.__settled = [];
  window.snap = PublicSnap.createDragToSnapPoints(document.getElementById('panel'), {
    axis: 'y',
    snapPoints: ${JSON.stringify(POINTS)},
    onSettle: index => window.__settled.push(index),
  });
</script>`;
  await page.route('http://snap.test/', async route =>
    route.fulfill({contentType: 'text/html', body: html}),
  );
  await page.goto('http://snap.test/');
  return touchDriver(page);
}

/**
 * A finger from (x, y) moving by `dy` over `steps` steps of `ms`, then lifting
 * `liftMs` after its last move (one more step by default).
 */
function dragScript(
  x: number,
  y: number,
  moves: ReadonlyArray<number>,
  ms: number,
  liftMs = ms,
) {
  const steps = [{t: 0, fingers: [{x, y, id: 1}]}];
  moves.forEach((dy, i) => {
    steps.push({t: (i + 1) * ms, fingers: [{x, y: y + dy, id: 1}]});
  });
  steps.push({t: moves.length * ms + liftMs, fingers: []});
  return steps;
}

/**
 * The settle indices, read once a settle has fired and the panel has stopped
 * moving. A second settle while it moved shows as a second index.
 */
async function settled(page: Page): Promise<number[]> {
  await page.waitForFunction(
    () => (window as unknown as {__settled: number[]}).__settled.length > 0,
  );
  return page.evaluate(async () => {
    const panel = document.getElementById('panel') as HTMLElement;
    let last = Number.NaN;
    for (;;) {
      await new Promise<void>(resolve => {
        requestAnimationFrame(() => resolve());
      });
      const top = panel.getBoundingClientRect().top;
      if (top === last) {
        return (window as unknown as {__settled: number[]}).__settled;
      }
      last = top;
    }
  });
}

async function panelTop(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (document.getElementById('panel') as HTMLElement).getBoundingClientRect()
        .top,
  );
}

const linear = (to: number, count: number) =>
  Array.from({length: count}, (_, i) => (to * (i + 1)) / count);

test('a slow drag settles on the nearest snap point', async ({page}) => {
  const driver = await open(page);
  // 300 px over about a second: slow, nearer 240 than 480.
  await driver.play(dragScript(120, 100, linear(300, 30), 33));
  expect(await settled(page)).toEqual([1]);
  expect(await panelTop(page)).toBeCloseTo(40 + 240, 0);
});

test('a quick flick carries to the next snap point', async ({page}) => {
  const driver = await open(page);
  // 110 px in about 80 ms: past 1008 px/s, yet nearer 0 than 240.
  await driver.play(dragScript(120, 100, linear(110, 5), 16), {
    pacing: 'spacing',
    releaseTolerance: FLICK_TOLERANCE,
  });
  expect(await settled(page)).toEqual([1]);
  expect(await panelTop(page)).toBeCloseTo(40 + 240, 0);
});

test('a release moving back returns to the snap point the drag started from', async ({
  page,
}) => {
  const driver = await open(page);
  // Down 300 px, then back up 40 px over the last frames before the lift.
  // It lifts a frame after its last move: a lift past the stillness
  // interval (40 ms) would read a resting finger, not a move back.
  const moves = [...linear(300, 20), 290, 280, 270, 260];
  await driver.play(dragScript(120, 100, moves, 33, 16), {
    pacing: 'spacing',
    releaseTolerance: MOVE_BACK_TOLERANCE,
  });
  expect(await settled(page)).toEqual([0]);
  expect(await panelTop(page)).toBeCloseTo(40, 0);
});

test('settleTo settles without a drag, the keyboard path', async ({page}) => {
  await open(page);
  await page.evaluate(() =>
    (window as unknown as {snap: {settleTo(i: number): void}}).snap.settleTo(2),
  );
  expect(await settled(page)).toEqual([2]);
  expect(await panelTop(page)).toBeCloseTo(40 + 480, 0);
});
