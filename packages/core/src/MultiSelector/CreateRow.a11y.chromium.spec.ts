// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file CreateRow.a11y.chromium.spec.ts
 * @input The `Core/MultiSelector` CreateFromQuery story in a built Storybook.
 * @output Real-engine proof of the create row's appear/disappear cycle: what
 *   the live region says as the row comes and goes, and where the highlight
 *   lands when the row vanishes mid-type. The region clears itself after each
 *   announcement, so the spec reads a record of what it exposed rather than
 *   its live text.
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

/**
 * Records every message the polite region exposes, in order. The region
 * clears itself 2 s after its last announcement, so a read of its live text
 * that a slow runner makes late finds it empty; the record keeps what was
 * said.
 */
async function recordPolite(page: Page): Promise<void> {
  await page.evaluate(() => {
    const exposed: string[] = [];
    (window as unknown as {__polite: string[]}).__polite = exposed;
    new MutationObserver(() => {
      const text =
        document
          .querySelector('[data-astryx-live-region="polite"]')
          ?.textContent?.trim() ?? '';
      if (text !== '' && text !== exposed.at(-1)) {
        exposed.push(text);
      }
    }).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
}

/** How many messages the polite region has exposed so far. */
async function politeCount(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as {__polite: string[]}).__polite.length,
  );
}

/** The latest message the polite region exposed after the first `since`. */
async function politeSince(page: Page, since: number): Promise<string> {
  return page.evaluate(
    start =>
      (window as unknown as {__polite: string[]}).__polite
        .slice(start)
        .at(-1) ?? '',
    since,
  );
}

/**
 * Matches a polite region whose newest message is `message`. Messages from
 * different announcers written before the region exposes the previous one are
 * joined in order (spec:AST-086 FR9), so the creation can follow a search
 * status still waiting. The search's own statuses replace each other instead
 * (its `hasReplace` announcer), so they are read whole.
 */
function newestMessage(message: string): RegExp {
  const escaped = message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${escaped}$`);
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
  await recordPolite(page);

  // "Bu": a partial match plus the create row above it.
  await search.pressSequentially('Bu');
  await expect(page.getByRole('option')).toHaveText(['Create "Bu"', 'Bug']);
  await expect.poll(async () => politeSince(page, 0)).toBe('1 result');

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
  const beforeUrgent = await politeCount(page);
  await search.fill('');
  await search.pressSequentially('Urgent');
  await expect(page.getByRole('option')).toHaveText(['Create "Urgent"']);
  await expect
    .poll(async () => politeSince(page, beforeUrgent))
    .toBe('Create "Urgent"');

  // Enter commits: the caller adds the option, the search clears, and the new
  // label is a real row.
  const beforeEnter = await politeCount(page);
  await search.press('Enter');
  await expect
    .poll(async () => politeSince(page, beforeEnter))
    .toMatch(newestMessage('Urgent created'));
  await expect(search).toHaveValue('');
  await expect(page.getByRole('option', {name: 'Urgent'})).toHaveAttribute(
    'aria-selected',
    'true',
  );
});
