// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file CreateRow.a11y.chromium.spec.ts
 * @input The `Core/MultiSelector` CreateFromQuery story in a built Storybook.
 * @output Real-engine proof of the create row's appear/disappear cycle: what
 *   the live region says as the row comes and goes, and where the highlight
 *   lands when the row vanishes mid-type.
 * @position Run with `pnpm test:a11y-contract`; a DOM emulator cannot show
 *   the live region and the active descendant as a screen reader sees them
 *   across a sequence of keystrokes.
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

async function polite(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      document
        .querySelector('[data-astryx-live-region="polite"]')
        ?.textContent?.trim() ?? '',
  );
}

async function activeDescendantText(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const id = document.activeElement?.getAttribute('aria-activedescendant');
    return id ? (document.getElementById(id)?.textContent?.trim() ?? '') : null;
  });
}

test('the create row is announced as it appears and the highlight survives it vanishing', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-multiselector--create-from-query&viewMode=story`,
  );
  const search = page.getByRole('combobox');
  await expect(search).toBeFocused();

  // "Bu": a partial match plus the create row above it.
  await search.pressSequentially('Bu');
  await expect(page.getByRole('option')).toHaveText(['Create "Bu"', 'Bug']);
  await expect.poll(async () => polite(page)).toBe('1 result');

  // Highlight the create row, then type the letter that makes it vanish: the
  // highlight must not be left pointing at a row that no longer exists.
  await search.press('ArrowDown');
  await expect.poll(async () => activeDescendantText(page)).toBe('Create "Bu"');
  await search.press('g');
  await expect(page.getByRole('option')).toHaveText(['Bug']);
  await expect
    .poll(async () => activeDescendantText(page))
    .not.toBe('Create "Bu"');
  const after = await activeDescendantText(page);
  expect(after === null || after === 'Bug').toBe(true);

  // A query that matches nothing: the row is the whole result and the region
  // says so rather than "No results found".
  await search.fill('');
  await search.pressSequentially('Urgent');
  await expect(page.getByRole('option')).toHaveText(['Create "Urgent"']);
  await expect.poll(async () => polite(page)).toBe('Create "Urgent"');

  // Enter commits: the caller adds the option, the search clears, and the new
  // label is a real row.
  await search.press('Enter');
  await expect.poll(async () => polite(page)).toBe('Urgent created');
  await expect(search).toHaveValue('');
  await expect(page.getByRole('option', {name: 'Urgent'})).toHaveAttribute(
    'aria-selected',
    'true',
  );
});
