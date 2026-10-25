// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file useTableSortable.a11y.test.tsx
 * @input Uses the sort module contract and plain-HTML positive and mutation fixtures
 * @output Self-tests for the sort module's `table.sort.exposed` expectation
 * @position Testing; proves the module contract the Table binding composes for sorted states
 */

import {afterEach, describe, expect, it} from 'vitest';
import {
  TABLE_PATTERN,
  checkAccessibilitySpec,
  createJsdomHarness,
  type TableStateFacts,
} from '@astryxdesign/a11y-spec';
import {
  TABLE_SORTABLE_PATTERN,
  TABLE_SORT_MODULE,
  type TableSortFacts,
} from './useTableSortable.a11y';

const COLUMNS = ['Name', 'Role', 'Location'] as const;
const ADA = ['Ada', 'Engineer', 'London'] as const;
const GRACE = ['Grace', 'Admiral', 'Arlington'] as const;
const SORTED: TableSortFacts['sort'] = [{column: 0, direction: 'descending'}];

interface Fixture {
  readonly id: string;
  readonly facts: TableStateFacts & TableSortFacts;
  readonly html: string;
}

/** A labelled data table; `ariaSort` is authored per column header index. */
function html(
  ariaSort: Readonly<Record<number, string>>,
  rows: ReadonlyArray<ReadonlyArray<string>>,
): string {
  const headers = COLUMNS.map((column, index) => {
    const sort =
      ariaSort[index] == null ? '' : `aria-sort="${ariaSort[index]}"`;
    return `<th data-header scope="col" ${sort}>${column}</th>`;
  }).join('');
  const body = rows
    .map(row => `<tr>${row.map(value => `<td>${value}</td>`).join('')}</tr>`)
    .join('');
  return `<table data-table aria-label="Team members"><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table>`;
}

const facts = (sort: TableSortFacts['sort']): Fixture['facts'] => ({
  label: 'Team members',
  columnHeaders: [...COLUMNS],
  rows: 3,
  rowHeaders: [],
  cells: 0,
  sort,
});

// The sorted fixtures render Grace before Ada, so the rows follow the
// descending Name sort they declare; the violating twins keep those rows so
// only the exposed state is wrong.
const CONFORMING: ReadonlyArray<Fixture> = [
  {
    id: 'conforming-sorted',
    facts: facts(SORTED),
    html: html({0: 'descending', 2: 'none'}, [GRACE, ADA]),
  },
  {id: 'conforming-unsorted', facts: facts([]), html: html({}, [ADA, GRACE])},
];
const VIOLATING: ReadonlyArray<Fixture> = [
  {
    id: 'violating-sort-missing',
    facts: facts(SORTED),
    html: html({}, [GRACE, ADA]),
  },
  {
    id: 'violating-sort-direction',
    facts: facts(SORTED),
    html: html({0: 'ascending'}, [GRACE, ADA]),
  },
  {
    id: 'violating-sort-stale',
    facts: facts([]),
    html: html({1: 'ascending'}, [ADA, GRACE]),
  },
];

afterEach(() => document.body.replaceChildren());

async function sortResult(fixture: Fixture) {
  const container = document.createElement('div');
  document.body.append(container);
  const run = await checkAccessibilitySpec({
    spec: TABLE_SORTABLE_PATTERN,
    binding: 'fixture',
    state: fixture.id,
    facts: fixture.facts,
    mount: async () => {
      container.innerHTML = fixture.html;
      const related: Record<string, Element> = {};
      container.querySelectorAll('[data-header]').forEach((header, index) => {
        related[`column-header-${index}`] = header;
      });
      return createJsdomHarness({
        subject: container.querySelector('[data-table]')!,
        related,
      });
    },
    unmount: () => {
      container.innerHTML = '';
    },
  });
  const result = run.results.find(
    row => row.expectation === 'table.sort.exposed',
  );
  if (result == null) {
    throw new Error(`no table.sort.exposed result for ${fixture.id}`);
  }
  return result;
}

describe('the sort module contract', () => {
  it('composes into the table pattern without changing the base', () => {
    expect(TABLE_SORTABLE_PATTERN.pattern).toBe('table');
    expect(
      TABLE_SORTABLE_PATTERN.expectations.map(expectation => expectation.id),
    ).toEqual([
      ...TABLE_PATTERN.expectations.map(expectation => expectation.id),
      'table.sort.exposed',
    ]);
    expect(
      TABLE_PATTERN.expectations.map(expectation => expectation.id),
    ).not.toContain('table.sort.exposed');
    expect(TABLE_SORT_MODULE.module).toBe('useTableSortable');
  });

  it.each(CONFORMING.map(fixture => [fixture.id, fixture] as const))(
    'passes against %s',
    async (_id, fixture) => {
      const result = await sortResult(fixture);
      expect(result.status, result.detail ?? '').toBe('pass');
    },
  );

  it.each(VIOLATING.map(fixture => [fixture.id, fixture] as const))(
    'fails against %s, which removes its outcome',
    async (_id, fixture) => {
      const result = await sortResult(fixture);
      expect(result.status).toBe('fail');
      expect(result.detail ?? '').not.toBe('');
    },
  );

  it.each(
    [...CONFORMING, ...VIOLATING]
      .filter(fixture => fixture.facts.sort.length > 0)
      .map(fixture => [fixture.id, fixture] as const),
  )('%s renders its rows in the declared order', (_id, fixture) => {
    const container = document.createElement('div');
    container.innerHTML = fixture.html;
    for (const {column, direction} of fixture.facts.sort) {
      const values = [...container.querySelectorAll('tbody > tr')].map(
        row => row.children[column]?.textContent ?? '',
      );
      const ordered = [...values].sort();
      if (direction === 'descending') {
        ordered.reverse();
      }
      expect(values.length).toBeGreaterThan(1);
      expect(values).toEqual(ordered);
    }
  });
});
