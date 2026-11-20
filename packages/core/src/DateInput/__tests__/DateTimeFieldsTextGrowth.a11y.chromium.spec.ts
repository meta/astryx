// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/(DateInput|TimeInput|DateTimeInput|DateRangeInput)/|packages/core/src/Field/inputStyles|apps/storybook/stories/(DateInput|TimeInput|DateTimeInput|DateRangeInput))

/**
 * @file DateTimeFieldsTextGrowth.a11y.chromium.spec.ts
 * @input DateInput, TimeInput, DateTimeInput and DateRangeInput stories in a
 *   built Storybook, in Chromium, at the default root text size and at 200%.
 * @output Real-browser proof that each date and time field is exactly its
 *   size at the default text size, and at 200% text grows to hold its text
 *   line inside its borders (component:TextInput FR11 through each record).
 * @position Runs in pr-a11y when those fields, the shared input row styles or
 *   their stories change. jsdom has no layout.
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

const CASES = [
  {
    story: 'core-dateinput--small-size',
    field: 'astryx-date-input',
    sizes: [28],
  },
  {story: 'core-timeinput--default', field: 'astryx-time-input', sizes: [32]},
  {
    story: 'core-datetimeinput--size-variants',
    field: 'astryx-date-time-input',
    sizes: [28, 32, 36],
  },
  {
    story: 'core-daterangeinput--size-variants',
    field: 'astryx-date-range-input',
    sizes: [28, 32, 36],
  },
];

/** Each field's outer height, the room inside its borders, and its line. */
async function readFields(
  page: Page,
  story: string,
  field: string,
  rootFontSize: string,
) {
  await page.goto(`${storybook.origin}/iframe.html?id=${story}&viewMode=story`);
  await page.locator(`.${field}`).first().waitFor();
  return page.evaluate(
    ([className, size]) => {
      document.documentElement.style.fontSize = size;
      return Array.from(
        document.querySelectorAll<HTMLElement>(`.${className}`),
      ).map(element => {
        const style = getComputedStyle(element);
        const height = element.getBoundingClientRect().height;
        // The text line: the input, or the range field's trigger text.
        const text =
          element.querySelector('input') ??
          Array.from(element.querySelectorAll('button')).find(button =>
            button.textContent?.trim(),
          );
        return {
          height,
          inner:
            height -
            parseFloat(style.borderTopWidth) -
            parseFloat(style.borderBottomWidth),
          line: text ? parseFloat(getComputedStyle(text).lineHeight) : 0,
        };
      });
    },
    [field, rootFontSize] as const,
  );
}

for (const {story, field, sizes} of CASES) {
  test(`${story}: each field is its size at the default text size`, async ({
    page,
  }) => {
    const fields = await readFields(page, story, field, '');
    expect(fields.map(each => each.height)).toEqual(sizes);
  });

  test(`${story}: each field holds its text line at 200% text`, async ({
    page,
  }) => {
    const fields = await readFields(page, story, field, '200%');
    expect(fields).toHaveLength(sizes.length);
    for (const each of fields) {
      expect(each.line).toBeGreaterThan(36);
      expect(each.inner).toBeGreaterThanOrEqual(each.line - 0.5);
    }
  });
}
