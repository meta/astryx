// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layerExitCopy.interaction.browser.spec.ts
 * @input The exit copy bundled with esbuild onto a blank fixture page: a
 *   popover layer inside a clipping, transformed panel, an entrance curve
 *   held halfway, and Chromium and WebKit
 * @output Proof that the engine shows the copy where the layer was drawn:
 *   placed as the layer closes (from script and by the browser's own light
 *   dismiss), it is in the top layer as a manual popover with no `z-index`,
 *   uncut by the clipping panel, and its drawn box equals the layer's drawn
 *   box mid-entrance within half a px; a second copy for the same layer
 *   replaces the first while another layer's copy stays
 * @position Browser proof for layerExitCopy.ts, run by `pnpm
 *   test:interaction`; jsdom has no layout and no top layer. The refusal
 *   path (Android Chromium 158 refuses a show during another popover's
 *   toggle) is proven on the Android gate emulator (pull request evidence):
 *   these engines do not refuse.
 */

import {fileURLToPath} from 'node:url';
import {expect, test, type Page} from '@playwright/test';
import {build} from 'esbuild';

declare global {
  interface Window {
    ExitCopy: typeof import('../layerExitCopy');
  }
}

let script = '';

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [
      fileURLToPath(new URL('../layerExitCopy.ts', import.meta.url)),
    ],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'ExitCopy',
    target: 'es2022',
  });
  script = result.outputFiles[0].text;
});

const ATTRIBUTE = 'data-exit-copy';

// A real navigation (not setContent): the page keeps its own window. The
// layer sits in a panel that clips and is transformed: a fixed box placed
// there would be cut and moved; the top layer is neither.
async function open(page: Page) {
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html, body { margin: 0; background: #fff; }
  .panel { position: absolute; left: 20px; top: 20px; width: 60px; height: 40px; overflow: hidden; transform: translateX(30px); }
  [popover] { position: fixed; inset: auto; margin: 0; padding: 0; border: 0; left: 40px; top: 120px; width: 280px; height: 200px; background: #36c; color: #fff; }
  .other { left: 40px; top: 400px; width: 120px; height: 60px; }
</style>
<div class="panel">
  <div id="layer" popover="auto"><div role="dialog" aria-label="Filters"><p>One</p></div></div>
  <div id="other" class="other" popover="manual">Other</div>
</div>
<script>${script}</script>`;
  await page.route('http://exit-copy.test/', async route =>
    route.fulfill({contentType: 'text/html', body: html}),
  );
  await page.goto('http://exit-copy.test/');
}

test('a copy placed as a layer closes mid-entrance is in the top layer, where the layer was drawn', async ({
  page,
}) => {
  await open(page);
  const result = await page.evaluate(
    async ({attribute}) => {
      const layer = document.getElementById('layer') as HTMLElement;
      layer.showPopover();
      // An entrance halfway through: drawn at 60 % about its top-left corner.
      const entrance = layer.animate(
        [
          {scale: '0.2', transformOrigin: '0 0'},
          {scale: '1', transformOrigin: '0 0'},
        ],
        {duration: 1000, fill: 'both'},
      );
      entrance.pause();
      entrance.currentTime = 500;
      const drawn = layer.getBoundingClientRect();
      let copy: HTMLElement | null = null;
      layer.addEventListener(
        'beforetoggle',
        event => {
          if ((event).newState === 'closed') {
            copy = window.ExitCopy.placeLayerExitCopy(layer, attribute);
          }
        },
        {once: true},
      );
      layer.hidePopover();
      await new Promise(resolve => requestAnimationFrame(resolve));
      const placed = copy as HTMLElement | null;
      if (placed == null) {
        return null;
      }
      const rect = placed.getBoundingClientRect();
      return {
        drawn: [drawn.left, drawn.top, drawn.width, drawn.height],
        copy: [rect.left, rect.top, rect.width, rect.height],
        open: placed.matches(':popover-open'),
        popover: placed.getAttribute('popover'),
        zIndex: getComputedStyle(placed).zIndex,
        layerOpen: layer.matches(':popover-open'),
      };
    },
    {attribute: ATTRIBUTE},
  );
  expect(result).not.toBeNull();
  expect(result!.layerOpen).toBe(false);
  expect(result!.open).toBe(true);
  expect(result!.popover).toBe('manual');
  expect(result!.zIndex).toBe('auto');
  // Mid-entrance the drawn box is not the layout box; the copy holds it.
  expect(result!.drawn[2]).toBeLessThan(280);
  result!.copy.forEach((value, index) => {
    expect(Math.abs(value - result!.drawn[index])).toBeLessThanOrEqual(0.5);
  });
});

test('the browser\u2019s own light dismiss gets the copy too, uncut by the clipping panel', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(attribute => {
    const layer = document.getElementById('layer') as HTMLElement;
    layer.showPopover();
    layer.addEventListener(
      'beforetoggle',
      event => {
        if ((event).newState === 'closed') {
          window.ExitCopy.placeLayerExitCopy(layer, attribute);
        }
      },
      {once: true},
    );
  }, ATTRIBUTE);
  // A press outside: the browser closes the layer by itself.
  await page.mouse.click(360, 700);
  const result = await page.evaluate(attribute => {
    const copy = document.querySelector<HTMLElement>(`[${attribute}]`);
    if (copy == null) {
      return null;
    }
    const rect = copy.getBoundingClientRect();
    return {
      open: copy.matches(':popover-open'),
      rect: [rect.left, rect.top, rect.width, rect.height],
      layerOpen: document.getElementById('layer')!.matches(':popover-open'),
    };
  }, ATTRIBUTE);
  expect(result).not.toBeNull();
  expect(result!.layerOpen).toBe(false);
  expect(result!.open).toBe(true);
  // Where the layer stood, at its full size: the 60 x 40 clipping panel and
  // its 30 px transform neither cut nor moved it.
  expect(result!.rect).toEqual([40, 120, 280, 200]);
});

test('a second copy for the same layer replaces the first; another layer\u2019s copy stays', async ({
  page,
}) => {
  await open(page);
  const result = await page.evaluate(attribute => {
    const layer = document.getElementById('layer') as HTMLElement;
    const other = document.getElementById('other') as HTMLElement;
    layer.showPopover();
    other.showPopover();
    const otherCopy = window.ExitCopy.placeLayerExitCopy(other, attribute);
    const first = window.ExitCopy.placeLayerExitCopy(layer, attribute);
    const second = window.ExitCopy.placeLayerExitCopy(layer, attribute);
    return {
      first: first?.isConnected,
      second: second?.isConnected && second.matches(':popover-open'),
      other: otherCopy?.isConnected && otherCopy.matches(':popover-open'),
      copies: document.querySelectorAll(`[${attribute}]`).length,
    };
  }, ATTRIBUTE);
  expect(result).toEqual({first: false, second: true, other: true, copies: 2});
});
