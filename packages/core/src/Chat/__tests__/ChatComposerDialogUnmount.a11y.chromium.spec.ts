// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Chat/ChatComposer|packages/core/src/gestures|apps/storybook/stories/ChatComposer)

/**
 * @file ChatComposerDialogUnmount.a11y.chromium.spec.ts
 * @input The `Core/ChatComposer` BehindAKeyedDialog story in a built
 *   Storybook, in Chromium
 * @output Real-browser proof that an empty ChatComposerInput keeps its
 *   editable line and takes typing after an open Dialog that holds a
 *   SegmentedControl unmounts
 * @position Runs in pr-a11y when ChatComposer, its input, the gesture host
 *   or their stories change. jsdom does no layout, so only a browser shows
 *   the editable's height after the restyle the unmount causes.
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
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

test('an empty composer takes typing after an open dialog unmounts', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-chatcomposer--behind-a-keyed-dialog&viewMode=story`,
  );
  const editor = page.getByRole('textbox', {name: 'Chat input'});
  await expect(editor).toBeVisible();
  await page.getByRole('button', {name: 'Open dialog'}).click();
  const dialog = page.getByRole('dialog', {name: 'Example dialog'});
  await expect(dialog).toBeVisible();
  await page.getByRole('button', {name: 'Close dialog'}).click();
  await expect(dialog).toHaveCount(0);
  // The editable keeps its line, so a click lands on it.
  const box = await editor.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(22);
  await editor.click();
  await expect(editor).toBeFocused();
  await page.keyboard.type('abc');
  await expect(editor).toHaveText('abc');
});
