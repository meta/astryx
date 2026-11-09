// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file preserveAnimations.interaction.browser.spec.ts
 * @input `preserveAnimations` bundled with esbuild onto a fixture page, in
 *   real Chromium and WebKit
 * @output A layer placed afresh keeps its content's CSS motion: an ended
 *   `@starting-style` fade-in stays ended, and a running animation goes on
 *   from where it was
 * @position Real-browser verification of the layer runtime's re-placement
 */

import {fileURLToPath} from 'node:url';
import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {build} from 'esbuild';
import type * as Bundle from '../preserveAnimations';

declare global {
  interface Window {
    LayerReplacement: typeof Bundle;
  }
}

let script = '';

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [
      fileURLToPath(new URL('../preserveAnimations.ts', import.meta.url)),
    ],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'LayerReplacement',
    target: 'es2022',
  });
  script = result.outputFiles[0].text;
});

test('a layer placed afresh does not play an ended @starting-style fade-in again, and a running animation goes on from where it was', async ({
  page,
}) => {
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  .segment { display: block; transition: opacity 1000ms linear; }
  @starting-style { .segment { opacity: 0; } }
  @keyframes layer-pulse { from { opacity: 1; } to { opacity: 0.2; } }
  .pulse { display: block; animation: layer-pulse 1000ms linear infinite; }
</style>
<div id="layer"><span class="segment">Streamed text</span><span class="pulse">Typing</span></div>
<script>${script}</script>`;
  await page.route('http://layer.test/', async route =>
    route.fulfill({contentType: 'text/html', body: html}),
  );
  await page.goto('http://layer.test/');
  const result = await page.evaluate(async () => {
    const layer = document.querySelector('#layer') as HTMLElement;
    const segment = layer.querySelector('.segment') as HTMLElement;
    const pulse = layer.querySelector('.pulse') as HTMLElement;
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => resolve());
    });
    // The segment's fade-in has ended, and the pulse is 400 ms in.
    for (const animation of segment.getAnimations()) {
      animation.finish();
    }
    const [running] = pulse.getAnimations();
    running.currentTime = 400;
    // As the runtime places a layer afresh: out of rendering for one forced
    // layout, and back. Coming back starts the fade-in again.
    window.LayerReplacement.preserveAnimations(layer, () => {
      layer.style.display = 'none';
      layer.getBoundingClientRect();
      layer.style.display = '';
    });
    const [pulseAfter] = pulse.getAnimations();
    return {
      segment: Number(getComputedStyle(segment).opacity),
      pulse: pulseAfter == null ? null : Number(pulseAfter.currentTime),
    };
  });
  expect(result.segment).toBe(1);
  expect(result.pulse).not.toBeNull();
  expect(Math.abs(Number(result.pulse) - 400)).toBeLessThan(1);
});
