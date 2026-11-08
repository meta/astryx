// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTableFiltering.test.tsx
 * @input useTableFiltering, Table, React testing utilities
 * @output Functional tests for the filtering plugin
 * @position Test file; validates filter rendering, interaction, and accessibility
 */

import {describe, it, expect} from 'vitest';
import {useState} from 'react';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Table} from '../../Table';
import {useTableFiltering, toSearchFilters} from './useTableFiltering';
import type {
  TableFilterState,
  TableFilterVariant,
  TableFilterValue,
} from './useTableFiltering';
import type {PowerSearchConfig} from '../../../PowerSearch/types';
import type {TableColumn} from '../../types';

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

function FilterTable({
  columns = defaultColumns,
  variant = 'popover' as TableFilterVariant,
}) {
  const [filters, setFilters] = useState<TableFilterState>({});

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
    variant,
    searchConfig,
  });

  return (
    <>
      <Table
        data={testData}
        columns={columns}
        idKey="id"
        plugins={{filter: filterPlugin}}
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
});
