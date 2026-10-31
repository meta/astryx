// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The contract each Table binding state checks: the base table contract, plus
 * a module's contract for the states rendered with that module.
 */

import {
  TABLE_PATTERN,
  type PatternContract,
  type TableStateFacts,
} from '@astryxdesign/a11y-spec';
import {
  TABLE_SORTABLE_PATTERN,
  type TableSortFacts,
} from '../plugins/sortable/__tests__/useTableSortable.a11y';
import type {TableA11yState} from './Table.a11y.states';

/** Whether a state renders with useTableSortable. */
export function tableUsesSort(state: TableA11yState): boolean {
  return state.modules.includes('sort');
}

export function tableContractFor(
  state: TableA11yState,
): PatternContract<TableStateFacts> {
  return (
    tableUsesSort(state) ? TABLE_SORTABLE_PATTERN : TABLE_PATTERN
  ) as PatternContract<TableStateFacts>;
}

/** The sort a state declares, or none when it renders without the sort module. */
export function tableSortFor(state: TableA11yState): TableSortFacts['sort'] {
  return 'sort' in state.facts ? state.facts.sort : [];
}
