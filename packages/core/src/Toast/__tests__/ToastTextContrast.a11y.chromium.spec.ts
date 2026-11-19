// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Toast/|packages/core/src/hooks/(mediaSide|useAutoMediaMode)\.ts|packages/themes/|apps/storybook/stories/Toast\.stories)

/**
 * @file ToastTextContrast.a11y.chromium.spec.ts
 * @input The built Toast story's error toast, shown in the default top-layer
 *   viewport, under every first-party theme, light and dark, in Chromium
 * @output Evidence that the rendered card's text reaches WCAG 2.2 AA text
 *   contrast (SC 1.4.3, 4.5:1) on the card
 * @position Real-engine proof for component:Toast FR14; jsdom paints nothing
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

/** WCAG 2.2 SC 1.4.3 (Contrast, Minimum): normal-size text. */
const AA_TEXT = 4.5;
const THEMES = [
  'neutral',
  'stone',
  'gothic',
  'butter',
  'chocolate',
  'matcha',
  'y2k',
];
const BODY = 'Check your network connection and try again.';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

for (const theme of THEMES) {
  for (const colorMode of ['light', 'dark']) {
    test(`${theme} ${colorMode}: the error toast's text reaches ${AA_TEXT}:1 on its card`, async ({
      page,
    }) => {
      await page.emulateMedia({
        colorScheme: colorMode === 'dark' ? 'dark' : 'light',
      });
      await page.goto(
        `${storybook.origin}/iframe.html?id=core-toast--error-persists&viewMode=story&globals=colorMode:${colorMode};astryxTheme:${theme}`,
      );
      await page.getByRole('button', {name: 'Trigger error'}).click();
      const body = page.getByText(BODY).first();
      await expect(body).toBeVisible();
      await page.waitForTimeout(600); // the entrance and the measured side
      const {ratio} = await body.evaluate(el => {
        const channels = (c: string) => {
          const n = (c.match(/[\d.]+/g) ?? []).map(Number);
          return {r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1};
        };
        const layers: {r: number; g: number; b: number; a: number}[] = [];
        for (let node: Element | null = el; node; node = node.parentElement) {
          const bg = channels(getComputedStyle(node).backgroundColor);
          if (bg.a > 0) {
            layers.push(bg);
            if (bg.a >= 1) {
              break;
            }
          }
        }
        let back = {r: 255, g: 255, b: 255};
        for (const layer of layers.reverse()) {
          back = {
            r: layer.r * layer.a + back.r * (1 - layer.a),
            g: layer.g * layer.a + back.g * (1 - layer.a),
            b: layer.b * layer.a + back.b * (1 - layer.a),
          };
        }
        const lum = ({r, g, b}: {r: number; g: number; b: number}) => {
          const lin = (v: number) => {
            const s = v / 255;
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
        };
        const color = getComputedStyle(el).color;
        const [hi, lo] = [lum(channels(color)), lum(back)].sort(
          (x, y) => y - x,
        );
        return {ratio: (hi + 0.05) / (lo + 0.05)};
      });
      expect(ratio).toBeGreaterThanOrEqual(AA_TEXT);
    });
  }
}
