// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Field/inputStyles\.stylex\.ts|packages/core/src/Field/__tests__/FieldForcedColorsFocus|apps/storybook/stories/(TextInput|Selector)\.stories)

/**
 * @file FieldForcedColorsFocus.a11y.chromium.spec.ts
 * @input Checked-in TextInput and Selector stories
 * @output Real-browser evidence that a field shows keyboard focus under forced
 *   colors (Windows High Contrast), where box shadows are dropped
 * @position Browser lane for `spec:AST-020` FR1 (WCAG 2.4.7) on the shared
 *   input wrapper styles
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

/** The painted edge of the bordered wrapper around a field's control. */
async function wrapperEdge(control: Locator) {
  return control.evaluate(el => {
    let node: HTMLElement | null = el as HTMLElement;
    while (node != null) {
      const style = getComputedStyle(node);
      if (
        style.borderTopStyle === 'solid' &&
        parseFloat(style.borderTopWidth) > 0
      ) {
        return {
          border: style.borderTopColor,
          shadow: style.boxShadow,
          outline: style.outlineStyle === 'none' ? 'none' : style.outlineColor,
        };
      }
      node = node.parentElement;
    }
    throw new Error('no bordered wrapper around the control');
  });
}

const CASES = [
  {story: 'core-textinput--default', label: undefined},
  {story: 'core-textinput--status-variations', label: 'Error with message'},
  {story: 'core-selector--with-status', label: 'Error status'},
] as const;

for (const {story, label} of CASES) {
  test(`${story}${label ? `: "${label}"` : ''} shows keyboard focus under forced colors`, async ({
    page,
  }) => {
    await page.emulateMedia({forcedColors: 'active', reducedMotion: 'reduce'});
    await page.goto(
      `${storybook.origin}/iframe.html?id=${story}&viewMode=story`,
    );
    const control =
      label == null
        ? page.getByRole('textbox').first()
        : page.getByLabel(label, {exact: true}).first();
    await expect(control).toBeVisible();
    const atRest = await wrapperEdge(control);

    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      if (await control.evaluate(el => el === document.activeElement)) {
        break;
      }
    }
    await expect(control).toBeFocused();
    const focused = await wrapperEdge(control);

    // Forced colors drop every box shadow, so the edge itself must change.
    expect(focused.shadow).toBe('none');
    expect(
      focused.border !== atRest.border || focused.outline !== atRest.outline,
      `focus changes the field's edge (rest ${JSON.stringify(atRest)}, focus ${JSON.stringify(focused)})`,
    ).toBe(true);
  });
}
