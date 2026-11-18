// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/FileInput/|apps/storybook/stories/FileInput)

/**
 * @file FileInputTextGrowth.a11y.chromium.spec.ts
 * @input The `Core/FileInput` Default story (input mode) in a built
 *   Storybook, in Chromium, at the default root text size and at 200%, on a
 *   desktop and a phone viewport.
 * @output Real-browser proof of spec:AST-102 FR4 for input mode: at the
 *   default text size the field is 32 px; at 200% text the field grows so its
 *   prompt stays inside its borders, wrapped or not.
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

/** The field's height, and how far its prompt reaches past its borders. */
async function readField(page: Page, rootFontSize: string) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-fileinput--default&viewMode=story`,
  );
  await page.locator('.astryx-file-input').first().waitFor();
  return page.evaluate(size => {
    document.documentElement.style.fontSize = size;
    const field = document.querySelector<HTMLElement>('.astryx-file-input');
    if (field == null) {
      return null;
    }
    const style = getComputedStyle(field);
    const box = field.getBoundingClientRect();
    const top = box.top + parseFloat(style.borderTopWidth);
    const bottom = box.bottom - parseFloat(style.borderBottomWidth);
    const prompt = Array.from(field.querySelectorAll('span')).find(
      span => span.childElementCount === 0 && span.textContent?.trim(),
    );
    const text = prompt?.getBoundingClientRect();
    return {
      height: box.height,
      overflow:
        text == null
          ? Infinity
          : Math.max(0, top - text.top, text.bottom - bottom),
    };
  }, rootFontSize);
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
  });
}
