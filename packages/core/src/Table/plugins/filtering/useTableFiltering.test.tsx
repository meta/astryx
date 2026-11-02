// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTableFiltering.test.tsx
 * @input useTableFiltering, Table, React testing utilities
 * @output Functional tests for the filtering plugin
 * @position Test file; validates filter rendering, interaction, and accessibility
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {useState} from 'react';
import {renderToString} from 'react-dom/server';
import {act, fireEvent, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Table} from '../../Table';
import {useTableFiltering, toSearchFilters} from './useTableFiltering';
import {useTableFilterState} from './useTableFilterState';
import type {
  TableFilterState,
  TableFilterVariant,
  TableFilterValue,
  TableFilterPresentation,
} from './useTableFiltering';
import type {PowerSearchConfig} from '../../../PowerSearch/types';
import type {TablePlugin, TableColumn} from '../../types';
import {COMPACT_TOUCH_PRESENTATION_QUERY} from '../../../hooks/useAdaptivePresentation';
import {resetBottomSheetStackForTests} from '../../../BottomSheet/bottomSheetStack';

// =============================================================================
// Test Data
// =============================================================================

interface TestRow extends Record<string, unknown> {
  id: string;
  name: string;
  status: string;
  age: number;
  tags: string;
}

const testData: TestRow[] = [
  {id: '1', name: 'Alice', status: 'active', age: 30, tags: 'admin'},
  {id: '2', name: 'Bob', status: 'inactive', age: 25, tags: 'user'},
  {id: '3', name: 'Charlie', status: 'active', age: 35, tags: 'user'},
];

// =============================================================================
// Shared PowerSearch Config
// =============================================================================

const statusOptions = [
  {value: 'active', label: 'Active'},
  {value: 'inactive', label: 'Inactive'},
];

const tagOptions = [
  {value: 'admin', label: 'Admin'},
  {value: 'user', label: 'User'},
];

const searchConfig: PowerSearchConfig = {
  name: 'test',
  fields: [
    {
      key: 'name',
      label: 'Name',
      defaultOperator: 'contains',
      operators: [
        {key: 'contains', label: 'contains', value: {type: 'string'}},
      ],
    },
    {
      key: 'status',
      label: 'Status',
      defaultOperator: 'is',
      operators: [
        {key: 'is', label: 'is', value: {type: 'enum', values: statusOptions}},
      ],
    },
    {
      key: 'age',
      label: 'Age',
      defaultOperator: 'equals',
      operators: [
        {
          key: 'equals',
          label: 'equals',
          value: {type: 'integer', minValue: 0, maxValue: 120},
        },
      ],
    },
    {
      key: 'tags',
      label: 'Tags',
      defaultOperator: 'includes',
      operators: [
        {
          key: 'includes',
          label: 'includes',
          value: {type: 'enum_list', values: tagOptions},
        },
      ],
    },
  ],
};

// =============================================================================
// Test Columns
// =============================================================================

const defaultColumns: TableColumn<TestRow>[] = [
  {key: 'name', header: 'Name', filter: 'name'},
  {key: 'status', header: 'Status', filter: 'status'},
  {key: 'age', header: 'Age', filter: 'age'},
];

const allFilterColumns: TableColumn<TestRow>[] = [
  {key: 'name', header: 'Name', filter: 'name'},
  {key: 'status', header: 'Status', filter: 'status'},
  {key: 'age', header: 'Age', filter: 'age'},
  {key: 'tags', header: 'Tags', filter: 'tags'},
];

// =============================================================================
// Test Helper Component
// =============================================================================

const NO_FILTERS: TableFilterState = {};
const NO_EXTRA_PLUGINS: Record<string, TablePlugin<TestRow>> = {};

