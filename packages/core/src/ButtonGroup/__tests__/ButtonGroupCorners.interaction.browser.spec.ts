// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ButtonGroupCorners.interaction.browser.spec.ts
 * @input Storybook story a11y-buttongroup-corners--shapes
 * @output ButtonGroup FR3 in a real browser: in every member shape, only the
 *   group's last member (the last sibling that is not a popover, template or
 *   dialog) rounds its trailing corners, and an InputGroup button addon
 *   rounds its trailing corners only when no member follows it
 * @position ButtonGroup FR3 and InputGroup end-cap evidence, run in the
 *   Chromium interaction lane; the jsdom tests assert membership only, since
 *   jsdom never receives these rules
 */

import {expect, test, type Page} from '@playwright/test';
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

async function openShapes(page: Page): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=a11y-buttongroup-corners--shapes&viewMode=story`,
  );
  await page.locator('[data-corner-shape="input-group-addon"]').waitFor();
}

interface Corner {
  shape: string;
  label: string;
  expected: 'round' | 'square';
  trailing: string[];
}

/** Each marked member's two trailing-corner radii, for its orientation. */
async function trailingCorners(page: Page): Promise<Corner[]> {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>('[data-corner-case]'),
    ).map(element => {
      const style = getComputedStyle(element);
      const vertical = element.closest('[data-orientation="vertical"]') != null;
      const trailing = vertical
        ? [style.borderEndStartRadius, style.borderEndEndRadius]
        : [style.borderStartEndRadius, style.borderEndEndRadius];
      return {
        shape: element.dataset.cornerCase ?? '',
        label: element.textContent?.trim() ?? '',
        expected: element.dataset.trailing as 'round' | 'square',
        trailing,
      };
    }),
  );
}

test('only the last member rounds its trailing corners, in every shape', async ({
  page,
}) => {
  await openShapes(page);
  const corners = await trailingCorners(page);
  expect(corners.length).toBeGreaterThanOrEqual(22);
  for (const {shape, label, expected, trailing} of corners) {
    const rounded = trailing.map(value => parseFloat(value) > 0);
    expect(rounded, `${shape} / ${label}`).toEqual(
      expected === 'round' ? [true, true] : [false, false],
    );
  }
  await page.screenshot({
    path: `test-results/interaction-evidence/buttongroup-corners/shapes-${test.info().project.name}.png`,
    fullPage: true,
  });
});
