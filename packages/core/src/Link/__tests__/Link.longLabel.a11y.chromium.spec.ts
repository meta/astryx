// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Link/|packages/core/src/Text/|apps/storybook/stories/Link\.stories)

/**
 * @file Link.longLabel.a11y.chromium.spec.ts
 * @input Storybook story core-link--long-unbroken-label
 * @output A Link whose label has no break opportunity (a bare URL) stays
 *   inside a 200 px column, as an anchor, a button and an external link: the
 *   column does not scroll sideways, the Link's box ends inside it, and the
 *   label wraps onto more than one line.
 * @position Real-browser check: jsdom lays out no lines.
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

test.afterAll(async () => storybook?.close());

for (const form of ['anchor', 'button', 'external'] as const) {
  test(`a long unbroken ${form} Link label wraps inside a narrow column`, async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-link--long-unbroken-label&viewMode=story`,
    );
    const measure = await page
      .locator(`[data-long-label="${form}"]`)
      .evaluate(line => {
        const root = line.firstElementChild as HTMLElement;
        // Lines of the label only: the external icon and the hidden new-tab
        // text are not label lines.
        const label = root.firstElementChild as HTMLElement;
        const range = document.createRange();
        range.selectNodeContents(label);
        const lines = Array.from(range.getClientRects()).filter(
          rect => rect.width > 0,
        );
        const column = line.parentElement as HTMLElement;
        return {
          columnRight: column.getBoundingClientRect().right,
          rootRight: root.getBoundingClientRect().right,
          columnScrolls: column.scrollWidth > column.clientWidth,
          lineCount: new Set(lines.map(rect => Math.round(rect.top))).size,
        };
      });
    expect(measure.columnScrolls, 'the column scrolls sideways').toBe(false);
    expect(measure.rootRight).toBeLessThanOrEqual(measure.columnRight + 1);
    expect(measure.lineCount, 'the label wraps').toBeGreaterThan(1);
  });
}
