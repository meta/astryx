// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file presentedHitTesting.interaction.browser.spec.ts
 * @input presentedFixture.ts bundled with esbuild: a sheet that Core's
 *   animator springs up into place or down off the screen, over a scrim
 * @output Browser proof that, with the sheet on a spring and hit testing
 *   answering where its motion started, as iOS WebKit does mid-animation, in
 *   both directions: a tap on the drawn Done button clicks
 *   Done once, never the sheet's body or the scrim; and a drag on the drawn
 *   sheet begins the sheet's pan and catches the sheet where it is drawn,
 *   with no scrim gesture
 * @position Browser tests of the presented hit testing in GestureHost.ts and
 *   motion/presentation.ts, run by `pnpm test:interaction`
 *   (playwright.interaction.config.ts) and in CI's interaction proofs; the
 *   real iOS behaviour is proven on the simulator
 */

import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {expect, test, type Page} from '@playwright/test';

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

const load = async (page: Page) => {
  await page.goto('about:blank');
  await page.setContent(
    '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><body></body>',
  );
  await page.addScriptTag({content: bundle});
};

for (const direction of ['up', 'down'] as const) {
  // Where the motion started, the drawn target sits over the scrim (the sheet
  // springing up from below the screen) or over the sheet's body (the sheet
  // springing down from its rest).
  const engineTarget = direction === 'up' ? 'scrim' : 'sheet';

  test(`the sheet moves ${direction} on a spring, not at a constant speed`, async ({
    page,
  }) => {
    await load(page);
    await page.evaluate(d => window.__move(d), direction);
    const speeds = await page.evaluate(async () => {
      await new Promise<void>(resolve => {
        requestAnimationFrame(() => resolve());
      });
      return window.__springSpeeds().map(Math.abs);
    });
    // Read off the animator's own curve: its speed changes on the way.
    expect(Math.max(...speeds) / Math.min(...speeds)).toBeGreaterThan(2);
  });

  test(`a tap on the drawn Done while the spring moves the sheet ${direction} clicks Done once`, async ({
    page,
  }) => {
    await load(page);
    await page.evaluate(() => window.__mimicIos());
    await page.evaluate(d => window.__move(d), direction);
    const act = await page.evaluate(async () => window.__act('tap'));
    expect(act.engineTarget).toBe(engineTarget);
    const log = await page.evaluate(() => window.__log);
    expect(log.filter(entry => entry === 'click:done')).toHaveLength(1);
    expect(log).not.toContain('click:scrim');
    expect(log.some(entry => entry.startsWith('scrim:'))).toBe(false);
    expect(log).toContain('touchend:prevented');
  });

  test(`a drag on the drawn sheet while the spring moves it ${direction} catches it where it is drawn`, async ({
    page,
  }) => {
    await load(page);
    await page.evaluate(() => window.__mimicIos());
    await page.evaluate(d => window.__move(d), direction);
    const act = await page.evaluate(async () => window.__act('drag'));
    expect(act.engineTarget).toBe(engineTarget);
    const log = await page.evaluate(() => window.__log);
    expect(log).toContain('sheet:began');
    expect(log).toContain('sheet:ended');
    expect(log.some(entry => entry.startsWith('scrim:'))).toBe(false);
    // Caught where it was drawn, then it followed the finger.
    expect(act.caughtTop).not.toBeNull();
    expect(act.translationAtLift).toBeGreaterThan(90);
    expect(
      Math.abs(act.topAtLift - ((act.caughtTop ?? 0) + act.translationAtLift)),
    ).toBeLessThan(2);
    // The pan claimed the touch: its moves after the first are cancelled.
    expect(act.movesPrevented.slice(1).every(Boolean)).toBe(true);
  });
}
