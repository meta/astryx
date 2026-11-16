// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/MobileNav/|packages/core/src/SideNav/|apps/storybook/stories/MobileNav\.stories)

/**
 * @file MobileNav.textColor.a11y.chromium.spec.ts
 * @input The built MobileNav story under the gothic and neutral themes, light
 *   and dark, in a real Chromium
 * @output Evidence that the open panel's selected row, whose text inherits,
 *   draws in the panel's --color-text-primary and not the browser's dialog
 *   CanvasText, at WCAG 2.2 AA text contrast (SC 1.4.3, 4.5:1) on the panel
 * @position Real-engine proof for component:MobileNav FR15; jsdom has no
 *   browser default style for a dialog
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

/** WCAG 2.2 SC 1.4.3 (Contrast, Minimum): normal-size text. */
const AA_TEXT = 4.5;

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

for (const theme of ['gothic', 'neutral']) {
  for (const colorMode of ['light', 'dark']) {
    test(`${theme} ${colorMode}: the selected row reads the panel's text color`, async ({
      page,
    }) => {
      await page.emulateMedia({
        colorScheme: colorMode === 'dark' ? 'dark' : 'light',
      });
      await page.goto(
        `${storybook.origin}/iframe.html?id=core-mobilenav--default&viewMode=story&globals=colorMode:${colorMode};astryxTheme:${theme}`,
      );
      await page.getByRole('button', {name: 'Open Navigation'}).click();
      const nav = page.getByRole('dialog');
      await expect(nav).toBeVisible();
      const row = nav.getByRole('link', {name: 'Dashboard'});
      await expect(row).toBeVisible();
      await page.waitForTimeout(600); // the slide-in
      const {color, token, ratio} = await row.evaluate(el => {
        const panel = el.closest('[tabindex="-1"]') ?? el;
        const probe = document.createElement('span');
        probe.style.color = 'var(--color-text-primary)';
        panel.appendChild(probe);
        const tokenColor = getComputedStyle(probe).color;
        probe.remove();

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
        return {color, token: tokenColor, ratio: (hi + 0.05) / (lo + 0.05)};
      });
      expect(color).toBe(token);
      expect(ratio).toBeGreaterThanOrEqual(AA_TEXT);
    });
  }
}
