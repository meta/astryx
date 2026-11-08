// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Link/|packages/core/src/Text/Text\.tsx|apps/storybook/stories/Link\.stories)

/**
 * @file Link.hoverColor.a11y.chromium.spec.ts
 * @input Built Link stories and a real Chromium mouse hover
 * @output Evidence that a hovered Link paints its label in the same color as
 *   its root, which the underline and the external icon take, and that the
 *   resting color does not change
 * @position Real-engine proof for component:Link FR7; jsdom cannot match
 *   :hover or a (hover: hover) media query
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

async function colors(page: Page) {
  return page
    .locator('#storybook-root a')
    .first()
    .evaluate(anchor => {
      const label = anchor.firstElementChild as HTMLElement;
      const icon = anchor.querySelector('svg');
      return {
        root: getComputedStyle(anchor).color,
        label: getComputedStyle(label).color,
        icon: icon == null ? null : getComputedStyle(icon).color,
      };
    });
}

for (const story of [
  'core-link--default',
  'core-link--primary',
  'core-link--secondary',
  'core-link--external-link',
]) {
  test(`${story}: the hovered label matches the root, and the resting color holds`, async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=${story}&viewMode=story`,
    );
    const anchor = page.locator('#storybook-root a').first();
    await expect(anchor).toBeVisible();
    await page.mouse.move(0, 0);
    const rest = await colors(page);
    expect(rest.label).toBe(rest.root);

    await anchor.hover();
    // Let the root's color transition, if any, settle.
    await page.waitForTimeout(300);
    const hovered = await colors(page);
    expect(hovered.root).not.toBe(rest.root);
    expect(hovered.label).toBe(hovered.root);
    if (hovered.icon != null) {
      expect(hovered.icon).toBe(hovered.root);
    }

    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    expect(await colors(page)).toEqual(rest);
  });
}
