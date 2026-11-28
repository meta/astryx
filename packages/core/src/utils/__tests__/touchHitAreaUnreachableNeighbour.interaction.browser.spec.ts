// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchHitAreaUnreachableNeighbour.interaction.browser.spec.ts
 * @input The press check (utils/touchHitArea.ts) bundled with React, a
 *   phone-sized touch page with one row button and a neighbour button, each
 *   with a touch band, and real touch input
 * @output Proves that a finger's tap where the row's band meets a nearer
 *   neighbour's band runs the row when no tap can reach that neighbour, and
 *   goes to the neighbour when it takes taps
 * @position Browser regression for touchHitArea.ts, run by test:interaction;
 *   the unit layer is touchHitArea.test.tsx
 */

import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';

declare global {
  interface Window {
    pressCheckProof: {mount: (container: Element) => void};
    rowClicks: number;
    pagerClicks: number;
  }
}

let bundle = '';

test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `
        import {createElement} from 'react';
        import {flushSync} from 'react-dom';
        import {createRoot} from 'react-dom/client';
        import {useTouchHitArea} from '../touchHitArea';
        function Row() {
          const ref = useTouchHitArea(true);
          return createElement('button', {id: 'row', ref}, 'Open');
        }
        export function mount(container) {
          const root = createRoot(container);
          flushSync(() => root.render(createElement(Row)));
        }
      `,
      resolveDir: fileURLToPath(new URL('.', import.meta.url)),
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'pressCheckProof',
    platform: 'browser',
    target: 'es2022',
    define: {'process.env.NODE_ENV': '"production"'},
    logLevel: 'silent',
  });
  bundle = result.outputFiles[0].text;
});

// The row is 20 px tall, and its band reaches 12 px below it. The press is
// 9 px below the row. The neighbour's box starts 2 px below the press, and
// its band covers the press, so the neighbour's box is nearer the finger.
const PRESS = {x: 190, y: 129};

/** Opens the page with the row and `neighbour` below it. */
async function openRowWithNeighbour(
  page: Page,
  neighbour: string,
): Promise<void> {
  await page.goto('about:blank');
  await page.setContent(`<!doctype html>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body { margin: 0; }
      #host { position: absolute; left: 40px; top: 100px; }
      #row { position: relative; width: 200px; height: 20px; margin: 0;
        padding: 0; box-sizing: border-box; isolation: isolate; }
      #row::after { content: ''; position: absolute; inset: -12px;
        z-index: -1; }
      .spot { position: absolute; left: 176px; top: 131px; }
      .spot button { position: relative; display: block; width: 28px;
        height: 28px; margin: 0; padding: 0; box-sizing: border-box; }
      .spot button::after { content: ''; position: absolute; inset: -8px; }
    </style>
    <div id="host"></div>
    <div id="elsewhere"></div>`);
  await page.addScriptTag({content: bundle});
  await page.evaluate(html => {
    window.pressCheckProof.mount(document.getElementById('host') as Element);
    document.getElementById('elsewhere')?.insertAdjacentHTML('beforeend', html);
    window.rowClicks = 0;
    window.pagerClicks = 0;
    document.addEventListener('click', event => {
      const target = event.target as Element;
      if (target.closest('#row') != null) {
        window.rowClicks++;
      }
      if (target.closest('#pager') != null) {
        window.pagerClicks++;
      }
    });
  }, neighbour);
  // The browser itself takes the touch to the row, through its band.
  expect(
    await page.evaluate(
      ({x, y}) => document.elementFromPoint(x, y)?.closest('button')?.id,
      PRESS,
    ),
  ).toBe('row');
}

const UNREACHABLE = [
  {kind: 'in an inert subtree', html: '<div class="spot" inert>'},
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
  test(`a tap on the row's band runs the row when the nearer neighbour is ${kind}`, async ({
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

test("a tap on the row's band runs the row when the nearer neighbour is disabled", async ({
  page,
}) => {
  await openRowWithNeighbour(
    page,
    '<div class="spot"><button id="pager" disabled>Next</button></div>',
  );
  await page.touchscreen.tap(PRESS.x, PRESS.y);
  await expect.poll(async () => page.evaluate(() => window.rowClicks)).toBe(1);
});

test("a tap on the row's band goes to the nearer neighbour when it takes taps", async ({
  page,
}) => {
  await openRowWithNeighbour(
    page,
    '<div class="spot"><button id="pager">Next</button></div>',
  );
  await page.touchscreen.tap(PRESS.x, PRESS.y);
  await expect
    .poll(async () => page.evaluate(() => window.pagerClicks))
    .toBe(1);
  expect(await page.evaluate(() => window.rowClicks)).toBe(0);
});
