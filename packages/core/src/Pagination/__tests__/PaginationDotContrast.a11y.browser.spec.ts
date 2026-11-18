// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PaginationDotContrast.a11y.browser.spec.ts
 * @input The built "Dots Variant" Pagination story in every bundled theme,
 *   light and dark
 * @output Real-browser evidence that each page dot that is not the current
 *   page stands out at 3:1 from what is behind it (WCAG 1.4.11)
 * @position Browser proof of Pagination FR9's dot contrast
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

const THEMES = [
  'none',
  'neutral',
  'stone',
  'butter',
  'chocolate',
  'gothic',
  'matcha',
  'y2k',
];

for (const theme of THEMES) {
  for (const mode of ['light', 'dark'] as const) {
    test(`a dot that is not the current page stands out at 3:1 (${theme}, ${mode})`, async ({
      page,
    }) => {
      await page.goto(
        `${storybook.origin}/iframe.html?id=core-pagination--dots-variant&viewMode=story&globals=astryxTheme:${theme};colorMode:${mode}`,
      );
      const dots = page.getByRole('radio', {checked: false});
      await expect(dots.first()).toBeVisible();
      const ratios = await dots.evaluateAll(elements => {
        // An sRGB colour as [r, g, b, a] with r, g, b in 0..255.
        const parse = (color: string): number[] => {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 1;
          const context = canvas.getContext('2d');
          if (context == null) {
            return [0, 0, 0, 0];
          }
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
          return [r, g, b, a / 255];
        };
        const over = (top: number[], bottom: number[]): number[] =>
          [0, 1, 2].map(i => top[i] * top[3] + bottom[i] * (1 - top[3]));
        const luminance = (rgb: number[]): number => {
          const [r, g, b] = rgb.map(value => {
            const c = value / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        // What is painted behind an element: its ancestors' backgrounds,
        // composited down to the canvas.
        const behind = (element: Element): number[] => {
          const layers: number[][] = [];
          for (
            let node = element.parentElement;
            node != null;
            node = node.parentElement
          ) {
            const color = parse(getComputedStyle(node).backgroundColor);
            if (color[3] > 0) {
              layers.push(color);
              if (color[3] === 1) {
                break;
              }
            }
          }
          let base = [255, 255, 255, 1];
          for (const layer of layers.reverse()) {
            base = [...over(layer, base), 1];
          }
          return base;
        };
        return elements.map(element => {
          const back = behind(element);
          const dot = over(
            parse(getComputedStyle(element).backgroundColor),
            back,
          );
          const [light, dark] = [luminance(dot), luminance(back)].sort(
            (a, b) => b - a,
          );
          return (light + 0.05) / (dark + 0.05);
        });
      });
      expect(ratios.length).toBeGreaterThan(0);
      for (const ratio of ratios) {
        expect(ratio).toBeGreaterThanOrEqual(3);
      }
    });
  }
}
