// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DateTextDirection.interaction.browser.spec.ts
 * @input The built "With Value" DateInput story, with an English locale, on
 *   a left-to-right and a right-to-left page
 * @output Proof in Chromium that the date text reads left to right, so
 *   "January 25, 2026" keeps its order on a right-to-left page, while the
 *   text stays on the page's start side
 * @position Interaction tests of the date-text direction in DateInput.tsx and
 *   NativeDateField.tsx, run by `pnpm test:interaction`
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

for (const direction of ['ltr', 'rtl'] as const) {
  test(`English date text reads left to right on a ${direction} page, at the page's start`, async ({
    page,
  }) => {
    await page.goto(
      `${storybook()}/iframe.html?id=core-dateinput--with-value&viewMode=story&args=presentation:popover&globals=direction:${direction}`,
    );
    const input = page.getByRole('combobox', {name: 'Event date'});
    await expect(input).toHaveValue('January 25, 2026');
    const style = await input.evaluate(element => {
      const computed = getComputedStyle(element);
      return {direction: computed.direction, textAlign: computed.textAlign};
    });
    expect(style.direction).toBe('ltr');
    expect(style.textAlign).toBe(direction === 'rtl' ? 'right' : 'left');
  });
}

for (const direction of ['ltr', 'rtl'] as const) {
  test(`the native date field's drawn date reads left to right on a ${direction} page, at the page's start`, async ({
    page,
  }) => {
    await page.goto(
      `${storybook()}/iframe.html?id=core-dateinput--with-value&viewMode=story&args=presentation:native&globals=direction:${direction}`,
    );
    const field = page.locator('input[type="date"]');
    await expect(field).toHaveValue('2026-01-25');
    // The field draws the locale's date in an overlay over the native input.
    const overlay = field.locator(
      'xpath=following-sibling::span[@aria-hidden="true"]',
    );
    await expect(overlay).toHaveText('January 25, 2026');
    const style = await overlay.evaluate(element => {
      const computed = getComputedStyle(element);
      return {direction: computed.direction, textAlign: computed.textAlign};
    });
    expect(style.direction).toBe('ltr');
    expect(style.textAlign).toBe(direction === 'rtl' ? 'right' : 'left');
  });
}
