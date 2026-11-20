// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/FileInput/|apps/storybook/stories/FileInput)

/**
 * @file FileInputTextGrowth.a11y.chromium.spec.ts
 * @input The `Core/FileInput` Default story (input mode) in a built
 *   Storybook, in Chromium, at the default root text size and at 200%, on a
 *   desktop and a phone viewport.
 * @output Real-browser proof of spec:AST-102 FR4 for input mode: at the
 *   default text size the field is 32 px; at 200% text the field grows so its
 *   prompt stays inside its borders, wrapped or not, and in a 120 px field a
 *   word wider than the field breaks inside itself, so no text leaves the
 *   field's inline borders.
 * @position Runs in pr-a11y when FileInput or its stories change. jsdom has
 *   no layout.
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
 * The field's height, and how far its prompt reaches past its borders.
 * `width` narrows the field's container.
 */
async function readField(page: Page, rootFontSize: string, width?: string) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-fileinput--default&viewMode=story`,
  );
  await page.locator('.astryx-file-input').first().waitFor();
  return page.evaluate(
    ({size, fieldWidth}) => {
      document.documentElement.style.fontSize = size;
      const field = document.querySelector<HTMLElement>('.astryx-file-input');
      if (field == null) {
        return null;
      }
      if (fieldWidth != null && field.parentElement != null) {
        field.parentElement.style.width = fieldWidth;
      }
      const style = getComputedStyle(field);
      const box = field.getBoundingClientRect();
      const top = box.top + parseFloat(style.borderTopWidth);
      const bottom = box.bottom - parseFloat(style.borderBottomWidth);
      const start = box.left + parseFloat(style.borderLeftWidth);
      const end = box.right - parseFloat(style.borderRightWidth);
      const prompt = Array.from(field.querySelectorAll('span')).find(
        span => span.childElementCount === 0 && span.textContent?.trim(),
      );
      const text = prompt?.getBoundingClientRect();
      const range = document.createRange();
      if (prompt != null) {
        range.selectNodeContents(prompt);
      }
      // The text's own box: a word wider than its span draws past the span.
      const ink = prompt == null ? null : range.getBoundingClientRect();
      return {
        height: box.height,
        overflow:
          text == null
            ? Infinity
            : Math.max(0, top - text.top, text.bottom - bottom),
        inlineOverflow:
          text == null || ink == null
            ? Infinity
            : Math.max(0, start - text.left, text.right - end, ink.right - end),
      };
    },
    {size: rootFontSize, fieldWidth: width},
  );
}

for (const viewport of [
  {width: 1280, height: 800},
  {width: 390, height: 844},
]) {
  test.describe(`${viewport.width} px wide`, () => {
    test.use({viewport});

    test('the field is 32 px at the default text size', async ({page}) => {
      const field = await readField(page, '');
      expect(field?.height).toBe(32);
      expect(field?.overflow).toBe(0);
    });

    test('the prompt stays inside the field at 200% text', async ({page}) => {
      const field = await readField(page, '200%');
      expect(field?.height).toBeGreaterThan(32);
      expect(field?.overflow).toBe(0);
    });

    test('a 120 px field at 200% text wraps its prompt inside its borders', async ({
      page,
    }) => {
      const field = await readField(page, '200%', '120px');
      expect(field?.inlineOverflow).toBe(0);
      expect(field?.overflow).toBe(0);
    });
  });
}
