// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTableSortable.a11y.ts
 * @input The shared Table contract's module seam and the APG Table pattern's sort-state requirement
 * @output TABLE_SORT_MODULE, TableSortFacts, TableSortDirection, and TABLE_SORTABLE_PATTERN — the accessibility semantics the sort module adds to a table: `aria-sort` on exactly the sorted column headers
 * @position Module contract owned beside useTableSortable; a Table binding composes it only for states rendered with the sort module (`spec:AST-020/FR15`)
 */

import {
  TABLE_AST_020_FR15,
  composeTablePattern,
  tableApgRequirement,
  type TableModuleContract,
} from '@astryxdesign/a11y-spec';

const APG_SORT = tableApgRequirement(
  'If the table contains sortable columns or rows, aria-sort is set to an appropriate value on the header cell element for the sorted column or row as described in the Grid and Table Properties Practice.',
);

const TABLE_ACCESSIBILITY = {
  standard: 'astryx',
  id: 'component:Table',
  clause: 'Accessibility contract',
  url: 'https://github.com/facebook/astryx/blob/6d4f178a24a8fee1f201911a55f595db9e5ae117/packages/core/src/Table/Table.spec.md#L216-L218',
  requirement:
    'Native table semantics, column-header scope, sort `aria-sort`, selection `aria-selected`, CheckboxInput labels, and expansion `aria-expanded` remain unchanged.',
} as const;

/** The two directions a sorted header can expose. */
export type TableSortDirection = 'ascending' | 'descending';

/** What a binding knows about the sort state of one table. */
export interface TableSortFacts {
  /** The sorted columns, by index into `columnHeaders`. Empty when unsorted. */
  readonly sort: ReadonlyArray<{
    readonly column: number;
    readonly direction: TableSortDirection;
  }>;
}

export const TABLE_SORT_MODULE: TableModuleContract<TableSortFacts> = {
  module: 'useTableSortable',
  scope: 'the sort state on its column headers.',
  expectations: [
    {
      id: 'table.sort.exposed',
      outcome:
        'The header of each sorted column states its sort direction and no other header claims one, so people know how the rows are ordered.',
      sources: [TABLE_AST_020_FR15, APG_SORT, TABLE_ACCESSIBILITY],
      wcagOutcome:
        'Supports WCAG 2.2 1.3.1 Info and Relationships by making the order the rows are presented in programmatically available.',
      covers: ['1.3.1-info-and-relationships', 'apg-interaction'],
      appliesWhen: {
        condition: 'the binding designates column headers',
        test: facts => facts.columnHeaders.length > 0,
      },
      evidenceLayer: 'dom',
      enforcement: 'required',
      run: async ({harness, facts}) => {
        for (const [index, title] of facts.columnHeaders.entries()) {
          const header = await harness.related(`column-header-${index}`);
          const sort = await header.attribute('aria-sort');
          const expected =
            facts.sort.find(entry => entry.column === index)?.direction ?? null;
          if (expected == null) {
            if (sort != null && sort !== 'none') {
              throw new Error(
                `the unsorted "${title}" header claims aria-sort="${sort}"`,
              );
            }
          } else if (sort !== expected) {
            throw new Error(
              `the "${title}" header is sorted ${expected} but exposes ${
                sort == null ? 'no aria-sort' : `aria-sort="${sort}"`
              }`,
            );
          }
        }
      },
    },
  ],
};

/** The table contract for states rendered with the sort module. */
export const TABLE_SORTABLE_PATTERN = composeTablePattern(TABLE_SORT_MODULE);
