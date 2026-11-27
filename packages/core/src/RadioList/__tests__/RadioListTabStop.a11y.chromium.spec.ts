// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/RadioList/|apps/storybook/stories/RadioList\.stories)

/**
 * @file RadioListTabStop.a11y.chromium.spec.ts
 * @input Storybook stories core-radiolist--tab-leaves-group and
 *   core-radiolist--tab-leaves-group-in-dialog: a RadioList with a selection
 *   between two buttons, on a page and in a modal Dialog
 * @output Proof that Tab and Shift+Tab from any radio leave the group, also
 *   from a radio that script focused, which Chromium otherwise sends to the
 *   group's checked radio
 * @position Real-browser keyboard check; jsdom has no native Tab order.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
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

async function openStory(page: Page, id: string): Promise<void> {
  await page.goto(`${storybook.origin}/iframe.html?id=${id}&viewMode=story`, {
    waitUntil: 'load',
  });
  await expect(page.getByRole('radio', {name: 'Email'})).toBeVisible();
}

async function focusByScript(page: Page, name: string): Promise<void> {
  await page.getByRole('radio', {name}).evaluate(radio => {
    (radio as HTMLElement).focus();
  });
  await expect(page.getByRole('radio', {name})).toBeFocused();
}

for (const [where, id] of [
  ['on a page', 'core-radiolist--tab-leaves-group'],
  ['in a modal Dialog', 'core-radiolist--tab-leaves-group-in-dialog'],
] as const) {
  test(`Tab from a script-focused radio leaves the group (${where})`, async ({
    page,
  }) => {
    await openStory(page, id);
    await focusByScript(page, 'Email');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', {name: 'After'})).toBeFocused();
  });

  test(`Shift+Tab from a script-focused radio leaves the group (${where})`, async ({
    page,
  }) => {
    await openStory(page, id);
    await focusByScript(page, 'Push notification');
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', {name: 'Before'})).toBeFocused();
  });

  test(`the checked radio stays the group's one Tab stop (${where})`, async ({
    page,
  }) => {
    await openStory(page, id);
    await page.getByRole('button', {name: 'Before'}).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('radio', {name: 'SMS'})).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', {name: 'After'})).toBeFocused();
  });
}
