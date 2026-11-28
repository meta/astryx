// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @input The useKeyboardHint Default story in a right-to-left region
 * @output Checks the logical start edges of the focused item and its hint
 * @position Browser regression for the passive keyboard hint's placement
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

test('the keyboard hint aligns with the focused item’s right edge in RTL', async ({
  page,
}) => {
  await page.setViewportSize({width: 800, height: 520});
  await page.goto(
    `${storybook()}/iframe.html?id=core-hooks-usekeyboardhint--default&viewMode=story&globals=direction:rtl`,
  );
  const bold = page.getByRole('button', {name: 'Bold', exact: true});
  await expect(bold).toHaveCSS('direction', 'rtl');
  await page.keyboard.press('Tab');
  await expect(bold).toBeFocused();
  const hint = page.locator(':popover-open').filter({hasText: 'to navigate'});
  const right = (element: Element) => element.getBoundingClientRect().right;
  expect(await hint.evaluate(right)).toBeCloseTo(await bold.evaluate(right), 0);
});