function FilterTable({
  columns = defaultColumns,
  variant = 'popover',
  presentation,
  initialFilters = NO_FILTERS,
  hasClearAll = true,
  extraPlugins = NO_EXTRA_PLUGINS,
}: {
  columns?: TableColumn<TestRow>[];
  variant?: TableFilterVariant;
  presentation?: TableFilterPresentation;
  initialFilters?: TableFilterState;
  hasClearAll?: boolean;
  extraPlugins?: Record<string, TablePlugin<TestRow>>;
}) {
  const [filters, setFilters] = useState<TableFilterState>(initialFilters);

  const filterPlugin = useTableFiltering<TestRow>({
    filters,
    onFilterChange: (key: string, value: TableFilterValue | null) => {
      setFilters(prev => {
        if (value == null) {
          const {[key]: _removed, ...next} = prev;
          return next;
        }
        return {...prev, [key]: value};
      });
    },
    onClearAll: hasClearAll ? () => setFilters({}) : undefined,
    variant,
    presentation,
    searchConfig,
  });

  return (
    <>
      <Table
        data={testData}
        columns={columns}
        idKey="id"
        plugins={{filter: filterPlugin, ...extraPlugins}}
      />
      <output data-testid="filters">{JSON.stringify(filters)}</output>
    </>
  );
}

// =============================================================================
// Tests
// =============================================================================

