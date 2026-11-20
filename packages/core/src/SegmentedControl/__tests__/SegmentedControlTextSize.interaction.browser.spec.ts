// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SegmentedControlTextSize.interaction.browser.spec.ts
 * @input The built SegmentedControl stories, with the segment labels' text
 *   enlarged while the element sizes stay put, as iOS Dynamic Type does
 * @output Real-browser evidence that a segment grows with its label, so the
 *   label stays inside its own segment, and that the default text size keeps
 *   every segment at its size
 * @position Browser proof of SegmentedControl's text growth (AST-102 FR4)
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
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

async function openStory(
  page: Page,
  story: string,
  theme: string,
): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-segmentedcontrol--${story}&viewMode=story&globals=astryxTheme:${theme}`,
  );
  await page.locator('#storybook-root [role="radio"]').first().waitFor();
}

/** Each labelled segment's box against its label's line box. */
async function readSegments(page: Page) {
  return page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '#storybook-root [role="radio"]',
      ),
    ]
      .filter(segment => (segment.textContent ?? '').trim() !== '')
      .map(segment => {
        const range = document.createRange();
        range.selectNodeContents(segment);
        const label = range.getBoundingClientRect();
        const box = segment.getBoundingClientRect();
        return {
          name: (segment.textContent ?? '').trim(),
          height: box.height,
          above: box.top - label.top,
          below: label.bottom - box.bottom,
        };
      }),
  );
}

// Each theme's segment heights per size, as shipped before segments grew with
// their text. Stone sets no segment height, so it shows Core's own rule;
// Neutral overrides it.
const SHIPPED_HEIGHTS: Record<string, Record<string, number>> = {
  neutral: {sm: 20, md: 24, lg: 28},
  stone: {sm: 24, md: 28, lg: 32},
};
const THEMES = Object.keys(SHIPPED_HEIGHTS);

test.describe('a desktop page', () => {
  // The shipped heights are pinned on a desktop page, where the default text
  // size gives every label line room in its segment.
  test.use({
    viewport: {width: 1280, height: 800},
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
  });

  for (const theme of THEMES) {
    test(`at the default text size each segment keeps its shipped height: ${theme}`, async ({
      page,
    }) => {
      await openStory(page, 'size-variants', theme);
      const heights = await page.evaluate(() =>
        [
          ...document.querySelectorAll<HTMLElement>(
            '#storybook-root [role="radiogroup"]',
          ),
        ].map(group => ({
          size: group.dataset.size ?? 'md',
          heights: [...group.querySelectorAll('[role="radio"]')].map(
            segment => segment.getBoundingClientRect().height,
          ),
        })),
      );
      expect(heights.map(group => group.size)).toEqual(['sm', 'md', 'lg']);
      for (const group of heights) {
        for (const height of group.heights) {
          expect(height).toBeCloseTo(SHIPPED_HEIGHTS[theme][group.size], 1);
        }
      }
    });
  }
});

for (const theme of THEMES) {
  for (const story of ['default', 'size-variants', 'with-icons']) {
    test(`a label larger than the segment grows its segment: ${story}, ${theme}`, async ({
      page,
    }) => {
      await openStory(page, story, theme);
      // Grows the labels' text, but not the element sizes, the way iOS Dynamic
      // Type grows theme text at its accessibility sizes.
      await page.addStyleTag({
        content:
          '#storybook-root [role="radio"] { font-size: 40px; line-height: 60px; }',
      });
      const segments = await readSegments(page);
      expect(segments.length).toBeGreaterThan(0);
      for (const segment of segments) {
        expect(segment.above, segment.name).toBeLessThanOrEqual(1);
        expect(segment.below, segment.name).toBeLessThanOrEqual(1);
      }
    });
  }
}
