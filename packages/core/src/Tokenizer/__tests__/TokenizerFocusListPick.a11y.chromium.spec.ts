// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/Tokenizer/ ^packages/core/src/Typeahead/BaseTypeahead ^apps/storybook/stories/Tokenizer

/**
 * @file TokenizerFocusListPick.a11y.chromium.spec.ts
 * @input The `Core/Tokenizer` "With Entries On Focus" story in a built
 *   Storybook, real pointer and keyboard input.
 * @output Real-engine proof that a pick from the focus list keeps DOM focus
 *   on the combobox and the list open, with the next choice active, and that
 *   a press on another control or Tab then closes the list and moves focus.
 * @position Run with `pnpm test:a11y-contract`. Regression proof for
 *   component:Tokenizer FR14, FR15 and AR5.
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

async function openFocusList(page: Page) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tokenizer--with-entries-on-focus&viewMode=story`,
    {waitUntil: 'load'},
  );
  const input = page.getByRole('combobox');
  await input.click();
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  return input;
}

/** The text of the option the combobox names as active, or null. */
async function activeOption(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const input = document.querySelector('[role="combobox"]');
    const id = input?.getAttribute('aria-activedescendant');
    return id ? (document.getElementById(id)?.textContent ?? null) : null;
  });
}

async function optionNames(page: Page): Promise<string[]> {
  return page.getByRole('option').allTextContents();
}

test('a pointer pick keeps focus and the list, with the next choice active', async ({
  page,
}) => {
  const input = await openFocusList(page);
  const before = await optionNames(page);
  expect(before.length).toBeGreaterThan(2);

  await page.getByRole('option', {name: before[1]}).click();

  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('option', {name: before[1]})).toHaveCount(0);
  expect(await activeOption(page)).toBe(before[2]);
});

test('picks in a row by pointer and by keyboard keep the list open', async ({
  page,
}) => {
  const input = await openFocusList(page);
  const before = await optionNames(page);
  expect(before.length).toBeGreaterThan(4);

  await page.getByRole('option', {name: before[0]}).click();
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('option', {name: before[1]}).click();
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  expect(await activeOption(page)).toBe(before[2]);

  await page.keyboard.press('Enter');
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  expect(await activeOption(page)).toBe(before[3]);
  await page.keyboard.press('Enter');
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  expect(await activeOption(page)).toBe(before[4]);
  await expect(page.getByRole('option')).toHaveCount(before.length - 4);
});

test('a keyboard pick of the last choice makes the one before it active', async ({
  page,
}) => {
  const input = await openFocusList(page);
  const before = await optionNames(page);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');

  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  expect(await activeOption(page)).toBe(before[before.length - 2]);
});

test('after a pointer pick, a press elsewhere takes focus and closes the list', async ({
  page,
}) => {
  const input = await openFocusList(page);
  const before = await optionNames(page);
  await page.getByRole('option', {name: before[0]}).click();
  await expect(input).toHaveAttribute('aria-expanded', 'true');

  // A press on the page outside the field.
  await page.mouse.click(5, 5);

  await expect(input).not.toBeFocused();
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await expect(input).not.toHaveAttribute('aria-activedescendant', /.+/);
});

test('after a pick, Tab moves focus on and closes the list', async ({page}) => {
  const input = await openFocusList(page);
  const before = await optionNames(page);
  await page.getByRole('option', {name: before[0]}).click();
  await expect(input).toBeFocused();

  await page.keyboard.press('Tab');

  await expect(input).not.toBeFocused();
  await expect(input).toHaveAttribute('aria-expanded', 'false');
});
