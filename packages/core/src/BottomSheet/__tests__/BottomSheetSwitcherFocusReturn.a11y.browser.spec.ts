// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only
// @visits BottomSheetSwitcher

/**
 * @file BottomSheetSwitcherFocusReturn.a11y.browser.spec.ts
 * @input The `Core/BottomSheetSwitcher (deprecated)` stories "No scrim",
 *   "Removed while open" and "Removed while open, no scrim", in a built
 *   Storybook, with real keyboard input.
 * @output Browser evidence for `component:BottomSheet` FR11 and FR20 on the
 *   switcher: a flow without its scrim that closes with focus inside returns
 *   focus to its opener, and a switcher removed while its sheet is open
 *   returns focus to the flow's opener, with and without the scrim.
 * @position jsdom stubs the dialog methods and implements neither `inert` nor
 *   the browser's own focus return, so only a browser shows where focus ends.
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
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

async function openFromKeyboard(page: Page, story: string): Promise<Locator> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-bottomsheetswitcher--${story}&viewMode=story`,
  );
  const opener = page.getByRole('button', {
    name: 'Set up notifications',
    exact: true,
  });
  await expect(opener).toBeVisible();
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  return opener;
}

test('a flow without its scrim returns focus to its opener when it closes from inside', async ({
  page,
}) => {
  const opener = await openFromKeyboard(page, 'no-scrim');
  const cancel = page.getByRole('button', {name: 'Cancel', exact: true});
  await cancel.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(opener).toBeFocused();
});

for (const story of ['removed-while-open', 'removed-while-open-no-scrim']) {
  test(`a switcher removed while its sheet is open returns focus to the opener (${story})`, async ({
    page,
  }) => {
    const opener = await openFromKeyboard(page, story);
    const close = page.getByRole('button', {
      name: 'Close by removing',
      exact: true,
    });
    await close.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
}
