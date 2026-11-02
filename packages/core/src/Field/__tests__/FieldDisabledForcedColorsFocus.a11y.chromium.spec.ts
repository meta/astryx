// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Field/inputDisabledFocus\.ts|packages/core/src/Field/__tests__/FieldDisabledForcedColorsFocus|packages/core/src/(Selector|MultiSelector|DateInput|TimeInput|TextInput|Typeahead)/|apps/storybook/stories/(TextInput|Selector|DateInput|TimeInput|Typeahead)\.stories)

/**
 * @file FieldDisabledForcedColorsFocus.a11y.chromium.spec.ts
 * @input Checked-in disabled field stories
 * @output Real-browser evidence that a focusable disabled field shows keyboard
 *   focus under forced colors (Windows High Contrast)
 * @position Browser lane for `spec:AST-085` FR6 and `spec:AST-020` FR1
 *   (WCAG 2.4.7) on the disabled field focus styles
 */

import {expect, test, type Locator} from '@playwright/test';
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

test.afterAll(async () => storybook?.close());

/** The border color of the bordered wrapper around a field's control. */
async function wrapperBorder(control: Locator): Promise<string> {
  return control.evaluate(el => {
    let node: HTMLElement | null = el as HTMLElement;
    while (node != null) {
      const style = getComputedStyle(node);
      if (
        style.borderTopStyle === 'solid' &&
        parseFloat(style.borderTopWidth) > 0
      ) {
        return style.borderTopColor;
      }
      node = node.parentElement;
    }
    throw new Error('no bordered wrapper around the control');
  });
}

// The field's own control: DateInput's text input, not its calendar button,
// which paints its own outline.
for (const [story, selector] of [
  ['core-textinput--disabled', '[aria-disabled="true"]'],
  ['core-typeahead--disabled', '[aria-disabled="true"]'],
  ['core-selector--disabled', '[aria-disabled="true"]'],
  ['core-dateinput--disabled', 'input[aria-disabled="true"]'],
  ['core-timeinput--disabled', '[aria-disabled="true"]'],
] as const) {
  test(`${story}: a focusable disabled field shows keyboard focus under forced colors`, async ({
    page,
  }) => {
    await page.emulateMedia({forcedColors: 'active', reducedMotion: 'reduce'});
    await page.goto(
      `${storybook.origin}/iframe.html?id=${story}&viewMode=story`,
    );
    const control = page.locator(selector).first();
    await expect(control).toBeVisible();
    const atRest = await wrapperBorder(control);

    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      if (await control.evaluate(el => el === document.activeElement)) {
        break;
      }
    }
    await expect(control).toBeFocused();
    expect(await wrapperBorder(control)).not.toBe(atRest);
  });
}
