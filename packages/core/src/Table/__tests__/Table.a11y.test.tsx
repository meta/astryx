// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/** Fast DOM binding for Table against the shared Table contract. */

import {cleanup, render} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {
  checkAccessibilitySpec,
  createJsdomHarness,
  expectAccessibilitySpec,
  summarize,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {TABLE_A11Y_RENDERS} from './Table.a11y.renders';
import {
  tableContractFor,
  tableSortFor,
  tableUsesSort,
} from './Table.a11y.contracts';
import {TABLE_SORTABLE_PATTERN} from '../plugins/sortable/__tests__/useTableSortable.a11y';
import {
  TABLE_A11Y_EXCLUSIONS,
  TABLE_A11Y_STATES,
  type TableA11yRow,
} from './Table.a11y.states';

const SUBJECT_SELECTOR = '[data-a11y-table]';
const ROWS = ':scope > thead > tr, :scope > tbody > tr';
const COLUMN_HEADERS = ':scope > thead > tr > th';
const ROW_HEADERS = ':scope > tbody > tr > th';
const FIRST_ROW_CELLS = ':scope > tbody > tr:first-child > td';

function subjectFor(): HTMLElement {
  const subjects = document.querySelectorAll(SUBJECT_SELECTOR);
  if (subjects.length !== 1 || !(subjects[0] instanceof HTMLElement)) {
    throw new Error(
      `binding rendered ${subjects.length} table subjects instead of one`,
    );
  }
  return subjects[0];
}

function relatedFor(state: TableA11yRow): Record<string, Element> {
  const table = subjectFor();
  const related: Record<string, Element> = {};
  const designate = (selector: string, prefix: string, count: number) => {
    const elements = table.querySelectorAll(selector);
    if (elements.length < count) {
      throw new Error(
        `binding rendered ${elements.length} ${prefix} elements, fewer than the ${count} it declares`,
      );
    }
    for (let index = 0; index < count; index += 1) {
      related[`${prefix}-${index}`] = elements[index]!;
    }
  };
  designate(ROWS, 'row', state.facts.rows);
  designate(COLUMN_HEADERS, 'column-header', state.facts.columnHeaders.length);
  designate(ROW_HEADERS, 'row-header', state.facts.rowHeaders.length);
  designate(FIRST_ROW_CELLS, 'cell', state.facts.cells);
  return related;
}

async function checkState(state: TableA11yRow): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: tableContractFor(state),
    binding: 'Table',
    state: state.id,
    facts: state.facts,
    mount: async () => {
      render(TABLE_A11Y_RENDERS[state.id]());
      return createJsdomHarness({
        subject: subjectFor(),
        related: relatedFor(state),
      });
    },
    unmount: cleanup,
  });
}

describe('the shared Table pattern, jsdom lane', () => {
  it.each(
    TABLE_A11Y_STATES.map(
      state => [`Table [${state.id}]`, state.summary, state] as const,
    ),
  )('%s — %s', async (_id, _summary, state) => {
    await expectAccessibilitySpec({
      spec: tableContractFor(state),
      binding: 'Table',
      state: state.id,
      facts: state.facts,
      render: () => {
        render(TABLE_A11Y_RENDERS[state.id]());
      },
      subject: subjectFor,
      related: () => relatedFor(state),
      cleanup,
    });
  });

  it('runs DOM expectations and reports accessibility-tree outcomes as unrun', async () => {
    const results: BindingResult[] = [];
    for (const state of TABLE_A11Y_STATES) {
      results.push(await checkState(state));
    }
    // The sortable contract is the base plus the sort module, so it reports
    // every expectation any state ran.
    const report = summarize(TABLE_SORTABLE_PATTERN, results);
    expect(report.counts.pass).toBeGreaterThan(0);
    expect(report.unrunLayers).toEqual(['accessibility-tree']);
    expect(report.counts.unexpectedPass).toBe(0);
  });
});

describe('the Table binding inventory', () => {
  it('names a distinct checked-in story for every state', () => {
    const ids = TABLE_A11Y_STATES.map(state => state.storyId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('binds only labelled tables, so every state exercises the table name', () => {
    for (const state of TABLE_A11Y_STATES) {
      expect(state.facts.label, state.id).not.toBeNull();
    }
  });

  it('covers data-driven and children composition, row headers, sort, and empty data', () => {
    expect(new Set(TABLE_A11Y_STATES.map(state => state.mode))).toEqual(
      new Set(['data-driven', 'children']),
    );
    expect(
      TABLE_A11Y_STATES.some(state => state.facts.rowHeaders.length > 0),
    ).toBe(true);
    expect(
      TABLE_A11Y_STATES.some(state => tableSortFor(state).length > 0),
    ).toBe(true);
    expect(TABLE_A11Y_STATES.map(state => state.id)).toContain('empty-data');
  });

  it('renders the rows of every sorted state in the order its sort state declares', () => {
    // useTableSortable exposes aria-sort but never reorders data, so a binding
    // can claim a direction its own rows contradict.
    for (const state of TABLE_A11Y_STATES) {
      for (const {column, direction} of tableSortFor(state)) {
        render(TABLE_A11Y_RENDERS[state.id]());
        const values = [
          ...subjectFor().querySelectorAll(':scope > tbody > tr'),
        ].map(row => row.children[column]?.textContent ?? '');
        const ordered = [...values].sort();
        if (direction === 'descending') {
          ordered.reverse();
        }
        expect(values.length, state.id).toBeGreaterThan(1);
        expect(values, `${state.id} column ${column}`).toEqual(ordered);
        cleanup();
      }
    }
  });

  it('composes the sort module only for states rendered with useTableSortable', () => {
    for (const state of TABLE_A11Y_STATES) {
      const ids = tableContractFor(state).expectations.map(
        expectation => expectation.id,
      );
      expect(ids.includes('table.sort.exposed'), state.id).toBe(
        tableUsesSort(state),
      );
      expect('sort' in state.facts, state.id).toBe(tableUsesSort(state));
    }
  });

  it('records every adjacent exclusion with an owner and reason', () => {
    expect(TABLE_A11Y_EXCLUSIONS.every(row => row.owner && row.reason)).toBe(
      true,
    );
  });

  it('declares exactly the rows, headers, and first-row cells each state renders', () => {
    for (const state of TABLE_A11Y_STATES) {
      render(TABLE_A11Y_RENDERS[state.id]());
      const table = subjectFor();
      expect(table.querySelectorAll(ROWS).length, state.id).toBe(
        state.facts.rows,
      );
      expect(table.querySelectorAll(COLUMN_HEADERS).length, state.id).toBe(
        state.facts.columnHeaders.length,
      );
      expect(table.querySelectorAll(ROW_HEADERS).length, state.id).toBe(
        state.facts.rowHeaders.length,
      );
      expect(table.querySelectorAll(FIRST_ROW_CELLS).length, state.id).toBe(
        state.facts.cells,
      );
      cleanup();
    }
  });
});
