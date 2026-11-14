// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/Tokenizer/ ^apps/storybook/stories/Tokenizer

/**
 * @file TokenizerEmptyCaret.a11y.chromium.spec.ts
 * @input The `Core/Tokenizer` "Pre-selected Items" story in a built
 *   Storybook, its column sized to the field's content.
 * @output Real-engine proof that a focused, empty input after the tokens has
 *   room for its caret when the field has no width of its own: it takes its
 *   text inset and a caret's width on the row, and the field keeps its
 *   height.
 * @position Run with `pnpm test:a11y-contract`. Without a width, the field
 *   sizes to its content and its row has no spare room, so only a shipping
 *   layout engine shows whether the input's content box collapses to 0.
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

type Direction = 'ltr' | 'rtl';

/**
 * Opens the story with its decorator column sized to the field's content, as
 * a field with no `width` in a content-sized container renders.
 */
async function openContentSized(page: Page, direction: Direction) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tokenizer--with-preselected&viewMode=story&globals=direction:${direction}`,
    {waitUntil: 'load'},
  );
  const field = page.locator('.astryx-tokenizer').first();
  await field.waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
    const column = document.querySelector<HTMLElement>(
      '#storybook-root [style*="grid-template-columns"]',
    );
    if (column == null) {
      throw new Error('No sizing column in the story');
    }
    column.style.gridTemplateColumns = 'max-content';
    for (let frame = 0; frame < 4; frame++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
  });
  return {field, input: page.getByRole('combobox')};
}

/** The input's content-box width: where its text and caret paint. */
async function contentBoxWidth(page: Page): Promise<number> {
  return page.getByRole('combobox').evaluate(input => {
    const style = getComputedStyle(input);
    return (
      input.clientWidth -
      parseFloat(style.paddingInlineStart) -
      parseFloat(style.paddingInlineEnd)
    );
  });
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let frame = 0; frame < 2; frame++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
  });
}

for (const direction of ['ltr', 'rtl'] as const) {
  test(`${direction}: a focused, empty input after the tokens has room for its caret`, async ({
    page,
  }) => {
    const {field, input} = await openContentSized(page, direction);
    await expect(input).toHaveValue('');
    const blurredHeight = (await field.boundingBox())?.height;

    await input.focus();
    await settle(page);

    await expect(input).toBeFocused();
    // Room for the caret, and no more: the input takes its text inset and a
    // caret's width on the row.
    const contentBox = await contentBoxWidth(page);
    expect(contentBox).toBeGreaterThanOrEqual(1);
    expect(contentBox).toBeLessThanOrEqual(3);
    // The caret fits on the tokens' row, so the field keeps its height.
    expect((await field.boundingBox())?.height).toBeCloseTo(
      blurredHeight ?? NaN,
      0,
    );
  });
}
