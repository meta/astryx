// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SelectableCardGroupRadio.a11y.chromium.spec.ts
 * @input Uses Playwright and the a11y-spec Storybook server
 * @output Real-browser keyboard checks for a single-choice SelectableCardGroup
 * @position Its cards are native radios with one name, so they form a native
 * radio group: one tab stop on the checked card, arrow keys that move and select
 * with wrapping, Space on a focused card, and a click that never deselects.
 * jsdom has no native radio-group keyboard, so only a real engine shows it.
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

const STORY = 'lab-selectablecardgroup--single-choice';

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

test.describe('SelectableCardGroup, single choice', () => {
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
    expect(['Basic', 'Pro', 'Team']).not.toContain(await focusedName(page));
    await page.keyboard.press('Shift+Tab');
    expect(await focusedName(page)).toBe('Pro');

    await page.keyboard.press('ArrowRight');
    expect(await focusedName(page)).toBe('Team');
    expect(await checkedName(page)).toBe('Team');
    await page.keyboard.press('ArrowRight');
    expect(await focusedName(page)).toBe('Basic');
    expect(await checkedName(page)).toBe('Basic');
    await page.keyboard.press('ArrowLeft');
    expect(await checkedName(page)).toBe('Team');
  });

  test('Space selects the focused card; a click on the chosen card keeps it', async ({
    page,
  }) => {
    await open(page);
    await page.getByRole('radio', {name: 'Team'}).focus();
    await page.keyboard.press('Space');
    expect(await checkedName(page)).toBe('Team');
    await page.getByText('Team', {exact: true}).click();
    expect(await checkedName(page)).toBe('Team');
    await page.getByText('Basic', {exact: true}).click();
    expect(await checkedName(page)).toBe('Basic');
  });
});

test('two groups that share an htmlName in separate forms stay separate', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=lab-selectablecardgroup--two-forms-shared-name&viewMode=story`,
    {waitUntil: 'load'},
  );
  await page.getByRole('radiogroup', {name: 'Second plan'}).waitFor();
  await expect(page.getByRole('radio', {name: 'First Pro'})).toBeChecked();
  await expect(page.getByRole('radio', {name: 'Second Team'})).toBeChecked();
  await page.getByRole('radio', {name: 'Second Team'}).focus();
  await page.keyboard.press('ArrowRight');
  // The arrow wraps inside the second group and leaves the first alone.
  await expect(page.getByRole('radio', {name: 'Second Basic'})).toBeChecked();
  await expect(page.getByRole('radio', {name: 'First Pro'})).toBeChecked();
  const submitted = await page.evaluate(() =>
    Array.from(document.querySelectorAll('form')).map(form =>
      Array.from(new FormData(form).entries()).map(
        ([k, v]) => `${k}=${String(v)}`,
      ),
    ),
  );
  expect(submitted).toEqual([['plan=pro'], ['plan=basic']]);
});
