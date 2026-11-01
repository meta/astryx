// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Field/inputStyles\.stylex\.ts|packages/core/src/Field/__tests__/FieldStatusFocus|packages/core/src/(TextInput|Selector)/|apps/storybook/stories/(TextInput|Selector)\.stories)

/**
 * @file FieldStatusFocus.a11y.chromium.spec.ts
 * @input Checked-in TextInput and Selector status stories
 * @output Real-browser evidence that a field in a status still paints its
 *   field-focus ring when it holds keyboard focus
 * @position Browser lane for `spec:AST-020` FR1 (WCAG 2.4.7) and
 *   `architecture:interaction-modality` on the shared input wrapper styles
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

/** The box shadow of the bordered wrapper around a field's control. */
async function wrapperShadow(control: Locator): Promise<string> {
  return control.evaluate(el => {
    let node: HTMLElement | null = el as HTMLElement;
    while (node != null) {
      const style = getComputedStyle(node);
      if (
        style.borderTopStyle === 'solid' &&
        parseFloat(style.borderTopWidth) > 0
      ) {
        return style.boxShadow;
      }
      node = node.parentElement;
    }
    throw new Error('no bordered wrapper around the control');
  });
}

const CASES = [
  {story: 'core-textinput--status-variations', label: 'Error with message'},
  {story: 'core-textinput--status-variations', label: 'Warning with message'},
  {story: 'core-textinput--status-variations', label: 'Success with message'},
  {story: 'core-selector--with-status', label: 'Error status'},
  {story: 'core-selector--with-status', label: 'Warning status'},
] as const;

for (const {story, label} of CASES) {
  test(`${story}: "${label}" shows a focus ring under keyboard focus`, async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=${story}&viewMode=story`,
    );
    const control = page.getByLabel(label, {exact: true}).first();
    await expect(control).toBeVisible();
    const atRest = await wrapperShadow(control);

    // Reach the control by keyboard: Tab until it holds focus.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      if (await control.evaluate(el => el === document.activeElement)) {
        break;
      }
    }
    await expect(control).toBeFocused();
    const focused = await wrapperShadow(control);

    expect(focused, 'the focused field paints an inset ring').toContain(
      'inset',
    );
    expect(focused, 'focus looks different from rest').not.toBe(atRest);
  });
}
