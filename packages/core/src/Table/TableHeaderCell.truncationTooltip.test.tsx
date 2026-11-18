// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TableHeaderCell.truncationTooltip.test.tsx
 * @input Uses vitest, @testing-library/react, Table, useTableSortable
 * @output Unit tests for the tooltip that shows a header cell's heading when
 *   its column cuts it short
 * @position Testing; validates that a cut heading shows in full on hover and,
 *   where the header is interactive, on keyboard focus, that it adds no
 *   description, and that a heading that fits shows no tooltip
 *
 * SYNC: When TableHeaderCell.tsx changes, update tests to match new behavior
 */

import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {useState} from 'react';
import {createPortal} from 'react-dom';
import {Table} from './Table';
import {useTableSelection} from './plugins/selection/useTableSelection';
import {useTableSelectionState} from './plugins/selection/useTableSelectionState';
import type {TableColumn} from './types';
import {
  useTableFiltering,
  type TableFilterState,
  type TableFilterValue,
} from './plugins/filtering/useTableFiltering';
import type {PowerSearchConfig} from '../PowerSearch/types';
import {
  useTableSortable,
  type TableSortState,
} from './plugins/sortable/useTableSortable';
// Loaded up front, so the tooltip renders at once.
import '../Tooltip/Tooltip';

interface Row extends Record<string, unknown> {
  payout: string;
}

const HEADING = 'Pending payout this quarter';
const rows: Row[] = [{payout: '$1,200'}];
const columns: TableColumn<Row>[] = [{key: 'payout', header: HEADING}];

/** Makes every element report content wider than its box, as a cut heading is. */
function withOverflow(
  isOverflowing: boolean | ((element: HTMLElement) => boolean),
) {
  const proto = window.HTMLElement.prototype;
  const original = {
    scrollWidth: Object.getOwnPropertyDescriptor(proto, 'scrollWidth'),
    offsetWidth: Object.getOwnPropertyDescriptor(proto, 'offsetWidth'),
  };
  Object.defineProperty(proto, 'scrollWidth', {
    configurable: true,
    get(this: HTMLElement) {
      const isCut =
        typeof isOverflowing === 'function'
          ? isOverflowing(this)
          : isOverflowing;
      return isCut ? 400 : 100;
    },
  });
  Object.defineProperty(proto, 'offsetWidth', {
    configurable: true,
    get: () => 100,
  });
  return () => {
    if (original.scrollWidth) {
      Object.defineProperty(proto, 'scrollWidth', original.scrollWidth);
    }
    if (original.offsetWidth) {
      Object.defineProperty(proto, 'offsetWidth', original.offsetWidth);
    }
  };
}

let restore: (() => void) | null = null;

// Focus counts as keyboard focus only after a key press: the modality reader
// is shared across the document, so each test starts from a keyboard press.
beforeEach(() => {
  fireEvent.keyDown(document.body, {key: 'Tab'});
});

afterEach(() => {
  restore?.();
  restore = null;
  vi.restoreAllMocks();
});

function tooltip() {
  return screen.queryByRole('tooltip', {hidden: true});
}

function SortableTable() {
  const [sort, setSort] = useState<TableSortState>([]);
  const sortPlugin = useTableSortable<Row>({sort, onSortChange: setSort});
  return (
    <Table
      data={rows}
      columns={[{key: 'payout', header: HEADING, sortable: true}]}
      plugins={{sort: sortPlugin}}
    />
  );
}

