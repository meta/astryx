// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TimeTextDirection.interaction.browser.spec.ts
 * @input The built "With Value" TimeInput story, with an English locale and a
 *   12-hour clock, on a left-to-right and a right-to-left page
 * @output Proof in Chromium that the time text reads left to right, so
 *   "2:30 PM" keeps its order on a right-to-left page, while the text stays
 *   on the page's start side
 * @position Interaction tests of the time-text direction in TimeInput.tsx,
 *   run by `pnpm test:interaction`
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

for (const direction of ['ltr', 'rtl'] as const) {
  test(`English time text reads left to right on a ${direction} page, at the page's start`, async ({
    page,
  }) => {
    await page.goto(
      `${storybook()}/iframe.html?id=core-timeinput--with-value&viewMode=story&args=hourFormat:12h;presentation:text-input&globals=direction:${direction}`,
    );
    const input = page.getByRole('textbox', {name: 'Meeting time'});
    await expect(input).toHaveValue('2:30 PM');
    const style = await input.evaluate(element => {
      const computed = getComputedStyle(element);
      return {direction: computed.direction, textAlign: computed.textAlign};
    });
    expect(style.direction).toBe('ltr');
    expect(style.textAlign).toBe(direction === 'rtl' ? 'right' : 'left');
  });
}

for (const direction of ['ltr', 'rtl'] as const) {
  test(`the native time field reads left to right on a ${direction} page, at the page's start`, async ({
    page,
  }) => {
    await page.goto(
      `${storybook()}/iframe.html?id=core-timeinput--with-value&viewMode=story&args=hourFormat:12h;presentation:native&globals=direction:${direction}`,
    );
    const field = page.locator('input[type="time"]');
    await expect(field).toHaveValue('14:30');
    const style = await field.evaluate(element => {
      const value = getComputedStyle(element, '::-webkit-date-and-time-value');
      return {
        direction: getComputedStyle(element).direction,
        textAlign: value.textAlign,
      };
    });
    expect(style.direction).toBe('ltr');
    expect(style.textAlign).toBe(direction === 'rtl' ? 'right' : 'left');
  });
}
