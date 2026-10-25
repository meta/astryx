// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * AST-021 state inventory for the Table binding to the shared Table contract.
 * A state rendered with a Table module also binds that module's contract
 * (`Table.a11y.contracts.ts`); the others bind the base contract alone.
 */

import type {TableStateFacts} from '@astryxdesign/a11y-spec';
import type {TableSortFacts} from '../plugins/sortable/__tests__/useTableSortable.a11y';

export interface TableA11yState {
  readonly id:
    | 'data-columns'
    | 'sorted-descending'
    | 'children-row-headers-rtl'
    | 'empty-data';
  readonly mode: 'data-driven' | 'children';
  readonly summary: string;
  /** The Table modules the state renders with; each adds its own contract. */
  readonly modules: ReadonlyArray<'sort'>;
  readonly facts: TableStateFacts | (TableStateFacts & TableSortFacts);
  readonly storyId: string;
}

export type TableA11yRow = (typeof TABLE_A11Y_STATES)[number];

const story = (id: string) => `a11y-table-pattern--${id}`;

export const TABLE_A11Y_STATES = [
  {
    id: 'data-columns',
    mode: 'data-driven',
    summary:
      'a labelled data-driven table with three column headers and data rows',
    modules: [],
    facts: {
      label: 'Team members',
      columnHeaders: ['Name', 'Role', 'Location'],
      rows: 3,
      rowHeaders: [],
      cells: 3,
    },
    storyId: story('data-columns'),
  },
  {
    id: 'sorted-descending',
    mode: 'data-driven',
    summary:
      'every column sortable through useTableSortable, sorted by Name descending',
    modules: ['sort'],
    facts: {
      label: 'Team members',
      columnHeaders: [
        'Sort by Name, sorted descending',
        'Sort by Role',
        'Sort by Location',
      ],
      rows: 3,
      rowHeaders: [],
      cells: 3,
      sort: [{column: 0, direction: 'descending'}],
    },
    storyId: story('sorted-descending'),
  },
  {
    id: 'children-row-headers-rtl',
    mode: 'children',
    summary:
      'a composed right-to-left table named by a visible heading, with a row header per row',
    modules: [],
    facts: {
      label: 'Quarterly totals',
      columnHeaders: ['Region', 'Q1', 'Q2'],
      rows: 3,
      rowHeaders: ['North', 'South'],
      cells: 2,
    },
    storyId: story('children-row-headers-rtl'),
  },
  {
    id: 'empty-data',
    mode: 'data-driven',
    summary:
      'a labelled data-driven table with no rows, whose default empty state is one spanning data cell',
    modules: [],
    facts: {
      label: 'Team members',
      columnHeaders: ['Name', 'Role', 'Location'],
      rows: 2,
      rowHeaders: [],
      cells: 1,
    },
    storyId: story('empty-data'),
  },
] as const satisfies ReadonlyArray<TableA11yState>;

export const TABLE_A11Y_EXCLUSIONS = [
  {
    owner: 'useTableSelection tests and the checkbox contract',
    reason:
      'Selection controls, their labels, and row aria-selected are module behavior under component:Table FR6; this binding does not add the selection column.',
  },
  {
    owner: 'useTableRowStatus tests (module:Table/useTableRowStatus)',
    reason:
      'The generated status column adds a visually hidden header name and per-row indicator cells, which are exactly the parts this contract checks; this binding does not add the status column, so those parts bind separately.',
  },
  {
    owner:
      'useTableRowExpansion, useTableGroupedRows, and useTableTreeData tests',
    reason:
      'Expansion detail rows, group header rows, and tree rows add rows and cells with their own semantics; each module binds separately.',
  },
  {
    owner: 'BaseTable row-index tests',
    reason:
      'aria-rowcount and aria-rowindex for paged or windowed views are not encoded by the Table contract yet.',
  },
  {
    owner: 'useTableSortable tests',
    reason:
      'Sort header buttons, their click and keyboard cycling, multi-sort priority, and sort context-menu actions stay with the module; this binding checks only the header role, name, and aria-sort it produces.',
  },
  {
    owner: 'useTableFiltering and useTableColumnResize tests',
    reason:
      'The filter button and the resize separator render inside header cells and can change the header names this contract checks; each module keeps its own control semantics, and its header states bind separately.',
  },
  {
    owner: 'TableScroll real-browser spec (component:Table FR1)',
    reason:
      'The named Scroll region, its conditional Tab stop, and overflow containment have their own browser evidence.',
  },
  {
    owner: 'AST-009',
    reason:
      'This binding claims DOM and browser accessibility-tree exposure, not table navigation, speech, braille, or virtual-cursor behavior.',
  },
] as const;
