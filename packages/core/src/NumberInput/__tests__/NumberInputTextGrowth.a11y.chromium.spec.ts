// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/NumberInput/|packages/core/src/Field/inputStyles|apps/storybook/stories/NumberInput)

/**
 * @file NumberInputTextGrowth.a11y.chromium.spec.ts
 * @input The `Core/NumberInput` SizeVariants story in a built Storybook, in
 *   Chromium, at the default root text size and at 200%.
 * @output Real-browser proof of component:NumberInput FR12 with
 *   component:TextInput FR11: at the default text size each field is exactly
 *   its size (28, 32, 36 px); at 200% text each field grows to hold its text
 *   line, and the stepper column still spans the field.
 * @position Runs in pr-a11y when NumberInput, the shared input row styles or
 *   NumberInput stories change. jsdom has no layout.
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

/**
 * Each field's outer height, the room inside its borders, its input's line
 * height, and how far its stepper column falls short of its border box.
 */
async function readFields(page: Page, story: string, rootFontSize: string) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-numberinput--${story}&viewMode=story`,
  );
  await page.locator('.astryx-number-input').first().waitFor();
  return page.evaluate(size => {
    document.documentElement.style.fontSize = size;
    return Array.from(
      document.querySelectorAll<HTMLElement>('.astryx-number-input'),
    ).map(field => {
      const style = getComputedStyle(field);
      const box = field.getBoundingClientRect();
      const borders =
        parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      const input = field.querySelector('input') as HTMLInputElement;
      const steppers = field.querySelector('button')?.parentElement;
      return {
        height: box.height,
        inner: box.height - borders,
        line: parseFloat(getComputedStyle(input).lineHeight),
        stepperGap:
          steppers == null
            ? null
            : box.height - borders - steppers.getBoundingClientRect().height,
      };
    });
  }, rootFontSize);
}

test('each size is its height at the default text size', async ({page}) => {
  const fields = await readFields(page, 'size-variants', '');
  expect(fields.map(field => field.height)).toEqual([28, 32, 36]);
});

test('each size grows to hold its text line at 200% text', async ({page}) => {
  const fields = await readFields(page, 'size-variants', '200%');
  expect(fields).toHaveLength(3);
  for (const field of fields) {
    expect(field.line).toBeGreaterThan(36);
    expect(field.inner).toBeGreaterThanOrEqual(field.line - 0.5);
  }
});

test('the stepper column spans the grown field at 200% text', async ({
  page,
}) => {
  const [field] = await readFields(page, 'with-number-steppers', '200%');
  expect(field.inner).toBeGreaterThanOrEqual(field.line - 0.5);
  expect(field.stepperGap).not.toBeNull();
  expect(Math.abs(field.stepperGap ?? 0)).toBeLessThan(1);
});