describe('useTableFiltering', () => {
  describe('popover variant — rendering', () => {
    it('renders filter icon for filterable columns', () => {
      render(<FilterTable />);
      const filterButtons = screen.getAllByRole('button', {name: /Filter /});
      expect(filterButtons).toHaveLength(3);
    });

    it('renders no filter icon for columns without filter config', () => {
      const noFilterColumns: TableColumn<TestRow>[] = [
        {key: 'name', header: 'Name'},
        {key: 'status', header: 'Status'},
      ];
      render(<FilterTable columns={noFilterColumns} />);
      expect(screen.queryAllByLabelText(/Filter /)).toHaveLength(0);
    });

    it('filter trigger button is clickable', async () => {
      const user = userEvent.setup();
      render(<FilterTable />);
      const filterButton = screen.getByRole('button', {name: 'Filter Name'});
      await user.click(filterButton);
      // Button exists and is interactive
      expect(filterButton).toBeInTheDocument();
    });
  });

  describe('inline variant — rendering', () => {
    it('renders inline filter controls', () => {
      render(<FilterTable variant="inline" />);
      const textInputs = screen.getAllByRole('textbox');
      expect(textInputs.length).toBeGreaterThanOrEqual(1);
    });

    it('renders text input for string field', () => {
      render(<FilterTable variant="inline" />);
      const textInputs = screen.getAllByPlaceholderText(/^Filter /);
      expect(textInputs.length).toBeGreaterThanOrEqual(1);
    });

    it('renders number input for integer field', () => {
      render(<FilterTable variant="inline" />);
      const numberInputs = screen.getAllByRole('spinbutton');
      expect(numberInputs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('inline variant — interaction', () => {
    it('updates text filter on type', async () => {
      const user = userEvent.setup();
      render(<FilterTable variant="inline" />);
      const textInputs = screen.getAllByPlaceholderText(/^Filter /);
      await user.type(textInputs[0], 'Alice');
      expect(textInputs[0]).toHaveValue('Alice');
    });

    it('updates a number filter while typing', async () => {
      const user = userEvent.setup();
      render(<FilterTable variant="inline" />);
      const input = screen.getByRole('spinbutton', {name: 'Filter Age'});

      await user.type(input, '30');

      expect(screen.getByTestId('filters')).toHaveTextContent('{"age":30}');
    });

    it('restores the pre-edit number filter when an invalid draft blurs', async () => {
      const user = userEvent.setup();
      render(<FilterTable variant="inline" />);
      const input = screen.getByRole('spinbutton', {name: 'Filter Age'});

      await user.type(input, '3·');
      expect(screen.getByTestId('filters')).toHaveTextContent('{"age":3}');
      await user.tab();

      expect(screen.getByTestId('filters')).toHaveTextContent('{}');
    });

    it('restores the pre-edit number filter when Enter rejects a draft', async () => {
      const user = userEvent.setup();
      render(<FilterTable variant="inline" />);
      const input = screen.getByRole('spinbutton', {name: 'Filter Age'});

      await user.type(input, '3·');
      await user.keyboard('{Enter}');

      expect(input).toHaveValue('3·');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByTestId('filters')).toHaveTextContent('{}');
    });
  });

  describe('field reference forms', () => {
    it('supports object form { field, operator }', () => {
      const columns: TableColumn<TestRow>[] = [
        {
          key: 'name',
          header: 'Name',
          filter: {field: 'name', operator: 'contains'},
        },
      ];
      render(<FilterTable columns={columns} variant="inline" />);
      const textInputs = screen.getAllByPlaceholderText(/^Filter /);
      expect(textInputs.length).toBeGreaterThanOrEqual(1);
    });

    it('ignores unresolvable field references', () => {
      const columns: TableColumn<TestRow>[] = [
        {key: 'name', header: 'Name', filter: 'nonexistent_field'},
      ];
      expect(() => render(<FilterTable columns={columns} />)).not.toThrow();
    });
  });

  describe('toSearchFilters', () => {
    it('converts table filter state to PowerSearchFilter[]', () => {
      const filters: TableFilterState = {name: 'alice', status: 'active'};
      const result = toSearchFilters(filters, defaultColumns, searchConfig);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        field: 'name',
        operator: 'contains',
        value: {type: 'string', value: 'alice'},
      });
      expect(result[1]).toEqual({
        field: 'status',
        operator: 'is',
        value: {type: 'enum', value: 'active'},
      });
    });

    it('skips columns with no filter value', () => {
      const filters: TableFilterState = {name: 'alice'};
      const result = toSearchFilters(filters, defaultColumns, searchConfig);
      expect(result).toHaveLength(1);
    });

    it('skips columns with no filter config', () => {
      const filters: TableFilterState = {name: 'alice'};
      const noFilterColumns = [{key: 'name', header: 'Name'}];
      const result = toSearchFilters(filters, noFilterColumns, searchConfig);
      expect(result).toHaveLength(0);
    });

    it('handles integer values', () => {
      const filters: TableFilterState = {age: 30};
      const result = toSearchFilters(filters, defaultColumns, searchConfig);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        field: 'age',
        operator: 'equals',
        value: {type: 'integer', value: 30},
      });
    });

    it('handles enum_list values', () => {
      const filters: TableFilterState = {tags: ['admin', 'user']};
      const result = toSearchFilters(filters, allFilterColumns, searchConfig);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        field: 'tags',
        operator: 'includes',
        value: {type: 'enum_list', value: ['admin', 'user']},
      });
    });
  });

  describe('plugin stability', () => {
    it('returns a referentially stable plugin object', () => {
      const plugins: ReturnType<typeof useTableFiltering>[] = [];

      function Capture() {
        const plugin = useTableFiltering({
          filters: {},
          onFilterChange: () => {},
          searchConfig,
        });
        plugins.push(plugin);
        return null;
      }

      const {rerender} = render(<Capture />);
      rerender(<Capture />);
      expect(plugins[0]).toBe(plugins[1]);
    });

    it('works with no filterable columns', () => {
      const noFilterColumns: TableColumn<TestRow>[] = [
        {key: 'name', header: 'Name'},
        {key: 'status', header: 'Status'},
      ];
      expect(() =>
        render(<FilterTable columns={noFilterColumns} />),
      ).not.toThrow();
    });
  });
  describe('bottom-sheet presentation', () => {
    // The shared adaptive resolver asks one query: the theme's compact
    // definition under a coarse primary pointer. This stub answers it from a
    // flag the tests can flip, telling the resolver's listeners; every other
    // query keeps the setup's desktop answer.
    let isCompactTouch = false;
    const compactTouchListeners = new Set<() => void>();
    const HOVER_CAPABLE = /\(\s*hover\s*:\s*hover\s*\)/;

    function stubCompactTouch(matches: boolean) {
      isCompactTouch = matches;
      vi.stubGlobal('matchMedia', (query: string) => {
        const isCompactTouchQuery = query === COMPACT_TOUCH_PRESENTATION_QUERY;
        return {
          get matches() {
            return isCompactTouchQuery
              ? isCompactTouch
              : HOVER_CAPABLE.test(query);
          },
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: (_type: string, listener: () => void) => {
            if (isCompactTouchQuery) {
              compactTouchListeners.add(listener);
            }
          },
          removeEventListener: (_type: string, listener: () => void) => {
            compactTouchListeners.delete(listener);
          },
          dispatchEvent: () => false,
        };
      });
    }

    function setCompactTouch(matches: boolean) {
      act(() => {
        isCompactTouch = matches;
        for (const listener of [...compactTouchListeners]) {
          listener();
        }
      });
    }

    // jsdom implements neither <dialog> nor the Popover API's top layer.
    beforeEach(() => {
      resetBottomSheetStackForTests();
      compactTouchListeners.clear();
      HTMLDialogElement.prototype.showModal = vi.fn(function (
        this: HTMLDialogElement,
      ) {
        this.setAttribute('open', '');
      });
      HTMLDialogElement.prototype.show = vi.fn(function (
        this: HTMLDialogElement,
      ) {
        this.setAttribute('open', '');
      });
      HTMLDialogElement.prototype.close = vi.fn(function (
        this: HTMLDialogElement,
      ) {
        this.removeAttribute('open');
      });
      HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
        this.setAttribute('open', '');
      });
      HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
        this.removeAttribute('open');
      });
      if (!Element.prototype.setPointerCapture) {
        Element.prototype.setPointerCapture = vi.fn();
        Element.prototype.releasePointerCapture = vi.fn();
      }
      vi.stubGlobal(
        'requestAnimationFrame',
        vi.fn((callback: FrameRequestCallback) => {
          callback(0);
          return 1;
        }),
      );
      vi.stubGlobal('cancelAnimationFrame', vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    async function openSheet(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole('button', {name: /^Filter(,|$)/}));
      return screen.getByRole('dialog', {name: 'Filters'});
    }

    /** Completes the sheet's exit motion, which jsdom never runs. */
    function finishSheetExit() {
      const panel = document.querySelector<HTMLElement>('.astryx-bottom-sheet');
      if (panel == null) {
        throw new Error('sheet panel not found');
      }
      fireEvent.transitionEnd(panel, {propertyName: 'transform'});
    }

    describe('choosing the presentation', () => {
      it('keeps the header controls on a phone by default', () => {
        stubCompactTouch(true);
        render(<FilterTable />);

        expect(
          screen.getByRole('button', {name: 'Filter Name'}),
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', {name: 'Filter'})).toBeNull();
      });

      it('moves the filters behind one Filter button on a phone when adaptive', () => {
        stubCompactTouch(true);
        render(<FilterTable presentation="adaptive" />);

        // The per-column funnel triggers are what a phone cannot use.
        expect(screen.queryByRole('button', {name: 'Filter Name'})).toBeNull();
        expect(
          screen.getByRole('button', {name: 'Filter'}),
        ).toBeInTheDocument();
      });

      it('keeps the header controls when adaptive away from a compact touch screen', () => {
        // A narrow desktop window driven by a mouse is not compact touch.
        stubCompactTouch(false);
        render(<FilterTable presentation="adaptive" />);

        expect(
          screen.getByRole('button', {name: 'Filter Name'}),
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', {name: 'Filter'})).toBeNull();
      });

      it('presents the sheet on every device for presentation="bottom-sheet"', () => {
        stubCompactTouch(false);
        render(<FilterTable presentation="bottom-sheet" variant="inline" />);

        expect(
          screen.getByRole('button', {name: 'Filter'}),
        ).toBeInTheDocument();
        expect(screen.queryByRole('textbox')).toBeNull();
      });

      it('renders the header presentation on the server, even when adaptive', () => {
        stubCompactTouch(true);
        const html = renderToString(<FilterTable presentation="adaptive" />);

        expect(html).toContain('aria-label="Filter Name"');
        expect(html).not.toContain('>Filter<');
      });

      it('follows a change to compact touch while no filter surface is open', () => {
        stubCompactTouch(false);
        render(<FilterTable presentation="adaptive" />);
        expect(
          screen.getByRole('button', {name: 'Filter Name'}),
        ).toBeInTheDocument();

        setCompactTouch(true);

        expect(screen.queryByRole('button', {name: 'Filter Name'})).toBeNull();
        expect(
          screen.getByRole('button', {name: 'Filter'}),
        ).toBeInTheDocument();
      });

      it('renders no Filter button when no column is filterable', () => {
        stubCompactTouch(true);
        render(
          <FilterTable
            presentation="adaptive"
            columns={[
              {key: 'name', header: 'Name'},
              {key: 'status', header: 'Status'},
            ]}
          />,
        );

        expect(screen.queryByRole('button', {name: /^Filter/})).toBeNull();
      });
    });

    describe('the sheet', () => {
      it('gives the sheet one labelled control per filterable column', async () => {
        const user = userEvent.setup();
        stubCompactTouch(true);
        render(
          <FilterTable presentation="adaptive" columns={allFilterColumns} />,
        );

        const sheet = await openSheet(user);
        // Labelled by the column header, not "Filter by Name": the header cell
        // that carried that context is gone.
        expect(within(sheet).getByLabelText('Name')).toBeInTheDocument();
        expect(
          within(sheet).getByRole('spinbutton', {name: 'Age'}),
        ).toBeInTheDocument();
        expect(
          within(sheet).getByRole('radiogroup', {name: 'Status'}),
        ).toBeInTheDocument();
        expect(
          within(sheet).getByRole('group', {name: 'Tags'}),
        ).toBeInTheDocument();
      });

      it('takes its fields from the columns the table rendered', async () => {
        const user = userEvent.setup();
        stubCompactTouch(true);
        // A later plugin drops the Age column from the table.
        const hideAge: TablePlugin<TestRow> = {
          transformColumns: columns => columns.filter(c => c.key !== 'age'),
        };
        render(
          <FilterTable
            presentation="adaptive"
            columns={allFilterColumns}
            extraPlugins={{hideAge}}
          />,
        );

        const sheet = await openSheet(user);
        expect(within(sheet).queryByRole('spinbutton')).toBeNull();
        expect(
          within(sheet).getByRole('radiogroup', {name: 'Status'}),
        ).toBeInTheDocument();
      });

      it('applies a toggle immediately, with no Apply step', async () => {
        const user = userEvent.setup();
        stubCompactTouch(true);
        render(
          <FilterTable presentation="adaptive" columns={allFilterColumns} />,
        );

        const sheet = await openSheet(user);
        expect(within(sheet).queryByRole('button', {name: 'Apply'})).toBeNull();

        await user.click(within(sheet).getByRole('checkbox', {name: 'Admin'}));

        expect(screen.getByTestId('filters')).toHaveTextContent(
          '{"tags":["admin"]}',
        );
      });

      it('counts the active filters on the trigger', async () => {
        const user = userEvent.setup();
        stubCompactTouch(true);
        render(
          <FilterTable presentation="adaptive" columns={allFilterColumns} />,
        );

        const sheet = await openSheet(user);
        await user.click(within(sheet).getByRole('checkbox', {name: 'Admin'}));
        await user.click(within(sheet).getByRole('radio', {name: 'Active'}));

        const trigger = screen.getByRole('button', {name: 'Filter, 2 active'});
        expect(within(trigger).getByText('2')).toBeInTheDocument();
      });

      it('counts and resets a filter on a column the table does not show', async () => {
        const user = userEvent.setup();
        stubCompactTouch(true);
        render(
          <FilterTable
            presentation="adaptive"
            columns={defaultColumns}
            initialFilters={{tags: ['admin']}}
          />,
        );

        // Tags has no column, but its filter still narrows the rows.
        const sheet = await openSheet(user);
        expect(
          screen.getByRole('button', {name: 'Filter, 1 active'}),
        ).toBeInTheDocument();

        await user.click(within(sheet).getByRole('button', {name: 'Reset'}));

        expect(screen.getByTestId('filters')).toHaveTextContent('{}');
        expect(
          screen.getByRole('button', {name: 'Filter'}),
        ).toBeInTheDocument();
      });

      it('keeps a Selector for an enum longer than a list should be', async () => {
        const user = userEvent.setup();
        stubCompactTouch(true);

        const manyValues = Array.from({length: 12}, (_, i) => ({
          value: `v${i}`,
          label: `Value ${i}`,
        }));
        const wideConfig: PowerSearchConfig = {
          name: 'test',
          fields: [
            {
              key: 'status',
              label: 'Status',
              defaultOperator: 'is',
              operators: [
                {
                  key: 'is',
                  label: 'is',
                  value: {type: 'enum', values: manyValues},
                },
              ],
            },
          ],
        };

        function WideEnumTable() {
          const {filters, onFilterChange} = useTableFilterState();
          const plugin = useTableFiltering<TestRow>({
            filters,
            onFilterChange,
            presentation: 'adaptive',
            searchConfig: wideConfig,
          });
          return (
            <Table
              data={testData}
              columns={[{key: 'status', header: 'Status', filter: 'status'}]}
              idKey="id"
              plugins={{filter: plugin}}
            />
          );
        }

        render(<WideEnumTable />);
        const sheet = await openSheet(user);

        expect(within(sheet).queryByRole('radiogroup')).toBeNull();
        expect(
          within(sheet).getByRole('combobox', {name: 'Status'}),
        ).toBeInTheDocument();
      });
    });

    describe('Reset', () => {
      it('clears every filter in one request, with a handler that spreads its snapshot', async () => {
        const user = userEvent.setup();
        stubCompactTouch(true);
        const onFilterChange = vi.fn();

        // A conventional controlled handler: each call spreads the filters it
        // rendered with, so a clear per column would keep all but the last.
        function SnapshotTable() {
          const [filters, setFilters] = useState<TableFilterState>({
            name: 'Al',
            status: 'active',
            tags: ['admin'],
          });
          const plugin = useTableFiltering<TestRow>({
            filters,
            onFilterChange: (key, value) => {
              onFilterChange(key, value);
              setFilters({...filters, [key]: value ?? undefined});
            },
            onClearAll: () => setFilters({}),
            presentation: 'adaptive',
            searchConfig,
          });
          return (
            <>
              <Table
                data={testData}
                columns={allFilterColumns}
                idKey="id"
                plugins={{filter: plugin}}
              />
              <output data-testid="filters">{JSON.stringify(filters)}</output>
            </>
          );
        }

        render(<SnapshotTable />);
        const sheet = await openSheet(user);
        await user.click(within(sheet).getByRole('button', {name: 'Reset'}));

        expect(onFilterChange).not.toHaveBeenCalled();
        expect(screen.getByTestId('filters')).toHaveTextContent('{}');
        expect(
          within(sheet).getByRole('checkbox', {name: 'Admin'}),
        ).not.toBeChecked();
      });

      it("clears everything through useTableFilterState's clearAll", async () => {
        const user = userEvent.setup();
        stubCompactTouch(true);

        function HelperTable() {
          const {filters, onFilterChange, clearAll} = useTableFilterState({
            status: 'active',
            tags: ['admin', 'user'],
          });
          const plugin = useTableFiltering<TestRow>({
            filters,
            onFilterChange,
            onClearAll: clearAll,
            presentation: 'adaptive',
            searchConfig,
          });
          return (
            <Table
              data={testData}
              columns={allFilterColumns}
              idKey="id"
              plugins={{filter: plugin}}
            />
          );
        }

        render(<HelperTable />);
        const sheet = await openSheet(user);
        const reset = within(sheet).getByRole('button', {name: 'Reset'});
        expect(reset).toBeEnabled();

        await user.click(reset);

        expect(reset).toBeDisabled();
        expect(
          screen.getByRole('button', {name: 'Filter'}),
        ).toBeInTheDocument();
      });

      it('is disabled while no filter is set', async () => {
        const user = userEvent.setup();
        stubCompactTouch(true);
        render(<FilterTable presentation="adaptive" />);

        const sheet = await openSheet(user);
        expect(
          within(sheet).getByRole('button', {name: 'Reset'}),
        ).toBeDisabled();
      });

      it('is absent without onClearAll, so nothing clears one column at a time', async () => {
        const user = userEvent.setup();
        stubCompactTouch(true);
        render(<FilterTable presentation="adaptive" hasClearAll={false} />);

        const sheet = await openSheet(user);
        expect(within(sheet).queryByRole('button', {name: 'Reset'})).toBeNull();
      });
    });

    describe('closing', () => {
      it('returns focus to the Filter button after Done, keeping the filters', async () => {
        const user = userEvent.setup();
        stubCompactTouch(true);
        render(
          <FilterTable presentation="adaptive" columns={allFilterColumns} />,
        );

        const sheet = await openSheet(user);
        await user.click(within(sheet).getByRole('checkbox', {name: 'Admin'}));
        await user.click(within(sheet).getByRole('button', {name: 'Done'}));
        finishSheetExit();

        const trigger = screen.getByRole('button', {name: 'Filter, 1 active'});
        expect(document.activeElement).toBe(trigger);
        expect(screen.getByTestId('filters')).toHaveTextContent(
          '{"tags":["admin"]}',
        );
      });

      it('returns focus to the Filter button when the opening tap did not focus it', () => {
        // Safari does not focus a button on a tap, so the sheet cannot rely on
        // the element that was focused when it opened.
        stubCompactTouch(true);
        render(
          <FilterTable presentation="adaptive" columns={allFilterColumns} />,
        );
        const trigger = screen.getByRole('button', {name: 'Filter'});
        expect(document.activeElement).toBe(document.body);

        fireEvent.click(trigger);
        const sheet = screen.getByRole('dialog', {name: 'Filters'});
        fireEvent.click(within(sheet).getByRole('button', {name: 'Done'}));
        finishSheetExit();

        expect(document.activeElement).toBe(trigger);
      });

      it('closes on Escape and returns focus to the Filter button', async () => {
        const user = userEvent.setup();
        stubCompactTouch(true);
        render(
          <FilterTable presentation="adaptive" columns={allFilterColumns} />,
        );

        const sheet = await openSheet(user);
        within(sheet).getByRole('checkbox', {name: 'Admin'}).focus();
        fireEvent.keyDown(sheet, {key: 'Escape'});
        finishSheetExit();

        expect(screen.queryByRole('dialog', {name: 'Filters'})).toBeNull();
        expect(document.activeElement).toBe(
          screen.getByRole('button', {name: 'Filter'}),
        );
      });
    });

    describe('a change of device while a filter surface is open', () => {
      it('keeps an open sheet until it closes, then follows the device', async () => {
        const user = userEvent.setup();
        stubCompactTouch(true);
        render(
          <FilterTable presentation="adaptive" columns={allFilterColumns} />,
        );

        const sheet = await openSheet(user);
        await user.click(within(sheet).getByRole('checkbox', {name: 'Admin'}));

        // A tablet docks a mouse: no longer compact touch.
        setCompactTouch(false);

        expect(screen.getByRole('dialog', {name: 'Filters'})).toBe(sheet);
        expect(
          within(sheet).getByRole('checkbox', {name: 'Admin'}),
        ).toBeChecked();
        expect(screen.queryByRole('button', {name: 'Filter Name'})).toBeNull();

        await user.click(within(sheet).getByRole('button', {name: 'Done'}));

        expect(
          screen.getByRole('button', {name: 'Filter Name'}),
        ).toBeInTheDocument();
        expect(screen.getByTestId('filters')).toHaveTextContent(
          '{"tags":["admin"]}',
        );
      });

      it('keeps an open header popover and its unapplied draft', async () => {
        const user = userEvent.setup();
        stubCompactTouch(false);
        render(<FilterTable presentation="adaptive" />);

        await user.click(screen.getByRole('button', {name: 'Filter Name'}));
        // jsdom has no top layer, so the open surface reads as hidden.
        const popover = screen.getByRole('dialog', {
          name: 'Filter Name',
          hidden: true,
        });
        const draft = within(popover).getByRole('textbox', {
          name: 'Filter Name',
          hidden: true,
        });
        await user.type(draft, 'Al');

        setCompactTouch(true);

        expect(
          screen.getByRole('dialog', {name: 'Filter Name', hidden: true}),
        ).toBe(popover);
        expect(draft).toHaveValue('Al');
        expect(screen.getByTestId('filters')).toHaveTextContent('{}');
        expect(screen.queryByRole('button', {name: 'Filter'})).toBeNull();

        await user.click(
          within(popover).getByRole('button', {name: 'Apply', hidden: true}),
        );

        expect(screen.getByTestId('filters')).toHaveTextContent(
          '{"name":"Al"}',
        );
        expect(
          screen.getByRole('button', {name: 'Filter, 1 active'}),
        ).toBeInTheDocument();
      });
    });
  });
});
