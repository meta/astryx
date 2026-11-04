// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(internal/a11y-spec/src/patterns/table\.|packages/core/src/Table/|apps/storybook/stories/TableA11y)

/** Real-browser positive and mutation proof for the Table contract. */

import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from '@playwright/test';
import {describeExpectation, requiredLayers} from '../contract';
import {checkAccessibilitySpec, type ExpectationResult} from '../check';
import {
  CHROMIUM_OBSERVES,
  createChromiumHarness,
  holdMotionStill,
} from '../harness/chromium';
import {TABLE_PATTERN} from './table';
import {
  CONFORMING_TABLE_FIXTURES,
  TABLE_CELL_SELECTOR,
  TABLE_COLUMN_HEADER_SELECTOR,
  TABLE_MUTATIONS,
  TABLE_ROW_HEADER_SELECTOR,
  TABLE_ROW_SELECTOR,
  TABLE_SUBJECT_SELECTOR,
  tableFixture,
  type TableFixture,
} from './table.fixtures';

function fixturePage(html: string): string {
  return `<!doctype html><html lang="en"><body>${html}</body></html>`;
}

async function results(
  page: Page,
  cdp: CDPSession,
  target: TableFixture,
  only?: readonly string[],
): Promise<readonly ExpectationResult[]> {
  const run = await checkAccessibilitySpec({
    spec: TABLE_PATTERN,
    binding: 'fixture',
    state: target.id,
    facts: target.facts,
    only,
    mount: async () => {
      await page.setContent(fixturePage(target.html));
      await holdMotionStill(page);
      const related: Record<string, Locator> = {};
      const designate = (selector: string, prefix: string, count: number) => {
        const elements = page.locator(selector);
        for (let index = 0; index < count; index += 1) {
          related[`${prefix}-${index}`] = elements.nth(index);
        }
      };
      designate(TABLE_ROW_SELECTOR, 'row', target.facts.rows);
      designate(
        TABLE_COLUMN_HEADER_SELECTOR,
        'column-header',
        target.facts.columnHeaders.length,
      );
      designate(
        TABLE_ROW_HEADER_SELECTOR,
        'row-header',
        target.facts.rowHeaders.length,
      );
      designate(TABLE_CELL_SELECTOR, 'cell', target.facts.cells);
      return createChromiumHarness({
        page,
        cdp,
        subject: page.locator(TABLE_SUBJECT_SELECTOR),
        related,
      });
    },
  });
  return run.results;
}

test.describe('Table contract — conforming fixtures', () => {
  for (const id of CONFORMING_TABLE_FIXTURES) {
    test(`${id}: every applicable expectation passes`, async ({page}) => {
      const cdp = await page.context().newCDPSession(page);
      const observed = await results(page, cdp, tableFixture(id));
      expect(
        observed
          .filter(
            result =>
              result.status !== 'pass' && result.status !== 'not-applicable',
          )
          .map(result => `${result.expectation}: ${result.detail ?? ''}`),
      ).toEqual([]);
    });
  }
});

test.describe('Table contract — deliberately violating fixtures', () => {
  for (const expectation of TABLE_PATTERN.expectations) {
    if (
      !requiredLayers(expectation).every(layer =>
        CHROMIUM_OBSERVES.includes(layer),
      )
    ) {
      continue;
    }
    for (const fixtureId of TABLE_MUTATIONS[expectation.id] ?? []) {
      test(`${describeExpectation(expectation)} — fails against ${fixtureId}`, async ({
        page,
      }) => {
        const cdp = await page.context().newCDPSession(page);
        const [result] = await results(page, cdp, tableFixture(fixtureId), [
          expectation.id,
        ]);
        expect(result?.status, result?.detail ?? 'no result').toBe('fail');
        expect(result?.detail ?? '').not.toBe('');
      });
    }
  }
});
