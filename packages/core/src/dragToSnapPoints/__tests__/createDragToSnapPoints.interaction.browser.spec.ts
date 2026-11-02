// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createDragToSnapPoints.interaction.browser.spec.ts
 * @input The public snap-point drag bundled with esbuild onto a blank page;
 *   real touches through the interaction harness's touch driver; Chromium and
 *   WebKit on the phone profile
 * @output Proof of `spec:AST-107` FR2 in a real engine: a slow drag settles on
 *   the nearest snap point, a quick flick carries to the next one, a release
 *   moving back returns to the snap point the drag started from, and
 *   `settleTo` from a key settles without a drag; each reports `onSettle`
 *   once, and the element rests on the snap point
 * @position Browser proof for dragToSnapPoints/createDragToSnapPoints.ts, run
 *   by `pnpm test:interaction`
 */

import {fileURLToPath} from 'node:url';
import {touchDriver, type TouchDriver} from '@astryxdesign/interaction-harness';
import {expect, test, type Page} from '@playwright/test';
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

/** A finger from (x, y) moving by `dy` over `steps` steps of `ms`, then lifting. */
function dragScript(
  x: number,
  y: number,
  moves: ReadonlyArray<number>,
  ms: number,
) {
  const steps = [{t: 0, fingers: [{x, y, id: 1}]}];
  moves.forEach((dy, i) => {
    steps.push({t: (i + 1) * ms, fingers: [{x, y: y + dy, id: 1}]});
  });
  steps.push({t: (moves.length + 1) * ms, fingers: []});
  return steps;
}

async function settled(page: Page): Promise<number[]> {
  await page.waitForTimeout(1200);
  return page.evaluate(
    () => (window as unknown as {__settled: number[]}).__settled,
  );
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
  await driver.play(dragScript(120, 100, linear(110, 5), 16));
  expect(await settled(page)).toEqual([1]);
  expect(await panelTop(page)).toBeCloseTo(40 + 240, 0);
});

test('a release moving back returns to the snap point the drag started from', async ({
  page,
}) => {
  const driver = await open(page);
  // Down 300 px, then back up 40 px over the last frames before the lift.
  const moves = [...linear(300, 20), 290, 280, 270, 260];
  await driver.play(dragScript(120, 100, moves, 33));
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
