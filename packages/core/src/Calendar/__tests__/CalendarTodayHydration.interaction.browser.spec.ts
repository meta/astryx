// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CalendarTodayHydration.interaction.browser.spec.ts
 * @input The built CalendarHydration fixture stories and the page clock
 * @output In a real browser, Calendar markup rendered on 30 November hydrates
 *   on 1 December with no recoverable error, then shows December with
 *   1 December as today; in a two-month view a pick in the second month keeps
 *   both months; a sheet DateInput and DateTimeInput do the same when opened
 * @position Real-browser server render, hydration and post-hydration evidence
 *   for component:Calendar FR12 and the sheet fields of spec:AST-013 FR9;
 *   jsdom stands in only for the unit lane
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

test.use({timezoneId: 'UTC'});

const SERVER_TIME = new Date('2026-11-30T23:30:00Z');
const BROWSER_TIME = new Date('2026-12-01T00:30:00Z');

async function serverThenHydrate(page: Page, story: string) {
  await page.clock.setFixedTime(SERVER_TIME);
  await openStory(page, storybook(), story);
  await page.getByRole('button', {name: 'Server render'}).click();
  await expect(page.locator('output[data-phase="server"]')).toHaveCount(1);
  const host = page.getByTestId('host');
  // The server knows no today: no day is marked and the grid is hidden.
  await expect(host.locator('[aria-current="date"]')).toHaveCount(0);
  await expect(host.getByRole('grid')).toHaveCount(0);

  await page.clock.setFixedTime(BROWSER_TIME);
  await page.getByRole('button', {name: 'Hydrate'}).click();
  await expect(page.locator('output[data-phase="hydrated"]')).toHaveCount(1);
  return host;
}

test('Calendar markup from one date hydrates on the next date without an error, then shows the browser’s today', async ({
  page,
}) => {
  const host = await serverThenHydrate(
    page,
    'core-calendarhydration--one-month',
  );
  await expect(host.getByRole('grid')).toHaveAttribute(
    'aria-label',
    'December 2026',
  );
  await expect(host.locator('[aria-current="date"]')).toHaveAttribute(
    'data-date',
    '2026-12-01',
  );
  await expect(host.getByRole('button', {name: 'Next month'})).toBeEnabled();
  await expect(page.locator('output')).toHaveAttribute('data-errors', '0');
});

test('a pick in the second month of a hydrated two-month Calendar keeps both months', async ({
  page,
}) => {
  const host = await serverThenHydrate(
    page,
    'core-calendarhydration--two-months',
  );
  const grids = host.getByRole('grid');
  await expect(grids).toHaveCount(2);
  await expect(grids.nth(0)).toHaveAttribute('aria-label', 'December 2026');
  await expect(grids.nth(1)).toHaveAttribute('aria-label', 'January 2027');
  await host.locator('[data-date="2027-01-15"]').click();
  await expect(grids.nth(0)).toHaveAttribute('aria-label', 'December 2026');
  await expect(grids.nth(1)).toHaveAttribute('aria-label', 'January 2027');
  await expect(page.locator('output')).toHaveAttribute('data-errors', '0');
});

for (const [name, story, opener] of [
  ['DateInput', 'core-calendarhydration--sheet-date-input', {name: 'Due'}],
  [
    'DateTimeInput',
    'core-calendarhydration--sheet-date-time-input',
    // A DateTimeInput also has a "Starts time" combobox.
    {name: 'Starts', exact: true},
  ],
] as const) {
  test(`a sheet ${name} from one date hydrates on the next date without an error, then opens on the browser’s today`, async ({
    page,
  }) => {
    const host = await serverThenHydrate(page, story);
    await host.getByRole('combobox', opener).click();
    const sheet = page.locator('dialog[open]');
    await expect(
      sheet.getByRole('button', {name: 'December 2026', exact: false}).first(),
    ).toBeVisible();
    await expect(sheet.locator('[aria-current="date"]')).toHaveAttribute(
      'data-date',
      '2026-12-01',
    );
    await expect(page.locator('output')).toHaveAttribute('data-errors', '0');
  });
}
