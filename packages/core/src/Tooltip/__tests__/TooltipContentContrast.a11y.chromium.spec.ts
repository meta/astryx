// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/theme/ ^packages/themes/

/**
 * @file TooltipContentContrast.a11y.chromium.spec.ts
 * @input The built `Core/Tooltip` RichContent story in every shipped theme,
 *   light and dark: a plain string, the docs' `Text` example, default and
 *   secondary `Text`, an icon with text, and bare text mixed with an element,
 *   each in an open tooltip
 * @output Chromium proof that text in a tooltip meets WCAG AA (4.5:1) and an
 *   icon meets 3:1 against the tooltip's painted surface, and that bare text
 *   keeps the `tooltip` surface's own color
 * @position Content colors come from the media context around the content.
 *   Only a real engine resolves the theme tokens and the painted surface, so
 *   the measure runs in a browser.
 *
 * SYNC: Fixture lives in /apps/storybook/stories/Tooltip.stories.tsx
 *   (RichContent).
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
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

const STORY = 'core-tooltip--rich-content';
const SHIPPED_THEMES = [
  'butter',
  'chocolate',
  'gothic',
  'matcha',
  'neutral',
  'stone',
  'y2k',
];
const MODES = ['light', 'dark'];

/**
 * Each tooltip's text runs and icons that fall below their minimum: 4.5:1 for
 * text, 3:1 for an icon. The measure uses the painted surface behind the
 * content and the color each part draws with, opacity included.
 */
async function lowContrastParts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas').getContext('2d', {
      willReadFrequently: true,
    }) as CanvasRenderingContext2D;
    type Rgba = [number, number, number, number];
    const rgba = (color: string): Rgba => {
      canvas.clearRect(0, 0, 1, 1);
      canvas.fillStyle = color;
      canvas.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const over = (top: Rgba, under: Rgba): Rgba => {
      const a = top[3] + under[3] * (1 - top[3]);
      const mix = (i: number) =>
        a === 0
          ? 0
          : (top[i] * top[3] + under[i] * under[3] * (1 - top[3])) / a;
      return [mix(0), mix(1), mix(2), a];
    };
    const luminance = ([r, g, b]: Rgba) => {
      const linear = (v: number) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
    };
    const ratio = (a: Rgba, b: Rgba) => {
      const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (high + 0.05) / (low + 0.05);
    };
    const backdropOf = (element: Element): Rgba => {
      const chain: Element[] = [];
      for (
        let node: Element | null = element;
        node;
        node = node.parentElement
      ) {
        chain.unshift(node);
      }
      let background: Rgba = [255, 255, 255, 1];
      for (const node of chain) {
        background = over(
          rgba(getComputedStyle(node).backgroundColor),
          background,
        );
      }
      return background;
    };
    const drawnColor = (element: Element, color: string, background: Rgba) => {
      let opacity = 1;
      for (
        let node: Element | null = element;
        node;
        node = node.parentElement
      ) {
        opacity *= Number(getComputedStyle(node).opacity);
      }
      const ink = rgba(color);
      return over([ink[0], ink[1], ink[2], ink[3] * opacity], background);
    };

    const failures: string[] = [];
    for (const tooltip of document.querySelectorAll('[role="tooltip"]')) {
      const walker = document.createTreeWalker(tooltip, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent?.trim();
        const element = node.parentElement;
        if (!text || element == null) {
          continue;
        }
        const background = backdropOf(element);
        const drawn = drawnColor(
          element,
          getComputedStyle(element).color,
          background,
        );
        const found = ratio(drawn, background);
        if (found < 4.5) {
          failures.push(`text "${text}": ${found.toFixed(2)}:1`);
        }
      }
      for (const icon of tooltip.querySelectorAll('svg')) {
        const background = backdropOf(icon);
        const style = getComputedStyle(icon);
        const paint =
          style.fill !== 'none' && !style.fill.startsWith('url(')
            ? style.fill
            : style.stroke !== 'none'
              ? style.stroke
              : style.color;
        const drawn = drawnColor(icon, paint, background);
        const found = ratio(drawn, background);
        if (found < 3) {
          failures.push(`icon: ${found.toFixed(2)}:1`);
        }
      }
    }
    return failures;
  });
}

for (const theme of SHIPPED_THEMES) {
  test(`tooltip text reaches 4.5:1 and icons 3:1 in ${theme}, light and dark`, async ({
    page,
  }) => {
    const failures: string[] = [];
    for (const mode of MODES) {
      await page.goto(
        `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story&globals=astryxTheme:${theme};colorMode:${mode}`,
      );
      // Measure at rest, not during the entrance fade.
      await holdMotionStill(page);
      await expect(page.getByRole('tooltip')).toHaveCount(6);
      await expect(page.getByText('Body text')).toBeVisible();
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
      });
      failures.push(
        ...(await lowContrastParts(page)).map(failure => `${mode}: ${failure}`),
      );
    }
    expect(failures).toEqual([]);
  });
}

for (const theme of SHIPPED_THEMES) {
  test(`bare text keeps the tooltip surface's color in ${theme}, light and dark`, async ({
    page,
  }) => {
    const mismatches: string[] = [];
    for (const mode of MODES) {
      await page.goto(
        `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story&globals=astryxTheme:${theme};colorMode:${mode}`,
      );
      // Measure at rest, not during the entrance fade.
      await holdMotionStill(page);
      await expect(page.getByRole('tooltip')).toHaveCount(6);
      const found = await page.evaluate(() => {
        const out: string[] = [];
        for (const tooltip of document.querySelectorAll('[role="tooltip"]')) {
          const surface = getComputedStyle(tooltip).color;
          const walker = document.createTreeWalker(
            tooltip,
            NodeFilter.SHOW_TEXT,
          );
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const text = node.textContent?.trim();
            const element = node.parentElement;
            // Only text no component colors: a plain string, or bare text and
            // plain elements beside it.
            if (
              !text ||
              element == null ||
              !['Plain string', 'Saved', 'now'].includes(text)
            ) {
              continue;
            }
            const color = getComputedStyle(element).color;
            if (color !== surface) {
              out.push(`"${text}": ${color} instead of ${surface}`);
            }
          }
        }
        return out;
      });
      mismatches.push(...found.map(mismatch => `${mode}: ${mismatch}`));
    }
    expect(mismatches).toEqual([]);
  });
}
