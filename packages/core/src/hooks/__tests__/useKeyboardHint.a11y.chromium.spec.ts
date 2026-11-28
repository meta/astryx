// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/(hooks/(useKeyboardHint|anchoredHint)|Layer/useLayer)|apps/storybook/stories/useKeyboardHint)

/**
 * @input The built useKeyboardHint story and Chromium's accessibility tree
 * @output The open visual hint has no exposed popover host
 * @position Browser regression for useKeyboardHint
 */

import {createChromiumHarness} from '@astryxdesign/a11y-spec/chromium';
import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

test('the visible keyboard hint stays out of the accessibility tree', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-hooks-usekeyboardhint--default');
  await page.keyboard.press('Tab');
  const hint = page.locator(':popover-open').filter({hasText: 'to navigate'});
  await expect(hint).toBeVisible();

  const cdp = await page.context().newCDPSession(page);
  const harness = createChromiumHarness({page, cdp, subject: hint});
  const host = await harness.subject();
  expect((await host.computed()).role).toBeNull();
});