describe('TableHeaderCell truncation tooltip', () => {
  it('closes when focus leaves the header', async () => {
    restore = withOverflow(true);
    const realMatches = Element.prototype.matches;
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      return selector === ':focus-visible'
        ? true
        : realMatches.call(this, selector);
    });
    render(<SortableTable />);
    const sortButton = screen.getByRole('button', {name: HEADING});
    act(() => {
      sortButton.focus();
    });
    await waitFor(() => {
      expect(tooltip()).toHaveTextContent(HEADING);
    });
    act(() => {
      sortButton.blur();
    });
    await waitFor(() => {
      expect(tooltip()).toBeNull();
    });
  });

  it('shows nothing on a mouse hover, as before', async () => {
    restore = withOverflow(true);
    render(<Table data={rows} columns={columns} />);
    const header = screen.getByRole('columnheader');
    act(() => {
      fireEvent.pointerOver(header, {pointerType: 'mouse'});
      fireEvent.pointerEnter(header, {pointerType: 'mouse'});
      fireEvent.mouseOver(header);
      fireEvent.mouseEnter(header);
    });
    await new Promise(resolve => setTimeout(resolve, 600));
    expect(tooltip()).toBeNull();
  });

  it('shows the full heading on keyboard focus of a sortable header', async () => {
    restore = withOverflow(true);
    const realMatches = Element.prototype.matches;
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      return selector === ':focus-visible'
        ? true
        : realMatches.call(this, selector);
    });
    render(<SortableTable />);
    const sortButton = screen.getByRole('button', {name: HEADING});
    act(() => {
      sortButton.focus();
    });
    await waitFor(() => {
      expect(tooltip()).toHaveTextContent(HEADING);
    });
    expect(sortButton).not.toHaveAttribute('aria-describedby');
    // The heading is named once: the sort control's name is the heading, and
    // nothing in the header repeats it as a description.
    const header = screen.getByRole('columnheader');
    expect(sortButton).toHaveAccessibleName(HEADING);
    expect(sortButton).toHaveAccessibleDescription('');
    expect(header).not.toHaveAttribute('aria-describedby');
  });

  it('shows no tooltip when the heading fits', async () => {
    restore = withOverflow(false);
    const realMatches = Element.prototype.matches;
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      return selector === ':focus-visible'
        ? true
        : realMatches.call(this, selector);
    });
    render(<SortableTable />);
    act(() => {
      screen.getByRole('button', {name: HEADING}).focus();
    });
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(tooltip()).toBeNull();
  });

  it('measures nothing at rest', () => {
    const proto = window.HTMLElement.prototype;
    const original = Object.getOwnPropertyDescriptor(proto, 'scrollWidth');
    let reads = 0;
    Object.defineProperty(proto, 'scrollWidth', {
      configurable: true,
      get() {
        reads += 1;
        return 400;
      },
    });
    try {
      render(<Table data={rows} columns={columns} />);
      expect(reads).toBe(0);
    } finally {
      if (original) {
        Object.defineProperty(proto, 'scrollWidth', original);
      }
    }
  });
});

function SelectableTable() {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const data = [{id: 'a', payout: '$1,200'}];
  const {selectionConfig} = useTableSelectionState<{
    id: string;
    payout: string;
  }>({data, idKey: 'id', selectedKeys, setSelectedKeys});
  const plugin = useTableSelection<{id: string; payout: string}>(
    selectionConfig,
  );
  return (
    <Table
      data={data}
      columns={[{key: 'payout', header: 'Payout'}]}
      idKey="id"
      plugins={{selection: plugin}}
    />
  );
}

describe('TableHeaderCell truncation tooltip with row selection', () => {
  it("shows no tooltip for the select-all cell's screen-reader label", async () => {
    // The visually hidden label clips by design; it is not a cut heading.
    restore = withOverflow(true);
    const realMatches = Element.prototype.matches;
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      return selector === ':focus-visible'
        ? true
        : realMatches.call(this, selector);
    });
    render(<SelectableTable />);
    act(() => {
      screen.getByLabelText('Select all rows').focus();
    });
    await new Promise(resolve => setTimeout(resolve, 400));
    expect(
      screen
        .queryAllByRole('tooltip', {hidden: true})
        .filter(el => /select all/i.test(el.textContent ?? '')),
    ).toHaveLength(0);
  });
});

describe('TableHeaderCell truncation tooltip with a field in the header', () => {
  it('shows nothing when a pointer focuses a field in a cut header', async () => {
    restore = withOverflow(true);
    const realMatches = Element.prototype.matches;
    // A text field a pointer focused still matches :focus-visible.
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      return selector === ':focus-visible'
        ? true
        : realMatches.call(this, selector);
    });
    render(
      <Table
        data={rows}
        columns={[
          {
            key: 'payout',
            header: (
              <span>
                {HEADING} <input aria-label="Filter payouts" />
              </span>
            ),
          },
        ]}
      />,
    );
    const field = screen.getByLabelText('Filter payouts');
    act(() => {
      fireEvent.pointerDown(field, {pointerType: 'mouse'});
      field.focus();
    });
    await new Promise(resolve => setTimeout(resolve, 400));
    expect(tooltip()).toBeNull();
  });
});

