// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Selector/|apps/storybook/stories/Selector\.stories)

/**
 * @file SelectorListboxName.a11y.chromium.spec.ts
 * @input Storybook story core-selector--default with a value selected
 * @output Chromium's own accessibility tree names the open listbox by the
 *   field's label, never by the trigger's value, in the popover and the
 *   bottom sheet.
 * @position Real-browser check: a modal sheet and the trigger reference
 *   behave differently in jsdom.
 */

import {expect, test, type Page} from '@playwright/test';
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

async function listboxNames(page: Page, presentation: string) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-selector--default&viewMode=story&args=presentation:${presentation};value:Banana`,
    {waitUntil: 'load'},
  );
  const trigger = page.getByRole('combobox').first();
  await expect(trigger).toContainText('Banana');
  await trigger.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  const {nodes} = (await cdp.send('Accessibility.getFullAXTree')) as {
    nodes: {role?: {value?: string}; name?: {value?: string}}[];
  };
  return nodes
    .filter(node => node.role?.value === 'listbox')
    .map(node => node.name?.value ?? '');
}

test('the popover listbox is named by the field label, not the selected value', async ({
  page,
}) => {
  expect(await listboxNames(page, 'popover')).toEqual(['Fruit']);
});

test.describe('bottom sheet', () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: {width: 390, height: 844},
  });

  test('the bottom-sheet listbox is named by the field label too', async ({
    page,
  }) => {
    expect(await listboxNames(page, 'bottom-sheet')).toEqual(['Fruit']);
  });
});
