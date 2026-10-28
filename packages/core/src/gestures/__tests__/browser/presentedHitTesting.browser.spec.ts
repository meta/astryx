// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file presentedHitTesting.browser.spec.ts
 * @input presentedFixture.ts bundled with esbuild: a sheet the real animator
 *   moves on the compositor, over a scrim
 * @output Browser proof that the animator's presented offset is how far the
 *   engine draws the sheet from where its animation started, and that with
 *   hit testing answering at that start, as iOS WebKit does mid-animation, a
 *   tap on the drawn Done button clicks Done once, never the sheet's body
 *   or the scrim
 * @position Browser tests of the presented hit testing in GestureHost.ts and
 *   motion/presentation.ts (see playwright.config.ts beside this file); the
 *   real iOS behaviour is proven on the simulator
 */

import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {expect, test} from '@playwright/test';

let bundle = '';

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        'presentedFixture.ts',
      ),
    ],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
  });
  bundle = result.outputFiles[0].text;
});

test('a tap on a sheet the compositor is moving reaches what is drawn, once', async ({
  page,
}) => {
  await page.goto('about:blank');
  await page.setContent(
    '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><body></body>',
  );
  await page.addScriptTag({content: bundle});
  await page.evaluate(() => window.__dismiss());
  await page.waitForTimeout(300);
  const samples: {offset: number; drawnTop: number; startTop: number}[] = [];
  for (let i = 0; i < 3; i++) {
    samples.push(await page.evaluate(() => window.__offsets()));
    await page.waitForTimeout(150);
  }
  for (const sample of samples) {
    // The sheet is drawn below its start, by what the animator reports (one
    // frame of motion apart at most: 370 px/s).
    expect(sample.offset).toBeGreaterThan(20);
    expect(
      Math.abs(sample.drawnTop - sample.startTop - sample.offset),
    ).toBeLessThan(8);
  }

  // iOS WebKit's hit testing, mimicked: the drawn Done button sits over the
  // sheet's body where the sheet started.
  await page.evaluate(() => window.__mimicIos());
  const onDone = await page.evaluate(() => {
    const done = document.getElementById('done') as HTMLElement;
    const box = done.getBoundingClientRect();
    return {
      x: box.left + box.width / 2,
      y: box.top + box.height / 2 + window.__offsets().offset,
    };
  });
  const hit = await page.evaluate(
    ({x, y}) => document.elementFromPoint(x, y)?.id,
    onDone,
  );
  expect(hit).toBe('sheet');
  await page.evaluate(({x, y}) => window.__tap(x, y), onDone);
  const log = await page.evaluate(() => window.__log);
  expect(log.filter(entry => entry === 'click:done')).toHaveLength(1);
  expect(log).not.toContain('click:scrim');
  expect(log.some(entry => entry.startsWith('scrim:'))).toBe(false);
  expect(log).toContain('touchend:prevented');
});
