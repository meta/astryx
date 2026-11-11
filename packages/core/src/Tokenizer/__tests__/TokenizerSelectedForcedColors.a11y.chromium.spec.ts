// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/Tokenizer/ ^apps/storybook/stories/Tokenizer

/**
 * @file TokenizerSelectedForcedColors.a11y.chromium.spec.ts
 * @input The built Tokenizer "Pre-selected Items" story in real Chromium on a
 *   tablet-sized touch screen, with forced colors emulated
 * @output Browser evidence that, in forced colors, the token the first Delete
 *   selects paints Highlight behind HighlightText. The selection then stays
 *   visible where forced colors drop the theme's accent fill
 * @position Regression proof for the selected token's forced-colors paint
 *   (Chromium only: Playwright's WebKit matches the forced-colors query but
 *   forces nothing)
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
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

// The inline field on a touch screen is a tablet's: a phone's default field
// is the bottom sheet, which has no input.
test.use({
  viewport: {width: 1024, height: 1366},
  hasTouch: true,
  isMobile: true,
});

test('in forced colors the selected token paints Highlight behind HighlightText', async ({
  page,
}) => {
  await page.emulateMedia({forcedColors: 'active'});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tokenizer--with-preselected&viewMode=story`,
  );
  await page.getByRole('combobox').first().tap();
  await page.keyboard.press('Backspace');
  await expect(page.locator('.astryx-token[aria-description]')).toHaveCount(1);
  const paint = await page.evaluate(() => {
    const read = (element: Element) => {
      const style = getComputedStyle(element);
      return {background: style.backgroundColor, color: style.color};
    };
    // A probe painted with the system colors the selection should show.
    const probe = document.createElement('span');
    probe.style.backgroundColor = 'Highlight';
    probe.style.color = 'HighlightText';
    document.body.append(probe);
    const reference = read(probe);
    probe.remove();
    const selected = document.querySelector('.astryx-token[aria-description]');
    const other = document.querySelector(
      '.astryx-token:not([aria-description])',
    );
    return {
      reference,
      selected: selected == null ? null : read(selected),
      other: other == null ? null : read(other),
    };
  });
  expect(paint.selected).toEqual(paint.reference);
  expect(paint.other?.background).not.toBe(paint.reference.background);
});
