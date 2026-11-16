// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file mediaSurfaceRootMapping.a11y.chromium.spec.ts
 * @input The MediaTheme OnDark and OnLight stories under the Neutral theme, on
 *   a light and a dark page, with an app rule that maps the secondary text and
 *   icon tokens on the theme root to values chosen for the page
 * @output Real-Chromium evidence that a media surface resolves its secondary
 *   text and icon colors itself, so the page's mapping does not reach it, and
 *   both meet WCAG 2.2 contrast on the surface (text 4.5:1, SC 1.4.3; icons
 *   3:1, SC 1.4.11)
 * @position Browser evidence for the media surface's scheme-dependent tokens
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

// An app's token bridge: a grey chosen for the page, set on the theme root
// with a per-mode value, not a light-dark() pair.
const PAGE_GREY = {light: '#65676b', dark: '#b0b3b8'} as const;

interface Contrast {
  text: number;
  icon: number;
}

for (const pageMode of ['light', 'dark'] as const) {
  for (const surface of ['dark', 'light'] as const) {
    test(`a ${surface} media surface on a ${pageMode} page keeps readable secondary text and icons under an app's root mapping`, async ({
      page,
    }) => {
      const story = `core-themes-mediatheme--on-${surface}`;
      await page.goto(
        `${storybook.origin}/iframe.html?id=${story}&viewMode=story&globals=colorMode:${pageMode}`,
      );
      const media = page.locator(`[data-astryx-media="${surface}"]`).first();
      await media.waitFor();
      const grey = PAGE_GREY[pageMode];
      await page.addStyleTag({
        content: `[data-astryx-theme] { --color-text-secondary: ${grey} !important; --color-icon-secondary: ${grey} !important; }`,
      });
      const contrast = await media.evaluate((element): Contrast => {
        const channels = (color: string): number[] => {
          const values = color.match(/[\d.]+/g)?.map(Number) ?? [];
          // color(srgb r g b) gives 0-1 channels; rgb() gives 0-255.
          return color.startsWith('color(')
            ? values.slice(0, 3).map(value => value * 255)
            : values.slice(0, 3);
        };
        const alpha = (color: string): number => {
          if (color === 'transparent') return 0;
          const values = color.match(/[\d.]+/g)?.map(Number) ?? [];
          const slash = color.includes('/');
          if (color.startsWith('rgba(') || slash) {
            return values[3] ?? 1;
          }
          return 1;
        };
        const luminance = ([r, g, b]: number[]): number => {
          const linear = (value: number) => {
            const c = value / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
        };
        const ratio = (a: number[], b: number[]) => {
          const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
          return (hi + 0.05) / (lo + 0.05);
        };
        let host: Element | null = element;
        let background = 'transparent';
        while (host != null) {
          const color = getComputedStyle(host).backgroundColor;
          if (alpha(color) > 0) {
            background = color;
            break;
          }
          host = host.parentElement;
        }
        const probe = (token: string) => {
          const span = document.createElement('span');
          span.style.color = `var(${token})`;
          span.textContent = 'probe';
          element.append(span);
          const color = getComputedStyle(span).color;
          span.remove();
          return ratio(channels(color), channels(background));
        };
        return {
          text: probe('--color-text-secondary'),
          icon: probe('--color-icon-secondary'),
        };
      });
      expect(contrast.text).toBeGreaterThanOrEqual(4.5);
      expect(contrast.icon).toBeGreaterThanOrEqual(3);
    });
  }
}
