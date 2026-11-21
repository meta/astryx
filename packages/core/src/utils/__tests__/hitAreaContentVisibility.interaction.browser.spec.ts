// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hitAreaContentVisibility.interaction.browser.spec.ts
 * @input The hit-area runtime and a touch page with skipped content
 * @output Proves that measuring a visible control does not read skipped
 *   descendants, and that a revealed control still respects its neighbour
 * @position Browser regression for hitArea.ts, run by test:interaction
 */

import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import type * as hitArea from '../hitArea';

declare global {
  interface Window {
    hitAreaProof: typeof hitArea;
    skippedBoundsReads: number;
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
  });
  bundle = result.outputFiles[0].text;
});

test('skipped content is not measured and its revealed target keeps neighbour clearance', async ({
  page,
}) => {
  await page.goto('about:blank');
  await page.setContent(`<!doctype html>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body { margin: 0; }
      button, a { display: inline-block; box-sizing: border-box; padding: 0;
        width: 24px; height: 24px; vertical-align: top; }
      #visible { margin: 40px; }
      #skipped { position: absolute; top: 10000px; left: 40px;
        width: 120px; content-visibility: auto; contain-intrinsic-size: auto 100px; }
      #neighbour { margin-left: 8px; }
    </style>
    <button id="visible" aria-label="Visible"></button>
    <section id="skipped"><button id="target" aria-label="Revealed"></button><a
      id="neighbour" href="#details" aria-label="Neighbour"></a></section>`);
  await page.addScriptTag({content: bundle});
  await page.waitForFunction(
    () =>
      document.getElementById('target')?.checkVisibility({
        contentVisibilityAuto: true,
      }) === false,
  );

  await page.evaluate(() => {
    const {watchHitArea, writeHitInsets} = window.hitAreaProof;
    window.skippedBoundsReads = 0;
    for (const element of document.querySelectorAll<HTMLElement>(
      '#skipped button, #skipped a',
    )) {
      const read = element.getBoundingClientRect.bind(element);
      element.getBoundingClientRect = () => {
        window.skippedBoundsReads++;
        return read();
      };
    }
    for (const element of document.querySelectorAll<HTMLElement>(
      '#visible, #target',
    )) {
      watchHitArea(element, insets => writeHitInsets(element, insets));
      element.addEventListener('click', () => {
        element.dataset.clicked = 'true';
      });
    }
  });
  await expect(page.locator('#visible')).toHaveCSS(
    '--astryx-hit-inset-right',
    '10px',
  );
  expect(await page.evaluate(() => window.skippedBoundsReads)).toBe(0);

  await page.evaluate(() => window.scrollTo(0, 9900));
  await expect(page.locator('#target')).toHaveCSS(
    '--astryx-hit-inset-right',
    '4px',
  );
  expect(await page.evaluate(() => window.skippedBoundsReads)).toBeGreaterThan(
    0,
  );
  await page.getByRole('button', {name: 'Revealed'}).tap();
  await expect(page.locator('#target')).toHaveAttribute('data-clicked', 'true');
});
