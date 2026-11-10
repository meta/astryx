// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Table/plugins/activation/|apps/storybook/stories/TableActivation\.stories)

/**
 * @file TableActivation.a11y.chromium.spec.ts
 * @input Storybook stories core-tableactivation--master-detail and
 *   core-tableactivation--large-table
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
 * links in the CDP tree. Current-state exposure is therefore asserted as a
 * tree-to-DOM join (exactly one accessibility-tree row maps to a DOM row
 * carrying `aria-current="true"` with `data-active`) plus cell-name presence
 * in the tree; tab-stop exposure is asserted through the `focusable` tree
 * property that tabbable rows carry, and through a Tab walk that records row
 * stops only, stepping over each row's own controls. Row locators stay scoped
 * to the story's own table so documentation tables elsewhere on the page
 * cannot leak in.
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

const LARGE_STORY_URL =
  'iframe.html?id=core-tableactivation--large-table&viewMode=story';

/**
 * The story's own table: the one whose rows carry activation state.
 * Documentation tables elsewhere on the page never do, so they cannot leak
 * into the row locators below.
 */
function storyTable(page: Page) {
  return page.locator('table:has(tbody tr[data-activation-eligible])').first();
}

type AxNode = {
  role?: {value?: string};
  name?: {value?: string};
  backendDOMNodeId?: number;
  properties?: {name: string; value?: {value?: unknown}}[];
};

/**
 * Press Tab until `wantStops` table-row stops land, recording row text only.
 * Rows carry their own controls (every story row has an Open button), so a
 * raw focus sequence interleaves buttons; only `TR` stops count, and only
 * tabbable rows can take them — documentation-table rows never do.
 */
async function tabToRowStops(page: Page, wantStops: number): Promise<string[]> {
  const stops: string[] = [];
  for (
    let step = 0;
    step < wantStops * 6 + 30 && stops.length < wantStops;
    step += 1
  ) {
    const stop = await page.evaluate(() => {
      const active = document.activeElement;
      if (active == null || active.tagName !== 'TR') {
        return null;
      }
      return (active as HTMLElement).innerText ?? '';
    });
    if (stop != null && stop !== stops[stops.length - 1]) {
      stops.push(stop);
    }
    await page.keyboard.press('Tab');
  }
  return stops;
}

async function activeTagName(page: Page): Promise<string> {
  return page.evaluate(() => document.activeElement?.tagName ?? '');
}

/**
 * Press Tab until focus lands on a table row again, returning its text.
 * Focus leaves the story table past its last control (through the document)
 * and Chromium wraps it back to the first row, so the next row stop is the
 * wrap target: asserting it keeps the focus-order intent without racing the
 * document stop. Returns null when no row stop lands within the cap.
 */
async function tabToNextRowStop(
  page: Page,
  cap: number,
): Promise<string | null> {
  for (let step = 0; step < cap; step += 1) {
    await page.keyboard.press('Tab');
    if ((await activeTagName(page)) === 'TR') {
      return page.evaluate(
        () => (document.activeElement as HTMLElement).innerText ?? '',
      );
    }
  }
  return null;
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
    nodes: AxNode[];
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

  // Tree-level current state: join each accessibility-tree row back to its
  // DOM row and read the contract attributes there. Exactly one story-table
  // row maps to `aria-current="true"` with `data-active`; every other
  // story-table row maps to neither.
  await cdp.send('DOM.getDocument', {depth: 0});
  const treeRows: {current: unknown; active: unknown; inStory: unknown}[] = [];
  for (const node of nodes) {
    if (node.role?.value !== 'row' || node.backendDOMNodeId == null) {
      continue;
    }
    const {object} = (await cdp.send('DOM.resolveNode', {
      backendNodeId: node.backendDOMNodeId,
    })) as {object: {objectId?: string}};
    if (object.objectId == null) {
      continue;
    }
    const read = async (expression: string) =>
      (
        (await cdp.send('Runtime.callFunctionOn', {
          objectId: object.objectId,
          functionDeclaration: `function () { return (${expression}); }`,
          returnByValue: true,
        })) as {result: {value?: unknown}}
      ).result.value;
    treeRows.push({
      current: await read('this.getAttribute("aria-current")'),
      active: await read('this.getAttribute("data-active")'),
      inStory: await read(
        'this.closest("table")?.querySelector("tbody tr[data-activation-eligible]") != null',
      ),
    });
  }
  const storyTreeRows = treeRows.filter(row => row.inStory === true);
  const currentTreeRows = storyTreeRows.filter(row => row.current === 'true');
  expect(currentTreeRows).toHaveLength(1);
  expect(currentTreeRows[0].active).toBe('true');
  for (const row of storyTreeRows) {
    if (row.current !== 'true') {
      expect(row.active).toBeNull();
    }
  }
});

test('eligible rows keep one sequential tab stop and the archived row keeps none', async ({
  page,
}) => {
  await page.goto(`${storybook.origin}/${STORY_URL}`, {waitUntil: 'load'});
  const table = storyTable(page);
  const bodyRows = table.locator('tbody tr');
  await expect(bodyRows).toHaveCount(4);
  await bodyRows.nth(0).focus();

  // Tab walks the three eligible rows in order, stepping over each row's
  // own Open button; the archived Legacy importer row never takes focus.
  // Past the last control focus leaves the table and wraps to the first
  // row, so the next row stop is the wrap target rather than a leak.
  const stops = await tabToRowStops(page, 3);
  expect(stops).toHaveLength(3);
  expect(stops[0]).toContain('API gateway');
  expect(stops[1]).toContain('Search index');
  expect(stops[2]).toContain('Billing worker');
  for (const stop of stops) {
    expect(stop).not.toContain('Legacy importer');
  }
  const wrapped = await tabToNextRowStop(page, 40);
  expect(wrapped).not.toBeNull();
  expect(wrapped).toContain('API gateway');
  expect(wrapped).not.toContain('Legacy importer');
});

test('a large unvirtualized table keeps one sequential stop per eligible row', async ({
  page,
}) => {
  await page.goto(`${storybook.origin}/${LARGE_STORY_URL}`, {
    waitUntil: 'load',
  });
  const table = storyTable(page);
  const bodyRows = table.locator('tbody tr');
  await expect(bodyRows).toHaveCount(60);
  await bodyRows.nth(0).focus();

  // Fifty-four eligible rows in row order (every tenth row is archived);
  // each row's own Open button is stepped over and archived rows never stop.
  // Past the last control focus leaves the table and wraps to the first
  // row, so the next row stop is the wrap target rather than a leak.
  const stops = await tabToRowStops(page, 54);
  expect(stops).toHaveLength(54);
  const order = stops.map(stop => {
    const match = /Service (\d+)/.exec(stop);
    expect(match).not.toBeNull();
    return Number(match?.[1]);
  });
  const expected = Array.from({length: 60}, (_, index) => index).filter(
    index => index % 10 !== 9,
  );
  expect(order).toEqual(expected);
  const wrapped = await tabToNextRowStop(page, 60);
  expect(wrapped).not.toBeNull();
  expect(wrapped).toContain('Service 0');
});
