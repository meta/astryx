// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hitAreaUnreachableNeighbour.interaction.browser.spec.ts
 * @input The hit-area runtime bundled alone, a phone-sized touch page with one
 *   watched row button, and a neighbour that appears after the row is measured
 * @output Proves that a finger's tap on the row's grown hit area runs the row
 *   when the nearer neighbour is one that no tap can reach, and that a
 *   neighbour that takes taps still swallows it
 * @position Browser regression for hitArea.ts, run by test:interaction; the
 *   pure model is hitArea.test.ts
 */

import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import type * as hitArea from '../hitArea';

declare global {
  interface Window {
    hitAreaProof: typeof hitArea;
    rowClicks: number;
  }
}

let bundle = '';

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../hitArea.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'hitAreaProof',
    platform: 'browser',
    target: 'es2022',
    logLevel: 'silent',
  });
  bundle = result.outputFiles[0].text;
});

// The row is 20 px tall, so its hit area grows 12 px below it. The press is
// 3 px below the row, in that growth, and the neighbour starts 2 px below the
// press: it is nearer the press than the row's own box.
const PRESS = {x: 190, y: 123};

/**
 * Opens a page with the row measured and nothing near it, then places
 * `neighbour` below the press, outside the row's parent, so that nothing
 * measures the row again before the touch.
 */
async function openRowWithNeighbour(
  page: Page,
  neighbour: string,
): Promise<void> {
  await page.goto('about:blank');
  await page.setContent(`<!doctype html>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body { margin: 0; }
      #row { position: absolute; left: 40px; top: 100px; width: 200px;
        height: 20px; margin: 0; padding: 0; box-sizing: border-box; }
      #row::after { content: ''; position: absolute;
        inset: calc(var(--astryx-hit-inset-top, 0px) * -1)
          calc(var(--astryx-hit-inset-right, 0px) * -1)
          calc(var(--astryx-hit-inset-bottom, 0px) * -1)
          calc(var(--astryx-hit-inset-left, 0px) * -1); }
      .spot { position: absolute; left: 176px; top: 125px; }
      .spot button { display: block; width: 28px; height: 28px; margin: 0;
        padding: 0; box-sizing: border-box; }
    </style>
    <div><button id="row">Open</button></div>
    <div id="elsewhere"></div>`);
  await page.addScriptTag({content: bundle});
  await page.evaluate(() => {
    const row = document.getElementById('row') as HTMLElement;
    const {watchHitArea, writeHitInsets} = window.hitAreaProof;
    watchHitArea(row, insets => writeHitInsets(row, insets));
    // A swallowed click stops before it reaches the document, as it stops
    // before an app's delegated click handler.
    window.rowClicks = 0;
    document.addEventListener('click', event => {
      if ((event.target as Element).closest('#row') != null) {
        window.rowClicks++;
      }
    });
  });
  await expect(page.locator('#row')).toHaveCSS(
    '--astryx-hit-inset-bottom',
    '12px',
  );
  await page.evaluate(html => {
    document.getElementById('elsewhere')?.insertAdjacentHTML('beforeend', html);
  }, neighbour);
  // The browser itself takes the touch to the row, through its hit area.
  expect(
    await page.evaluate(({x, y}) => document.elementFromPoint(x, y)?.id, PRESS),
  ).toBe('row');
}

const UNREACHABLE = [
  {kind: 'in an inert subtree', html: '<div class="spot" inert>'},
  {
    kind: 'in an inert subtree whose contents are skipped',
    html: '<div class="spot" inert style="content-visibility: hidden">',
  },
  {
    kind: 'in a hidden subtree',
    html: '<div class="spot" style="visibility: hidden">',
  },
  {
    kind: 'that takes no pointer events',
    html: '<div class="spot" style="pointer-events: none">',
  },
];

for (const {kind, html} of UNREACHABLE) {
  test(`a tap on the row's hit area runs the row when the nearer neighbour is ${kind}`, async ({
    page,
  }) => {
    await openRowWithNeighbour(
      page,
      `${html}<button id="pager">Next</button></div>`,
    );
    await page.touchscreen.tap(PRESS.x, PRESS.y);
    await expect
      .poll(async () => page.evaluate(() => window.rowClicks))
      .toBe(1);
  });
}

test("a tap on the row's hit area runs the row when the nearer neighbour is disabled", async ({
  page,
}) => {
  await openRowWithNeighbour(
    page,
    '<div class="spot"><button id="pager" disabled>Next</button></div>',
  );
  await page.touchscreen.tap(PRESS.x, PRESS.y);
  await expect.poll(async () => page.evaluate(() => window.rowClicks)).toBe(1);
});

test("a tap on the row's hit area is still swallowed when the nearer neighbour takes taps", async ({
  page,
}) => {
  await openRowWithNeighbour(
    page,
    '<div class="spot"><button id="pager">Next</button></div>',
  );
  await page.touchscreen.tap(PRESS.x, PRESS.y);
  // Then a tap on the row's own box, which runs: by its click, the first
  // tap's click has arrived, and it did not run the row.
  await page.touchscreen.tap(PRESS.x, 110);
  await expect.poll(async () => page.evaluate(() => window.rowClicks)).toBe(1);
});
