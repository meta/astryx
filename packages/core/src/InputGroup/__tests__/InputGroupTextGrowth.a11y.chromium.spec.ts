// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/InputGroup/|packages/core/src/Field/inputStyles|apps/storybook/stories/InputGroup)

/**
 * @file InputGroupTextGrowth.a11y.chromium.spec.ts
 * @input The `Core/InputGroup` Action Button Combinations story in a built
 *   Storybook, in Chromium, at the default root text size and at 200%.
 * @output Real-browser proof of component:InputGroup FR3 and FR4: at the
 *   default text size each row is exactly its size; at 200% text each row
 *   grows to hold a bordered text line, and every member, Button addons
 *   included, fills the row.
 * @position Runs in pr-a11y when InputGroup, the shared input row styles or
 *   InputGroup stories change. jsdom has no layout.
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

/** Each row's height, its input's line, and its members' heights. */
async function readRows(page: Page, rootFontSize: string) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-inputgroup--action-button-combinations&viewMode=story`,
  );
  await page.locator('.astryx-input-group').first().waitFor();
  return page.evaluate(size => {
    document.documentElement.style.fontSize = size;
    return Array.from(
      document.querySelectorAll<HTMLElement>('.astryx-input-group'),
    ).map(row => {
      // The row's text line: its input's, or its first Button addon's.
      const input = row.querySelector('input') ?? row.querySelector('button');
      return {
        height: row.getBoundingClientRect().height,
        line: input ? parseFloat(getComputedStyle(input).lineHeight) : 0,
        members: Array.from(
          row.querySelectorAll<HTMLElement>(
            ':scope > [data-astryx-input-group-item]',
          ),
        ).map(member => member.getBoundingClientRect().height),
      };
    });
  }, rootFontSize);
}

test('each row is its size at the default text size', async ({page}) => {
  const rows = await readRows(page, '');
  expect(rows.map(row => row.height)).toEqual([28, 32, 36]);
});

test('each row grows at 200% text and its members fill it', async ({page}) => {
  const rows = await readRows(page, '200%');
  expect(rows).toHaveLength(3);
  for (const row of rows) {
    expect(row.line).toBeGreaterThan(36);
    expect(row.height).toBeGreaterThanOrEqual(row.line);
    expect(row.members.length).toBeGreaterThan(1);
    for (const member of row.members) {
      expect(Math.abs(member - row.height)).toBeLessThan(0.5);
    }
  }
});
