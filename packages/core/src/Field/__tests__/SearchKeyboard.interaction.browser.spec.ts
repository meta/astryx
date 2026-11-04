// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SearchKeyboard.interaction.browser.spec.ts
 * @input Storybook stories of Typeahead, Tokenizer, Selector, MultiSelector
 *   and CommandPaletteInput
 * @output On a touch-emulated phone, the search input that a tap focuses
 *   carries `enterkeyhint="search"` and `autocorrect="off"`
 * @position Search keyboard evidence in the interaction lane. jsdom has no
 *   touch input and no real focus.
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

async function expectSearchKeyboard(input: Locator) {
  await expect(input).toHaveCount(1);
  await expect(input).toBeVisible();
  await input.tap();
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('enterkeyhint', 'search');
  await expect(input).toHaveAttribute('autocorrect', 'off');
}

async function openSearchRow(page: Page, story: string, label: string) {
  await openStory(page, storybook(), story);
  const trigger = page.getByRole('button', {name: label, exact: true});
  await expect(trigger).toBeVisible();
  await trigger.tap();
  return page.getByRole('combobox');
}

test('a tap on Typeahead focuses a field that asks for the Search key and no autocorrection', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-typeahead--default');
  await expectSearchKeyboard(page.getByRole('combobox'));
});

test('a tap on Tokenizer focuses a field that asks for the Search key and no autocorrection', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-tokenizer--default');
  await expectSearchKeyboard(page.getByRole('combobox'));
});

test("a tap in Selector's search row focuses a field that asks for the Search key and no autocorrection", async ({
  page,
}) => {
  const search = await openSearchRow(
    page,
    'core-selector--searchable',
    'Fruit',
  );
  await expectSearchKeyboard(search);
});

test("a tap in MultiSelector's search row focuses a field that asks for the Search key and no autocorrection", async ({
  page,
}) => {
  const search = await openSearchRow(
    page,
    'core-multiselector--searchable',
    'Countries',
  );
  await expectSearchKeyboard(search);
});

test('a tap on a standalone CommandPaletteInput focuses a field that asks for the Search key and no autocorrection', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-commandpaletteinput--standalone');
  await expectSearchKeyboard(page.getByRole('searchbox'));
});

test('a tap on CommandPaletteInput inside a palette focuses a field that asks for the Search key and no autocorrection', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-commandpaletteinput--popup-context');
  await expectSearchKeyboard(page.getByRole('combobox'));
});
