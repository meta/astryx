// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Toast/|packages/core/src/theme/|apps/storybook/stories/Toast\.stories)

/**
 * @file ToastFallbackTheme.a11y.chromium.spec.ts
 * @input The Core/Toast fallback-under-a-Theme story in a built Storybook,
 *   with the toolbar theme set to none so no LayerProvider is above it, in
 *   Chromium
 * @output Evidence that a toast in the fallback viewport keeps the Theme it
 *   was shown from, and text at WCAG 2.2 AA contrast (SC 1.4.3, 4.5:1), after
 *   a host page names its own theme and colors on the root element, in light
 *   and in dark, for a page Theme and for a Theme around one region
 * @position Run with `pnpm test:a11y-contract`. jsdom applies no scoped theme
 *   CSS, so only an engine shows which rules reach the card and its text.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

/** WCAG 2.2 SC 1.4.3 (Contrast, Minimum): normal-size text. */
const AA_TEXT = 4.5;
const STORY = 'core-toast--fallback-under-theme';
const PAGE_THEME = 'toast-fallback-page';
const REGION_THEME = 'toast-fallback-region';
/** A theme name the page holds no CSS for, as a host's own theme is. */
const HOST_THEME = 'host';
/**
 * The host's page text and inverted surface for each scheme, as the plain
 * values a host writes on the root. They are the default theme's.
 */
const HOST_COLORS = {
  light: {
    '--color-text-primary': '#0A1317',
    '--color-background-inverted': '#0A1317',
  },
  dark: {
    '--color-text-primary': '#DFE2E5',
    '--color-background-inverted': '#FFFFFF',
  },
} as const;
const CASES = [
  {button: 'Save page', body: 'Page saved', theme: PAGE_THEME},
  {button: 'Save region', body: 'Region saved', theme: REGION_THEME},
] as const;

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

/**
 * Open the story, wait for the page Theme to name itself on the root, then
 * theme the root as a host does to the frame it shows a page in.
 */
async function openStoryInHost(
  page: Page,
  scheme: 'light' | 'dark',
): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story&globals=astryxTheme:none`,
  );
  await expect(page.locator('html')).toHaveAttribute(
    'data-astryx-theme',
    PAGE_THEME,
  );
  await page.evaluate(
    ([theme, mode, colors]) => {
      const root = document.documentElement;
      root.setAttribute('data-astryx-theme', theme);
      root.setAttribute('data-theme', mode);
      root.style.colorScheme = mode;
      for (const [name, value] of Object.entries(colors)) {
        root.style.setProperty(name, value);
      }
    },
    [HOST_THEME, scheme, HOST_COLORS[scheme]] as const,
  );
}

/** The theme whose rules reach the toast, and its text's contrast on the card. */
async function shownToast(
  page: Page,
  body: string,
): Promise<{theme: string | null; ratio: number}> {
  const text = page.locator('.astryx-toast').getByText(body);
  await expect(text).toBeVisible();
  await page.waitForTimeout(600); // the entrance and the measured side
  return text.evaluate(el => {
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
    const [hi, lo] = [
      lum(channels(getComputedStyle(el).color)),
      lum(back),
    ].sort((x, y) => y - x);
    return {
      theme:
        el.closest('[data-astryx-theme]')?.getAttribute('data-astryx-theme') ??
        null,
      ratio: (hi + 0.05) / (lo + 0.05),
    };
  });
}

for (const scheme of ['light', 'dark'] as const) {
  for (const {button, body, theme} of CASES) {
    test(`host ${scheme}: a toast from "${button}" keeps ${theme} and reaches ${AA_TEXT}:1`, async ({
      page,
    }) => {
      await openStoryInHost(page, scheme);
      await page.getByRole('button', {name: button}).click();
      const toast = await shownToast(page, body);
      expect.soft(toast.theme).toBe(theme);
      expect(toast.ratio).toBeGreaterThanOrEqual(AA_TEXT);
    });
  }
}
