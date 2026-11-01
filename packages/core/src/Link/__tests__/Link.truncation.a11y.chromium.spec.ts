// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Link/|packages/core/src/Text/|apps/storybook/stories/Link\.stories)

/**
 * Real-browser evidence for `component:Link` FR6 with `component:Text` FR4: a
 * Link with `maxLines={1}` in a fixed-width line, as an anchor and as a
 * button, stops at the line and its label overflows with an ellipsis.
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

for (const form of ['anchor', 'button'] as const) {
  test(`a ${form} Link with maxLines={1} truncates inside a fixed-width line`, async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-link--truncated-in-constrained-line&viewMode=story`,
    );
    const line = page.locator(`[data-truncation-line="${form}"]`);
    await expect(line).toBeVisible();
    const measured = await line.evaluate(el => {
      const root = el.firstElementChild as HTMLElement;
      const label = root.firstElementChild as HTMLElement;
      const style = getComputedStyle(label);
      return {
        tag: root.tagName,
        line: el.getBoundingClientRect().width,
        root: root.getBoundingClientRect().width,
        labelClient: label.clientWidth,
        labelScroll: label.scrollWidth,
        textOverflow: style.textOverflow,
      };
    });
    expect(measured.tag, 'the Link renders its own element').toBe(
      form === 'anchor' ? 'A' : 'BUTTON',
    );
    // The root stops at the line instead of growing to its whole text.
    expect(measured.root).toBeLessThanOrEqual(measured.line + 0.5);
    // The label itself overflows and draws the ellipsis.
    expect(measured.labelScroll).toBeGreaterThan(measured.labelClient);
    expect(measured.textOverflow).toBe('ellipsis');
  });
}
