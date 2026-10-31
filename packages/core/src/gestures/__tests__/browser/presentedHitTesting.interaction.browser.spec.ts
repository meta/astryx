// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file presentedHitTesting.interaction.browser.spec.ts
 * @input presentedFixture.ts bundled with esbuild: a sheet that Core's
 *   animator springs up into place or down off the screen, over a scrim
 * @output Browser proof that the animator's presented offset is how far the
 *   engine draws the springing sheet from where its motion started, and
 *   that with hit testing answering at that start, as iOS WebKit does
 *   mid-animation, in both directions: a tap on the drawn Done button clicks
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

  test(`the animator reports where the spring draws the sheet moving ${direction}`, async ({
    page,
  }) => {
    await load(page);
    await page.evaluate(d => window.__move(d), direction);
    const result = await page.evaluate(async d => {
      const frame = async (): Promise<void> => {
        await new Promise<void>(resolve => {
          requestAnimationFrame(() => resolve());
        });
      };
      await frame();
      // A spring, not a constant-speed slide: read off the animator's curve.
      const speeds = window.__springSpeeds().map(Math.abs);
      const taken: ReturnType<typeof window.__offsets>[] = [];
      for (let restarts = 0; taken.length < 3 && restarts < 4;) {
        await frame();
        const sample = window.__offsets();
        const last = taken[taken.length - 1];
        if (Math.abs(sample.velocity) < 1) {
          // Settled before three samples on a busy machine: go again.
          window.__move(d);
          taken.length = 0;
          restarts += 1;
        } else if (
          Math.abs(sample.offset) > 20 &&
          (last == null || Math.abs(sample.offset - last.offset) > 40)
        ) {
          taken.push(sample);
        }
      }
      return {speeds, taken};
    }, direction);
    expect(
      Math.max(...result.speeds) / Math.min(...result.speeds),
    ).toBeGreaterThan(2);
    expect(result.taken).toHaveLength(3);
    for (const sample of result.taken) {
      // Drawn away from its start by what the animator reports. The offset
      // is read at the page's clock and the drawn top at its frame's, so the
      // two differ by the spring's travel in between.
      expect(
        Math.abs(sample.drawnTop - sample.startTop - sample.offset),
      ).toBeLessThan(2 + (Math.abs(sample.velocity) * sample.lag) / 1000);
    }
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
