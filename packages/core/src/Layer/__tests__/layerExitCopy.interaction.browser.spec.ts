// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layerExitCopy.interaction.browser.spec.ts
 * @input The exit copy bundled with esbuild onto a blank fixture page, in
 *   Chromium and WebKit. The page holds a popover layer inside a clipping,
 *   transformed panel, with an entrance curve held halfway.
 * @output Proof that the engine shows the copy where the layer was drawn.
 *   The copy is placed as the layer closes, from script and by the browser's
 *   own light dismiss. It is in the top layer as a manual popover with no
 *   `z-index`. The clipping panel does not cut it. Its drawn box equals the
 *   layer's drawn box mid-entrance, within half a px. A second copy for the
 *   same layer replaces the first, while another layer's copy stays.
 * @position Browser proof for layerExitCopy.ts, run by `pnpm
 *   test:interaction`; jsdom has no layout and no top layer. Chromium 150
 *   and later refuse a show during another popover's toggle. There the copy
 *   opens after the closing script, or in the next frame. So a case that
 *   closes a layer reads the copy after a frame.
 */

import {fileURLToPath} from 'node:url';
import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
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
// layer sits in a panel that clips and is transformed. A fixed box placed
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
          if (event.newState === 'closed') {
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
        if (event.newState === 'closed') {
          window.ExitCopy.placeLayerExitCopy(layer, attribute);
        }
      },
      {once: true},
    );
  }, ATTRIBUTE);
  // A press outside: the browser closes the layer by itself.
  await page.mouse.click(360, 700);
  const result = await page.evaluate(async attribute => {
    // A refused show during the light dismiss opens the copy in the next
    // frame.
    await new Promise(resolve => requestAnimationFrame(resolve));
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

test('a layer that closes with the layer around it gets a copy that is drawn, outside both', async ({
  page,
}) => {
  await open(page);
  const result = await page.evaluate(async attribute => {
    const outer = document.createElement('div');
    outer.setAttribute('popover', 'auto');
    outer.style.setProperty('--tone', 'rgb(10, 20, 30)');
    // A dark scheme scope between the two layers, as a Theme inside a Dialog.
    const scope = document.createElement('div');
    scope.style.setProperty('color-scheme', 'dark');
    const inner = document.createElement('div');
    inner.setAttribute('popover', 'auto');
    inner.style.setProperty('top', '360px');
    inner.style.setProperty(
      'background',
      'light-dark(rgb(255, 255, 255), rgb(31, 31, 34))',
    );
    inner.innerHTML = '<p style="color: var(--tone)">Nested</p>';
    scope.append(inner);
    outer.append(scope);
    document.body.append(outer);
    outer.showPopover();
    inner.showPopover();
    let copy: HTMLElement | null = null;
    inner.addEventListener(
      'beforetoggle',
      event => {
        if (event.newState === 'closed') {
          copy = window.ExitCopy.placeLayerExitCopy(inner, attribute);
        }
      },
      {once: true},
    );
    // The outer layer's close takes the inner one with it, in one step.
    outer.hidePopover();
    // Where the browser refuses a show during the toggle, the copy opens
    // after this script, before the next frame paints.
    await new Promise(resolve => requestAnimationFrame(resolve));
    const placed = copy as HTMLElement | null;
    if (placed == null) {
      return null;
    }
    const rect = placed.getBoundingClientRect();
    return {
      open: placed.matches(':popover-open'),
      visible: placed.checkVisibility(),
      rect: [rect.left, rect.top, rect.width, rect.height],
      insideOuter: outer.contains(placed),
      tone: getComputedStyle(placed.querySelector('p')!).color,
      background: getComputedStyle(placed).backgroundColor,
      layersOpen: [outer, inner].map(layer => layer.matches(':popover-open')),
    };
  }, ATTRIBUTE);
  expect(result).not.toBeNull();
  expect(result!.layersOpen).toEqual([false, false]);
  expect(result!.open).toBe(true);
  // Drawn where the inner layer was: not a 0 x 0 box in a hidden layer.
  expect(result!.visible).toBe(true);
  expect(result!.rect).toEqual([40, 360, 280, 200]);
  expect(result!.insideOuter).toBe(false);
  // What the copy inherited inside the outer layer, outside it: its custom
  // properties, and its scheme for `light-dark()`.
  expect(result!.tone).toBe('rgb(10, 20, 30)');
  expect(result!.background).toBe('rgb(31, 31, 34)');
});

test('when the close of the layer around it closes it too, its copy stays above that layer\u2019s copy', async ({
  page,
}) => {
  await open(page);
  const result = await page.evaluate(async attribute => {
    const outer = document.createElement('div');
    outer.setAttribute('popover', 'auto');
    const inner = document.createElement('div');
    inner.setAttribute('popover', 'auto');
    // Over part of the outer layer, as a menu over its Popover.
    inner.style.setProperty('top', '200px');
    inner.style.setProperty('background', 'rgb(200, 30, 30)');
    outer.append(inner);
    document.body.append(outer);
    outer.showPopover();
    inner.showPopover();
    const placed = new Map<HTMLElement, HTMLElement>();
    for (const layer of [outer, inner]) {
      layer.addEventListener(
        'beforetoggle',
        event => {
          if (event.newState === 'closed') {
            const copy = window.ExitCopy.placeLayerExitCopy(layer, attribute);
            if (copy != null) {
              placed.set(layer, copy);
            }
          }
        },
        {once: true},
      );
    }
    // The browser closes the inner layer first, then the outer one.
    outer.hidePopover();
    // A refused show opens the copies before the next frame paints.
    await new Promise(resolve => requestAnimationFrame(resolve));
    const innerCopy = placed.get(inner);
    const outerCopy = placed.get(outer);
    if (innerCopy == null || outerCopy == null) {
      return null;
    }
    // Hit testing finds the topmost box once the copies take part in it.
    for (const copy of [innerCopy, outerCopy]) {
      copy.removeAttribute('inert');
      copy.style.setProperty('pointer-events', 'auto');
    }
    const hit = document.elementFromPoint(100, 260);
    return {
      open: [innerCopy, outerCopy].map(copy => copy.matches(':popover-open')),
      innerOnTop: hit != null && innerCopy.contains(hit),
      outerUnder: document
        .elementsFromPoint(100, 260)
        .some(element => outerCopy.contains(element)),
    };
  }, ATTRIBUTE);
  expect(result).not.toBeNull();
  expect(result!.open).toEqual([true, true]);
  expect(result!.outerUnder).toBe(true);
  expect(result!.innerOnTop).toBe(true);
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
