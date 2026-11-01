// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/Typeahead core/Tokenizer core/Field ^apps/storybook/stories/Typeahead ^apps/storybook/stories/Tokenizer

/**
 * @file Typeahead.disabled.a11y.chromium.spec.ts
 * @input Checked-in Disabled Storybook fixtures and real Chromium
 * @output Tab-stop, aria-disabled, read-only and focus-ring evidence
 * @position Browser regression for spec:AST-085 FR1, FR2 and FR6 on the
 *   text-entry search fields
 */

import {expect, test} from '@playwright/test';
import {
  serveStorybook,
  DEFAULT_STORYBOOK_DIR,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => storybook?.close());

for (const story of ['core-typeahead--disabled', 'core-tokenizer--disabled']) {
  test(`${story}: Tab reaches the disabled field, which rings and stays read-only`, async ({
    page,
  }, testInfo) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=${story}&viewMode=story`,
    );
    const input = page.getByRole('combobox');
    await input.waitFor();
    await expect(input).not.toBeDisabled();
    await expect(input).toHaveAttribute('aria-disabled', 'true');

    await page.keyboard.press('Tab');
    await expect(input).toBeFocused();
    // The nearest wrapper with a box shadow draws the field's ring.
    const ring = await input.evaluate(element => {
      for (let node = element.parentElement; node; node = node.parentElement) {
        const shadow = getComputedStyle(node).boxShadow;
        if (shadow !== 'none') {
          return shadow;
        }
      }
      return 'none';
    });
    expect(ring).toContain('inset');
    await testInfo.attach('focused', {
      body: await page.screenshot({path: testInfo.outputPath('focused.png')}),
      contentType: 'image/png',
    });

    await page.keyboard.type('a');
    await page.keyboard.press('ArrowDown');
    await expect(input).toHaveValue('');
    await expect(input).toHaveAttribute('aria-expanded', 'false');
  });
}
