// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(internal/a11y-spec/src/patterns/table\.|packages/core/src/Table/|apps/storybook/stories/TableA11y)

/** Real-browser and accessibility-tree binding evidence for Table. */

import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from '@playwright/test';
import {
  blockingResults,
  checkAccessibilitySpec,
  formatFailures,
  neverExercised,
  summarize,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {
  createChromiumHarness,
  holdMotionStill,
} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {TABLE_A11Y_STATES, type TableA11yRow} from './Table.a11y.states';
import {tableContractFor} from './Table.a11y.contracts';

const SUBJECT_SELECTOR = '[data-a11y-table]';
const ROWS = `${SUBJECT_SELECTOR} > thead > tr, ${SUBJECT_SELECTOR} > tbody > tr`;
const COLUMN_HEADERS = `${SUBJECT_SELECTOR} > thead > tr > th`;
const ROW_HEADERS = `${SUBJECT_SELECTOR} > tbody > tr > th`;
const FIRST_ROW_CELLS = `${SUBJECT_SELECTOR} > tbody > tr:first-child > td`;
let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => storybook?.close());

function storyUrl(id: string): string {
  return `${storybook.origin}/iframe.html?id=${id}&viewMode=story`;
}

function relatedFor(page: Page, state: TableA11yRow): Record<string, Locator> {
  const related: Record<string, Locator> = {};
  const designate = (selector: string, prefix: string, count: number) => {
    const elements = page.locator(selector);
    for (let index = 0; index < count; index += 1) {
      related[`${prefix}-${index}`] = elements.nth(index);
    }
  };
  designate(ROWS, 'row', state.facts.rows);
  designate(COLUMN_HEADERS, 'column-header', state.facts.columnHeaders.length);
  designate(ROW_HEADERS, 'row-header', state.facts.rowHeaders.length);
  designate(FIRST_ROW_CELLS, 'cell', state.facts.cells);
  return related;
}

async function runState(
  page: Page,
  cdp: CDPSession,
  state: TableA11yRow,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: tableContractFor(state),
    binding: 'Table',
    state: state.id,
    facts: state.facts,
    mount: async () => {
      await page.goto(storyUrl(state.storyId), {waitUntil: 'load'});
      await holdMotionStill(page);
      const subject = page.locator(SUBJECT_SELECTOR);
      await subject.waitFor({state: 'attached'});
      await expect(subject).toHaveCount(1);
      await expect(page.locator(ROWS)).toHaveCount(state.facts.rows);
      await expect(page.locator(COLUMN_HEADERS)).toHaveCount(
        state.facts.columnHeaders.length,
      );
      await expect(page.locator(ROW_HEADERS)).toHaveCount(
        state.facts.rowHeaders.length,
      );
      await expect(page.locator(FIRST_ROW_CELLS)).toHaveCount(
        state.facts.cells,
      );
      return createChromiumHarness({
        page,
        cdp,
        subject,
        related: relatedFor(page, state),
      });
    },
  });
}

test('every Table expectation is exercised by at least one Table state', async ({
  page,
}) => {
  const cdp = await page.context().newCDPSession(page);
  const results: BindingResult[] = [];
  for (const state of TABLE_A11Y_STATES) {
    results.push(await runState(page, cdp, state));
  }
  expect(neverExercised(results)).toEqual([]);
});

for (const state of TABLE_A11Y_STATES) {
  test(`Table [${state.id}] — ${state.summary}`, async ({page}) => {
    const cdp = await page.context().newCDPSession(page);
    const result = await runState(page, cdp, state);
    const report = summarize(tableContractFor(state), [result]);
    expect(formatFailures(blockingResults([result]))).toBe('');
    expect(
      result.results
        .filter(row => row.status === 'fail')
        .map(row => `${row.expectation}: ${row.detail ?? ''}`),
      'this binding expects no failures',
    ).toEqual([]);
    expect(report.unrunLayers).toEqual([]);
    expect(report.counts.unexpectedPass).toBe(0);
  });
}
