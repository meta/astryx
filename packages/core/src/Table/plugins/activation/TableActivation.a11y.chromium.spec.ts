// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Table/plugins/activation/|apps/storybook/stories/TableActivation\.stories)

/**
 * @file TableActivation.a11y.chromium.spec.ts
 * @input Storybook story core-tableactivation--master-detail
 * @output Chromium's own accessibility tree and keyboard order for an
 *   activating table: the active row is the single current-state owner,
 *   every eligible row keeps one sequential tab stop, and the ineligible
 *   archived row stays out of the tab order.
 * @position Real-browser check: focus navigation and computed
 *   accessibility-tree exposure differ between engines and jsdom.
 *
 * Platform notes, verified against this repo's pinned Chromium with a static
 * probe page: table rows expose no accessible name (cell text lands on the
 * cell nodes), and `aria-current` surfaces no `current` property on rows or
 * links in the CDP tree. Current-state exposure is therefore asserted at the
 * DOM contract (exactly one owner) plus cell-name presence in the tree;
 * tab-stop exposure is asserted through the `focusable` tree property that
 * tabbable rows carry. Row locators stay scoped to the story's own table so
 * documentation tables elsewhere on the page cannot leak in.
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

const STORY_URL =
  'iframe.html?id=core-tableactivation--master-detail&viewMode=story';

/**
 * The story's own table: the one whose rows carry activation state.
 * Documentation tables elsewhere on the page never do, so they cannot leak
 * into the row locators below.
 */
function storyTable(page: Page) {
  return page.locator('table:has(tbody tr[data-activation-eligible])').first();
}

test('the active row is the single current-state owner', async ({page}) => {
  await page.goto(`${storybook.origin}/${STORY_URL}`, {waitUntil: 'load'});
  const table = storyTable(page);
  await expect(table).toBeAttached();

  // Exactly one body row carries the current-row semantics, on the Search
  // index row the story activates; every other scoped row carries none.
  const bodyRows = table.locator('tbody tr');
  await expect(bodyRows).toHaveCount(4);
  const current = table.locator('tbody tr[aria-current="true"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveAttribute('data-active', 'true');
  await expect(current.first()).toContainText('Search index');
  for (let index = 0; index < 4; index += 1) {
    const row = bodyRows.nth(index);
    const text = (await row.innerText()) ?? '';
    if (text.includes('Search index')) {
      continue;
    }
    await expect(row).not.toHaveAttribute('aria-current', 'true');
  }

  // The tree exposes the row content through the cells: every service name
  // lands on a cell node. Tab stops land on the rows themselves: exactly the
  // three eligible rows carry `focusable`, while the archived row (no tab
  // stop) and plain documentation rows never do.
  const cdp = await page.context().newCDPSession(page);
  const {nodes} = (await cdp.send('Accessibility.getFullAXTree')) as {
    nodes: {
      role?: {value?: string};
      name?: {value?: string};
      properties?: {name: string; value: {value?: unknown}}[];
    }[];
  };
  const cellNames = nodes
    .filter(node => node.role?.value === 'cell')
    .map(node => node.name?.value ?? '');
  for (const service of [
    'API gateway',
    'Search index',
    'Billing worker',
    'Legacy importer',
  ]) {
    expect(cellNames.some(name => name.includes(service))).toBe(true);
  }
  const focusableRows = nodes.filter(
    node =>
      node.role?.value === 'row' &&
      node.properties?.some(
        property =>
          property.name === 'focusable' && property.value?.value === true,
      ),
  );
  expect(focusableRows).toHaveLength(3);
});

test('eligible rows keep one sequential tab stop and the archived row keeps none', async ({
  page,
}) => {
  await page.goto(`${storybook.origin}/${STORY_URL}`, {waitUntil: 'load'});
  const table = storyTable(page);
  const bodyRows = table.locator('tbody tr');
  await expect(bodyRows).toHaveCount(4);
  await bodyRows.nth(0).focus();

  const focused: string[] = [];
  for (let step = 0; step < 4; step += 1) {
    focused.push(
      await page.evaluate(
        () => (document.activeElement as HTMLElement | null)?.innerText ?? '',
      ),
    );
    await page.keyboard.press('Tab');
  }

  // Tab walks the three eligible rows in order, then leaves the rows: the
  // archived Legacy importer row never takes focus.
  expect(focused[0]).toContain('API gateway');
  expect(focused[1]).toContain('Search index');
  expect(focused[2]).toContain('Billing worker');
  expect(focused[3]).not.toContain('Legacy importer');
  for (const text of focused) {
    expect(text).not.toContain('Legacy importer');
  }
});
