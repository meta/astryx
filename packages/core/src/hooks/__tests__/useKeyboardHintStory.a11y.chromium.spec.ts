// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^apps/storybook/stories/useKeyboardHint

/**
 * @input The Default useKeyboardHint story in Chromium.
 * @output Focus destinations when the toolbar changes direction.
 * @position Browser regression for the example's own arrow-key navigation.
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

test('the example follows the current direction of its toolbar', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-hooks-usekeyboardhint--default');
  const toolbar = page.getByRole('toolbar', {name: 'Formatting'});
  const bold = toolbar.getByRole('button', {name: 'Bold'});
  await bold.press('ArrowRight');
  await expect(toolbar.getByRole('button', {name: 'Italic'})).toBeFocused();

  await page.addStyleTag({content: '[role="toolbar"] { direction: rtl }'});
  await page.keyboard.press('ArrowRight');
  await expect(bold).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(toolbar.getByRole('button', {name: 'Underline'})).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(bold).toBeFocused();
});
