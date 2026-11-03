// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Link/|packages/core/src/Text/|apps/storybook/stories/Link\.stories)

/**
 * @file Link.wrappedLines.a11y.chromium.spec.ts
 * @input Storybook story core-link--wrapped-lines
 * @output A button Link lines up its wrapped lines as an anchor Link does: in
 *   a start-aligned line, a right-to-left line and a centred line, the last
 *   line of each form starts at the same place within the Link and both forms
 *   compute the same text alignment.
 * @position Real-browser check: jsdom applies no button styles and lays out
 *   no lines.
 */

import {expect, test} from '@playwright/test';
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

test.afterAll(async () => storybook?.close());

for (const alignment of ['start', 'rtl', 'center'] as const) {
  test(`a button Link wraps like an anchor Link in a ${alignment} line`, async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-link--wrapped-lines&viewMode=story`,
    );
    const measure = async (form: 'anchor' | 'button') =>
      page
        .locator(`[data-wrapped-line="${alignment}-${form}"]`)
        .evaluate(line => {
          const root = line.firstElementChild as HTMLElement;
          const range = document.createRange();
          range.selectNodeContents(root);
          const lines = Array.from(range.getClientRects()).filter(
            rect => rect.width > 0,
          );
          const box = root.getBoundingClientRect();
          const last = lines[lines.length - 1];
          return {
            tag: root.tagName,
            lineCount: new Set(lines.map(rect => Math.round(rect.top))).size,
            textAlign: getComputedStyle(root).textAlign,
            // Where the last line sits inside the Link's own box.
            lastLeft: last.left - box.left,
            lastRight: box.right - last.right,
          };
        });
    const anchor = await measure('anchor');
    const button = await measure('button');
    expect(anchor.tag).toBe('A');
    expect(button.tag).toBe('BUTTON');
    expect(anchor.lineCount, 'the text wraps').toBeGreaterThan(1);
    expect(button.lineCount, 'the text wraps').toBeGreaterThan(1);
    expect(button.textAlign).toBe(anchor.textAlign);
    expect(Math.abs(button.lastLeft - anchor.lastLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs(button.lastRight - anchor.lastRight)).toBeLessThanOrEqual(
      1,
    );
  });
}
