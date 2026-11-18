// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/TextInput/|packages/core/src/Field/inputStyles|apps/storybook/stories/TextInput)

/**
 * @file TextInputTextGrowth.a11y.chromium.spec.ts
 * @input The `Core/TextInput` SizeVariants story in a built Storybook, in
 *   Chromium, at the default root text size and at 200%.
 * @output Real-browser proof of component:TextInput FR11: at the default
 *   text size each field is exactly its size (28, 32, 36 px); at 200% text
 *   each field grows to hold its text line inside its borders.
 * @position Runs in pr-a11y when TextInput, the shared input row styles or
 *   TextInput stories change. jsdom has no layout.
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

/** Each field's outer height, the room inside its borders, and its input's line height. */
async function readFields(page: Page, rootFontSize: string) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-textinput--size-variants&viewMode=story`,
  );
  await page.locator('.astryx-text-input').first().waitFor();
  return page.evaluate(size => {
    document.documentElement.style.fontSize = size;
    return Array.from(
      document.querySelectorAll<HTMLElement>('.astryx-text-input'),
    ).map(field => {
      const style = getComputedStyle(field);
      const height = field.getBoundingClientRect().height;
      const input = field.querySelector('input') as HTMLInputElement;
      return {
        height,
        inner:
          height -
          parseFloat(style.borderTopWidth) -
          parseFloat(style.borderBottomWidth),
        line: parseFloat(getComputedStyle(input).lineHeight),
      };
    });
  }, rootFontSize);
}

test('each size is its height at the default text size', async ({page}) => {
  const fields = await readFields(page, '');
  expect(fields.map(field => field.height)).toEqual([28, 32, 36]);
});

test('each size grows to hold its text line at 200% text', async ({page}) => {
  const fields = await readFields(page, '200%');
  expect(fields).toHaveLength(3);
  for (const field of fields) {
    expect(field.line).toBeGreaterThan(36);
    expect(field.inner).toBeGreaterThanOrEqual(field.line - 0.5);
  }
});
