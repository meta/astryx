// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for reading the overlays a drawn page shows open: each read
 * waits until the document stops changing, so an update that finishes over
 * several tasks (a layer that opens, then reads its anchor and renders
 * again) is read as it ends, never between two renders.
 */

import {describe, expect, it} from 'vitest';
import {
  countQueuedImmediates,
  layerDocument,
  openLayerMarkup,
} from './layers.mjs';

countQueuedImmediates();

describe('openLayerMarkup', () => {
  it('reads a layer as its last update leaves it, however many tasks the update takes', async () => {
    await layerDocument();
    const g = /** @type {any} */ (globalThis);
    const host = g.document.createElement('div');
    g.document.body.appendChild(host);
    const layer = g.document.createElement('div');
    layer.setAttribute('data-astryx-layer-root', '');
    layer.setAttribute('style', 'first');
    host.appendChild(layer);
    // An update over three tasks, as React makes one: the layer opens in
    // the first, then renders again in the next two.
    setTimeout(() => {
      layer.__astryxPopoverOpen = true;
      setImmediate(() => {
        setImmediate(() => layer.setAttribute('style', 'last'));
      });
    }, 0);
    const read = await openLayerMarkup(host, fn => fn());
    expect(read.at(-1)).toContain('style="last"');
    host.remove();
  });

  it('keeps a control on the page that a press opens as drawn open, without its overlays', async () => {
    await layerDocument();
    const g = /** @type {any} */ (globalThis);
    const host = g.document.createElement('div');
    g.document.body.appendChild(host);
    const trigger = g.document.createElement('button');
    trigger.className = 'astryx-top-nav-menu';
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    host.appendChild(trigger);
    const layer = g.document.createElement('div');
    layer.setAttribute('data-astryx-layer-root', '');
    host.appendChild(layer);
    trigger.addEventListener('click', () => {
      trigger.setAttribute('aria-expanded', 'true');
      layer.__astryxPopoverOpen = true;
      layer.textContent = 'menu';
    });
    const read = await openLayerMarkup(host, fn => fn());
    const drawn = read.find(html =>
      html.includes('class="astryx-top-nav-menu"'),
    );
    expect(drawn).toContain('aria-expanded="true"');
    expect(drawn).not.toContain('data-astryx-layer-root');
    host.remove();
  });
});
