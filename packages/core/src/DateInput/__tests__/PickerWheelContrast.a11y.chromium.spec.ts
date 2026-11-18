// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/theme/ ^packages/themes/ ^apps/storybook/stories/WheelProofs

/**
 * @file PickerWheelContrast.a11y.chromium.spec.ts
 * @input The built `Core/Wheel` touch-minutes story (the touch column) in
 *   every shipped theme, light and dark, read as screenshots
 * @output Chromium proof that every row in view of the touch column meets
 *   WCAG AA contrast against its background, as the page draws it
 * @position The column fades its rows with a mask, which axe cannot see. So
 *   the spec reads pixels: each row's strongest text pixel against the row's
 *   background.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
// @ts-expect-error -- pngjs ships no declarations; runtime support is pinned.
import {PNG} from 'pngjs';
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

// Two device pixels per CSS pixel, so each glyph stroke covers whole pixels.
test.use({deviceScaleFactor: 2});

const STORY = 'core-wheel--touch-minutes';
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

type Rgb = [number, number, number];

function luminance([r, g, b]: Rgb): number {
  const linear = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/** The boxes of the rows whose centres sit inside the column, in CSS px. */
async function rowsInView(page: Page) {
  return page.evaluate(() => {
    const listbox = document.querySelector('[role="listbox"]');
    if (listbox == null) {
      return [];
    }
    const view = listbox.getBoundingClientRect();
    return [...listbox.querySelectorAll<HTMLElement>('[role="option"]')]
      .map(row => {
        const box = row.getBoundingClientRect();
        return {
          label: row.dataset.label ?? row.textContent ?? '',
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
        };
      })
      .filter(box => {
        const middle = box.y + box.height / 2;
        return middle > view.top && middle < view.bottom;
      });
  });
}

/**
 * Each row in view below WCAG AA (4.5:1). A row's background is its most
 * common pixel. Its text is the pixel that differs most from that background,
 * which is a fully covered stroke at two device pixels per CSS pixel.
 */
async function rowsBelowAA(page: Page): Promise<string[]> {
  const rows = await rowsInView(page);
  const scale = 2;
  const failures: string[] = [];
  for (const row of rows) {
    const shot = await page.screenshot({
      animations: 'disabled',
      clip: {x: row.x, y: row.y, width: row.width, height: row.height},
    });
    const png = PNG.sync.read(shot);
    const counts = new Map<number, number>();
    const pixels: Rgb[] = [];
    for (let i = 0; i < png.data.length; i += 4) {
      const pixel: Rgb = [png.data[i], png.data[i + 1], png.data[i + 2]];
      pixels.push(pixel);
      const key = (pixel[0] << 16) | (pixel[1] << 8) | pixel[2];
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const [key] = [...counts].reduce((best, entry) =>
      entry[1] > best[1] ? entry : best,
    );
    const background: Rgb = [(key >> 16) & 255, (key >> 8) & 255, key & 255];
    const ratio = Math.max(...pixels.map(pixel => contrast(pixel, background)));
    if (pixels.length < row.width * row.height * scale * scale * 0.9) {
      failures.push(`row ${row.label}: screenshot too small to read`);
    } else if (ratio < 4.5) {
      failures.push(`row ${row.label}: ${ratio.toFixed(2)}:1`);
    }
  }
  return failures;
}

for (const theme of SHIPPED_THEMES) {
  test(`the touch column's rows meet AA contrast in ${theme}, light and dark`, async ({
    page,
  }) => {
    const failures: string[] = [];
    for (const mode of MODES) {
      await page.goto(
        `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story&globals=astryxTheme:${theme};colorMode:${mode}`,
      );
      await expect(page.getByRole('option').first()).toBeVisible();
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
      });
      // At 00 the column shows rows 00 to 04 below the band, and the claim
      // rests on the outer ones.
      expect((await rowsInView(page)).length).toBeGreaterThanOrEqual(5);
      const found = await rowsBelowAA(page);
      failures.push(...found.map(failure => `${mode}: ${failure}`));
    }
    expect(failures).toEqual([]);
  });
}
