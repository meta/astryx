// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/theme/ ^packages/themes/ ^apps/storybook/stories/WheelProofs

/**
 * @file WheelContrast.a11y.chromium.spec.ts
 * @input The built `Core/Wheel` minutes story (the scrolling column) in every
 *   shipped theme, light and dark, and axe's color-contrast rule
 * @output Chromium proof that every row of the scrolling column and its
 *   readout meet WCAG AA contrast, at rest and in the still frame the release
 *   audit scans
 * @position The release audit scans one theme in a still frame. This spec
 *   holds the same rule in each shipped theme when the column or a theme
 *   changes.
 */

import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  test,
  type Browser,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
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

const STORY = 'core-wheel--minutes';
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

// The release audit's still frame (.github/scripts/accessibility-audit.js):
// every animation and transition is held at its end.
const STILL_FRAME = `
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
}
`;

// Tipped rows overlap. The tip does not change a colour, so flat rows give
// each row its own box.
const FLAT_ROWS = '[role="option"] > span { transform: none !important; }';

/**
 * The rows in view that fall below WCAG AA (4.5:1). The measure uses what the
 * page draws. The text colour takes the opacity of the row and its ancestors.
 * Every background behind the row counts, the band included. Inside the
 * scroller, axe reports these backgrounds as unknown, so the spec measures.
 */
async function rowsBelowAA(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas').getContext('2d', {
      willReadFrequently: true,
    })!;
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
    const failures: string[] = [];
    for (const listbox of document.querySelectorAll('[role="listbox"]')) {
      const view = listbox.getBoundingClientRect();
      const band = listbox.parentElement?.querySelector(
        ':scope > [aria-hidden="true"]',
      );
      for (const row of listbox.querySelectorAll<HTMLElement>(
        '[role="option"]',
      )) {
        const text = row.querySelector('span') ?? row;
        const box = text.getBoundingClientRect();
        const middle = box.top + box.height / 2;
        if (middle < view.top || middle > view.bottom) {
          continue;
        }
        let opacity = 1;
        const ancestors: Element[] = [];
        for (
          let node: Element | null = text;
          node != null;
          node = node.parentElement
        ) {
          opacity *= Number(getComputedStyle(node).opacity);
          ancestors.unshift(node);
        }
        let background: Rgba = [255, 255, 255, 1];
        for (const node of ancestors) {
          background = over(
            rgba(getComputedStyle(node).backgroundColor),
            background,
          );
        }
        if (band != null) {
          const plate = band.getBoundingClientRect();
          if (middle > plate.top && middle < plate.bottom) {
            background = over(
              rgba(getComputedStyle(band).backgroundColor),
              background,
            );
          }
        }
        const ink = rgba(getComputedStyle(text).color);
        const drawn = over(
          [ink[0], ink[1], ink[2], ink[3] * opacity],
          background,
        );
        const [high, low] = [luminance(drawn), luminance(background)].sort(
          (a, b) => b - a,
        );
        const ratio = (high + 0.05) / (low + 0.05);
        if (ratio < 4.5) {
          failures.push(
            `row ${row.dataset.label ?? row.textContent}: ${ratio.toFixed(2)}:1`,
          );
        }
      }
    }
    return failures;
  });
}

/** The color-contrast failures of one story, one way it is shown. */
async function contrastFailures(
  browser: Browser,
  url: string,
  isStill: boolean,
): Promise<string[]> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    if (isStill) {
      await page.addInitScript(css => {
        const add = () => {
          const style = document.createElement('style');
          style.textContent = css;
          document.head.append(style);
        };
        if (document.head != null) {
          add();
        } else {
          document.addEventListener('DOMContentLoaded', add);
        }
      }, STILL_FRAME);
    }
    await page.goto(url);
    await expect(page.getByRole('option').first()).toBeVisible();
    await page.addStyleTag({content: FLAT_ROWS});
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    const {violations} = await new AxeBuilder({page})
      .withRules(['color-contrast'])
      .analyze();
    return [
      ...violations.flatMap(violation =>
        violation.nodes.map(node => {
          const data = (node.any[0]?.data ?? {}) as Record<string, unknown>;
          return `${node.target.join(' ')}: ${String(data.fgColor)} on ${String(data.bgColor)}, ${String(data.contrastRatio)}:1`;
        }),
      ),
      ...(await rowsBelowAA(page)),
    ];
  } finally {
    await context.close();
  }
}

for (const theme of SHIPPED_THEMES) {
  test(`the scrolling column meets AA contrast in ${theme}, light and dark, at rest and still`, async ({
    browser,
  }) => {
    const failures: string[] = [];
    for (const mode of MODES) {
      const url = `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story&globals=astryxTheme:${theme};colorMode:${mode}`;
      for (const isStill of [false, true]) {
        const found = await contrastFailures(browser, url, isStill);
        const frame = isStill ? 'still' : 'at rest';
        failures.push(...found.map(failure => `${mode}, ${frame}: ${failure}`));
      }
    }
    expect(failures).toEqual([]);
  });
}