describe('TableHeaderCell truncation tooltip with header controls', () => {
  function withFocusVisible() {
    const realMatches = Element.prototype.matches;
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      return selector === ':focus-visible'
        ? true
        : realMatches.call(this, selector);
    });
  }

  it('ignores focus that a portal inside the header delivers', async () => {
    restore = withOverflow(true);
    withFocusVisible();
    render(
      <Table
        data={rows}
        columns={[
          {
            key: 'payout',
            header: (
              <span>
                {HEADING}
                {createPortal(
                  <button type="button">Apply filter</button>,
                  document.body,
                )}
              </span>
            ),
          },
        ]}
      />,
    );
    act(() => {
      screen.getByRole('button', {name: 'Apply filter'}).focus();
    });
    await new Promise(resolve => setTimeout(resolve, 400));
    expect(tooltip()).toBeNull();
  });

  it("does not take a field's own overflow for a cut heading", async () => {
    // Only the field's value is wider than its box; the heading fits.
    restore = withOverflow(element => element.tagName === 'INPUT');
    withFocusVisible();
    render(
      <Table
        data={rows}
        columns={[
          {
            key: 'payout',
            header: (
              <span>
                Payout <input aria-label="Filter payouts" />
              </span>
            ),
          },
        ]}
      />,
    );
    act(() => {
      screen.getByLabelText('Filter payouts').focus();
    });
    await new Promise(resolve => setTimeout(resolve, 400));
    expect(tooltip()).toBeNull();
  });
});

describe('TableHeaderCell truncation tooltip with an inline enum filter', () => {
  const DEPARTMENT = 'Department of the employee';
  const config: PowerSearchConfig = {
    name: 'people',
    fields: [
      {
        key: 'department',
        label: DEPARTMENT,
        defaultOperator: 'is',
        operators: [
          {
            key: 'is',
            label: 'is',
            value: {
              type: 'enum',
              values: [
                {value: 'ops', label: 'Ops'},
                {value: 'design', label: 'Design and research'},
              ],
            },
          },
        ],
      },
    ],
  };
  const data = [{id: '1', department: 'ops'}];

  function FilteredTable() {
    const [filters, setFilters] = useState<TableFilterState>({
      department: 'ops',
    });
    const plugin = useTableFiltering<{id: string; department: string}>({
      filters,
      onFilterChange: (key: string, value: TableFilterValue | null) =>
        setFilters(prev => {
          if (value == null) {
            const {[key]: _removed, ...next} = prev;
            return next;
          }
          return {...prev, [key]: value};
        }),
      variant: 'inline',
      searchConfig: config,
    });
    return (
      <Table
        data={data}
        columns={[
          {key: 'department', header: DEPARTMENT, filter: 'department'},
        ]}
        idKey="id"
        plugins={{filter: plugin}}
      />
    );
  }

  function withFocusVisible() {
    const realMatches = Element.prototype.matches;
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      return selector === ':focus-visible'
        ? true
        : realMatches.call(this, selector);
    });
  }

  // The filter's own controls carry tooltips of their own (Clear); only the
  // heading's tooltip is checked here.
  function headingTooltips() {
    return screen
      .queryAllByRole('tooltip', {hidden: true})
      .filter(el => (el.textContent ?? '').includes(DEPARTMENT));
  }

  function focusFilter() {
    const header = screen.getByRole('columnheader');
    const control = header.querySelector<HTMLElement>(
      'button, input, [tabindex]:not([tabindex="-1"])',
    );
    expect(control).not.toBeNull();
    act(() => {
      control?.focus();
    });
  }

  it("shows nothing under a fitting heading when the filter's value is cut", async () => {
    // Only the filter's own value clips; the heading fits.
    restore = withOverflow(
      element =>
        element.closest(
          'input, [role="combobox"], [role="listbox"], [role="textbox"]',
        ) != null,
    );
    withFocusVisible();
    render(<FilteredTable />);
    focusFilter();
    await new Promise(resolve => setTimeout(resolve, 400));
    expect(headingTooltips()).toHaveLength(0);
  });

  it('shows only the heading, not the filter value, when the heading is cut', async () => {
    restore = withOverflow(true);
    withFocusVisible();
    render(<FilteredTable />);
    focusFilter();
    await waitFor(() => {
      expect(headingTooltips()).toHaveLength(1);
    });
    expect(headingTooltips()[0].textContent?.trim()).toBe(DEPARTMENT);
  });
});
