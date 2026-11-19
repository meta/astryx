// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Typeahead/|packages/core/src/Tokenizer/|packages/core/src/Popover/|packages/cli/assets/templates/blocks/components/BaseTypeahead/|apps/storybook/stories/BaseTypeahead|apps/storybook/\.storybook/)

/**
 * @file BaseTypeaheadMenu.a11y.chromium.spec.ts
 * @input The `Core/BaseTypeahead` Menu story in a built Storybook, in Chromium.
 * @output Real-browser proof of component:BaseTypeahead FR13–FR16: the arrow
 *   keys move through the listbox menu's options with information around it,
 *   a pick switches the same open layer to a named dialog that takes focus,
 *   and closing the dialog returns focus to the element that opened it. The
 *   field draws its keyboard focus ring.
 * @position Runs in pr-a11y when Typeahead, Tokenizer, Popover or this story
 *   changes. jsdom has no top layer and no real focus movement on close.
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

const STORY = 'core-basetypeahead--menu';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(DEFAULT_STORYBOOK_DIR);
});

test.afterAll(async () => {
  await storybook?.close();
});

async function openStory(page: Page) {
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  const input = page.getByRole('combobox', {name: 'Add a filter'});
  await expect(input).toBeVisible();
  return input;
}

test('the field draws its focus ring when the input has keyboard focus', async ({
  page,
}) => {
  const input = await openStory(page);
  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();
  const ring = await input.evaluate(element => {
    const style = getComputedStyle(element.parentElement as HTMLElement);
    return {width: parseFloat(style.outlineWidth), style: style.outlineStyle};
  });
  expect(ring.style).toBe('solid');
  expect(ring.width).toBeGreaterThanOrEqual(2);
});

/** The text of the option the field marks active, or null. */
async function activeOption(page: Page) {
  return page.evaluate(() => {
    const field = document.querySelector('[role="combobox"]');
    const id = field?.getAttribute('aria-activedescendant');
    return id == null ? null : document.getElementById(id)?.textContent;
  });
}

/**
 * Opens the field's list and waits until it marks an active option. The list
 * loads its entries after the click; Enter and the arrow keys act on the
 * active option, so a key pressed before it exists does nothing, as it does
 * for a person.
 */
async function openList(page: Page, input: Locator) {
  await input.click();
  await expect(page.getByRole('option', {name: /Status/})).toBeVisible();
  await expect.poll(async () => activeOption(page)).toContain('Status');
}

test('the arrow keys move through the options, with information around the list', async ({
  page,
}) => {
  const input = await openStory(page);
  await openList(page, input);
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect(page.getByText('Filter by')).toBeVisible();
  await expect(page.getByText('Arrow keys move, Enter picks')).toBeVisible();

  await input.press('ArrowDown');
  await expect.poll(async () => activeOption(page)).toContain('Priority');
  await input.press('ArrowDown');
  await expect.poll(async () => activeOption(page)).toContain('Owner');
  // Focus never left the input.
  await expect(input).toBeFocused();
});

test('a pick switches the open layer to a named dialog that takes focus', async ({
  page,
}) => {
  const input = await openStory(page);
  await openList(page, input);
  await input.press('ArrowDown');
  await expect.poll(async () => activeOption(page)).toContain('Priority');
  // The menu's layer: the open popover that holds the result list.
  const layer = page.locator('[popover]:popover-open:has([role="listbox"])');
  await expect(layer).toHaveCount(1);
  const layerId = await layer.getAttribute('id');

  await input.press('Enter');

  const dialog = page.getByRole('dialog', {name: 'Priority filter'});
  await expect(dialog).toBeVisible();
  // The same layer now holds the dialog: it never closed in between.
  await expect(
    page.locator('[popover]:popover-open:has([role="dialog"])'),
  ).toHaveAttribute('id', layerId ?? '');
  await expect(input).toHaveAttribute('aria-haspopup', 'dialog');
  await expect(dialog.getByRole('radio', {name: 'High'})).toBeFocused();
});

test('Escape returns focus to the filter button that opened the dialog', async ({
  page,
}) => {
  const input = await openStory(page);
  await openList(page, input);
  await input.press('Enter');
  await page
    .getByRole('dialog', {name: 'Status filter'})
    .getByRole('button', {name: 'Apply'})
    .click();
  const filter = page.getByRole('button', {name: 'Status: Open'});
  await expect(filter).toBeVisible();

  await filter.focus();
  await filter.press('Enter');
  const dialog = page.getByRole('dialog', {name: 'Status filter'});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radio', {name: 'Open'})).toBeFocused();
  await page.keyboard.press('Escape');

  await expect(dialog).toBeHidden();
  await expect(filter).toBeFocused();
});

test('a press outside the field and the dialog closes the dialog', async ({
  page,
}) => {
  const input = await openStory(page);
  await openList(page, input);
  await input.press('Enter');
  const dialog = page.getByRole('dialog', {name: 'Status filter'});
  await expect(dialog).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(dialog).toBeHidden();
});
