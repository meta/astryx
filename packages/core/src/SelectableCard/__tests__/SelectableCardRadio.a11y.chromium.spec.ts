// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SelectableCardRadio.a11y.chromium.spec.ts
 * @input Uses Playwright and the a11y-spec Storybook server
 * @output Real-browser keyboard checks for SelectableCard's radio input
 * @position Cards with inputType="radio" and one name form a native radio
 * group: one tab stop on the checked card, arrow keys that move and select
 * with wrapping, Space on a focused card, and a click that never deselects.
 * jsdom has no native radio-group keyboard, so only a real engine shows it.
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

const STORY = 'core-selectablecard--radio-input';

async function open(page: Page): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`,
    {waitUntil: 'load'},
  );
  await page.getByRole('radiogroup', {name: 'Plan'}).waitFor();
}

async function checkedName(page: Page): Promise<string | null> {
  return page
    .locator('#storybook-root input[type="radio"]:checked')
    .getAttribute('aria-label');
}

async function focusedName(page: Page): Promise<string | null> {
  return page.evaluate(
    () => document.activeElement?.getAttribute('aria-label') ?? null,
  );
}

test.describe('SelectableCard inputType="radio"', () => {
  test('is a named radio group of native radios', async ({page}) => {
    await open(page);
    const group = page.getByRole('radiogroup', {name: 'Plan'});
    await expect(group.getByRole('radio')).toHaveCount(3);
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByRole('radio', {name: 'Basic'})).toBeChecked();
  });

  test('one tab stop on the checked card; arrows move and select, wrapping', async ({
    page,
  }) => {
    await open(page);
    await page.getByText('Pro', {exact: true}).click();
    expect(await checkedName(page)).toBe('Pro');
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    await page.keyboard.press('Tab');
    expect(await focusedName(page)).toBe('Pro');
    await page.keyboard.press('Tab');
    expect(['Basic', 'Pro', 'Enterprise']).not.toContain(
      await focusedName(page),
    );
    await page.keyboard.press('Shift+Tab');
    expect(await focusedName(page)).toBe('Pro');

    await page.keyboard.press('ArrowRight');
    expect(await focusedName(page)).toBe('Enterprise');
    expect(await checkedName(page)).toBe('Enterprise');
    await page.keyboard.press('ArrowRight');
    expect(await focusedName(page)).toBe('Basic');
    expect(await checkedName(page)).toBe('Basic');
    await page.keyboard.press('ArrowLeft');
    expect(await checkedName(page)).toBe('Enterprise');
  });

  test('Space selects the focused card; a click on the chosen card keeps it', async ({
    page,
  }) => {
    await open(page);
    await page.getByRole('radio', {name: 'Enterprise'}).focus();
    await page.keyboard.press('Space');
    expect(await checkedName(page)).toBe('Enterprise');
    await page.getByText('Enterprise', {exact: true}).click();
    expect(await checkedName(page)).toBe('Enterprise');
    await page.getByText('Basic', {exact: true}).click();
    expect(await checkedName(page)).toBe('Basic');
  });
});
