// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Selector/|apps/storybook/stories/Selector\.stories)

/**
 * @file SelectorListboxName.a11y.chromium.spec.ts
 * @input Storybook stories core-selector--default and --searchable with a
 *   value selected
 * @output Chromium's own accessibility tree names the open listbox by the
 *   field's label, never by the trigger's value, in the popover and the
 *   bottom sheet, names the closed searchable trigger by the label and the
 *   selected value, and announces a required searchable trigger as required
 *   without aria-required on the button.
 * @position Real-browser check: a modal sheet and the trigger reference
 *   behave differently in jsdom.
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

async function listboxNames(
  page: Page,
  presentation: string,
  story = 'default',
) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-selector--${story}&viewMode=story&args=presentation:${presentation};value:Banana`,
    {waitUntil: 'load'},
  );
  // The searchable trigger is a plain button until the list opens.
  const trigger = page
    .locator('[role="combobox"], button[aria-haspopup]')
    .first();
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

test('the closed searchable trigger is named by the label and the selected value', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-selector--searchable&viewMode=story&args=presentation:popover;value:Banana`,
    {waitUntil: 'load'},
  );
  const trigger = page.locator('button[aria-haspopup]').first();
  await expect(trigger).toContainText('Banana');
  const cdp = await page.context().newCDPSession(page);
  const {nodes} = (await cdp.send('Accessibility.getFullAXTree')) as {
    nodes: {role?: {value?: string}; name?: {value?: string}}[];
  };
  const names = nodes
    .filter(node => node.role?.value === 'button')
    .map(node => node.name?.value ?? '');
  expect(names).toContain('Fruit Banana');
});

test('a required closed searchable trigger announces required, without aria-required on the button', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-selector--searchable-required&viewMode=story`,
    {waitUntil: 'load'},
  );
  const triggers = page.locator('button[aria-haspopup]');
  await expect(triggers).toHaveCount(4);
  for (const trigger of await triggers.all()) {
    await expect(trigger).not.toHaveAttribute('aria-required');
  }
  const cdp = await page.context().newCDPSession(page);
  const {nodes} = (await cdp.send('Accessibility.getFullAXTree')) as {
    nodes: {
      role?: {value?: string};
      name?: {value?: string};
      description?: {value?: string};
    }[];
  };
  const announced = nodes
    .filter(node => node.role?.value === 'button')
    .map(node => `${node.name?.value ?? ''} | ${node.description?.value ?? ''}`)
    .filter(text => /Fruit|Vegetable|Pick an herb|Nut/.test(text));
  // The label with its marker, a form default that hides the marker, a
  // caller aria-label, and an InputGroup.
  expect(announced).toHaveLength(4);
  for (const text of announced) {
    expect(text).toMatch(/Required/);
  }
});

test('the popover listbox is named by the field label, not the selected value', async ({
  page,
}) => {
  expect(await listboxNames(page, 'popover')).toEqual(['Fruit']);
});

test('the searchable popover listbox is named by the field label', async ({
  page,
}) => {
  expect(await listboxNames(page, 'popover', 'searchable')).toEqual(['Fruit']);
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

  test('the searchable bottom-sheet listbox is named by the field label', async ({
    page,
  }) => {
    expect(await listboxNames(page, 'bottom-sheet', 'searchable')).toEqual([
      'Fruit',
    ]);
  });
});
