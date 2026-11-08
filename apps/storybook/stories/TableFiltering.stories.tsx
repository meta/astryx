// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {
  Table,
  useTableFiltering,
  useTableFilterState,
  useTableSelection,
  useTableSelectionState,
  useTableSortable,
  useTableSortableState,
  useTableColumnResize,
  toSearchFilters,
} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';
import {usePowerSearchConfig} from '@astryxdesign/core/PowerSearch';
import {EmptyState as EmptyStateComponent} from '@astryxdesign/core/EmptyState';
import type {PowerSearchFilter} from '@astryxdesign/core/PowerSearch';

interface Employee extends Record<string, unknown> {
  name: string;
  email: string;
  role: string;
  department: readonly string[];
  level: number;
}

const employees: Employee[] = [
  {
    name: 'Alice',
    email: 'alice@example.com',
    role: 'Engineer',
    department: ['Platform'],
    level: 5,
  },
  {
    name: 'Bob',
    email: 'bob@example.com',
    role: 'Designer',
    department: ['Product'],
    level: 4,
  },
  {
    name: 'Charlie',
    email: 'charlie@example.com',
    role: 'Manager',
    department: ['Platform'],
    level: 6,
  },
  {
    name: 'Diana',
    email: 'diana@example.com',
    role: 'Engineer',
    department: ['Infrastructure'],
    level: 5,
  },
  {
    name: 'Eve',
    email: 'eve@example.com',
    role: 'Admin',
    department: ['Operations'],
    level: 3,
  },
];

const fieldDefs = [
  {key: 'name', type: 'string', label: 'Name'},
  {key: 'email', type: 'string', label: 'Email'},
  {
    key: 'role',
    type: 'enum',
    label: 'Role',
    enumValues: [
      {value: 'Engineer', label: 'Engineer'},
      {value: 'Designer', label: 'Designer'},
      {value: 'Manager', label: 'Manager'},
      {value: 'Admin', label: 'Admin'},
    ],
  },
  {
    key: 'department',
    type: 'enum_list',
    label: 'Department',
    enumValues: [
      {value: 'Platform', label: 'Platform'},
      {value: 'Product', label: 'Product'},
      {value: 'Infrastructure', label: 'Infrastructure'},
      {value: 'Operations', label: 'Operations'},
    ],
  },
  {key: 'level', type: 'number', label: 'Level'},
] as const;

const meta: Meta = {
  title: 'Core/TableFiltering',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

export const TextFilter: Story = {
  render: () => {
    const {config, applyFilters} = usePowerSearchConfig(fieldDefs);
    const {filters, onFilterChange} = useTableFilterState();
    const columns: TableColumn<Employee>[] = [
      {key: 'name', header: 'Name', filter: 'name'},
      {key: 'email', header: 'Email', filter: 'email'},
      {key: 'role', header: 'Role'},
      {key: 'department', header: 'Department'},
    ];
    const filterPlugin = useTableFiltering<Employee>({
      filters,
      onFilterChange,
      searchConfig: config,
    });
    const data = applyFilters(
      toSearchFilters(filters, columns, config) as PowerSearchFilter[],
      employees,
    );
    return (
      <div style={{maxWidth: 800}}>
        <p
          style={{
            marginBottom: 8,
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}>
          Showing {data.length}/{employees.length} rows.
        </p>
        <Table
          data={data}
          columns={columns}
          idKey="name"
          plugins={{filter: filterPlugin}}
        />
      </div>
    );
  },
};

export const SelectorFilter: Story = {
  render: () => {
    const {config, applyFilters} = usePowerSearchConfig(fieldDefs);
    const {filters, onFilterChange} = useTableFilterState();
    const columns: TableColumn<Employee>[] = [
      {key: 'name', header: 'Name'},
      {key: 'role', header: 'Role', filter: 'role'},
      {key: 'department', header: 'Department'},
      {key: 'level', header: 'Level'},
    ];
    const filterPlugin = useTableFiltering<Employee>({
      filters,
      onFilterChange,
      searchConfig: config,
    });
    const data = applyFilters(
      toSearchFilters(filters, columns, config) as PowerSearchFilter[],
      employees,
    );
    return (
      <div style={{maxWidth: 800}}>
        <p
          style={{
            marginBottom: 8,
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}>
          Enum → selector. Showing {data.length}/{employees.length} rows.
        </p>
        <Table
          data={data}
          columns={columns}
          idKey="name"
          plugins={{filter: filterPlugin}}
        />
      </div>
    );
  },
};

export const MultiSelectorFilter: Story = {
  render: () => {
    const {config, applyFilters} = usePowerSearchConfig(fieldDefs);
    const {filters, onFilterChange} = useTableFilterState();
    const columns: TableColumn<Employee>[] = [
      {key: 'name', header: 'Name'},
      {key: 'role', header: 'Role'},
      {key: 'department', header: 'Department', filter: 'department'},
      {key: 'level', header: 'Level'},
    ];
    const filterPlugin = useTableFiltering<Employee>({
      filters,
      onFilterChange,
      searchConfig: config,
    });
    const data = applyFilters(
      toSearchFilters(filters, columns, config) as PowerSearchFilter[],
      employees,
    );
    return (
      <div style={{maxWidth: 800}}>
        <p
          style={{
            marginBottom: 8,
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}>
          Enum list → multi-selector. Showing {data.length}/{employees.length}{' '}
          rows.
        </p>
        <Table
          data={data}
          columns={columns}
          idKey="name"
          plugins={{filter: filterPlugin}}
        />
      </div>
    );
  },
};

export const NumberFilter: Story = {
  render: () => {
    const {config, applyFilters} = usePowerSearchConfig(fieldDefs);
    const {filters, onFilterChange} = useTableFilterState();
    const columns: TableColumn<Employee>[] = [
      {key: 'name', header: 'Name'},
      {key: 'role', header: 'Role'},
      {key: 'level', header: 'Level', filter: 'level'},
      {key: 'department', header: 'Department'},
    ];
    const filterPlugin = useTableFiltering<Employee>({
      filters,
      onFilterChange,
      searchConfig: config,
    });
    const data = applyFilters(
      toSearchFilters(filters, columns, config) as PowerSearchFilter[],
      employees,
    );
    return (
      <div style={{maxWidth: 800}}>
        <p
          style={{
            marginBottom: 8,
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}>
          Number field → numeric input. Showing {data.length}/{employees.length}{' '}
          rows.
        </p>
        <Table
          data={data}
          columns={columns}
          idKey="name"
          plugins={{filter: filterPlugin}}
        />
      </div>
    );
  },
};

export const InlineVariant: Story = {
  render: () => {
    const {config, applyFilters} = usePowerSearchConfig(fieldDefs);
    const {filters, onFilterChange} = useTableFilterState();
    const columns: TableColumn<Employee>[] = [
      {key: 'name', header: 'Name', filter: 'name'},
      {key: 'role', header: 'Role', filter: 'role'},
      {key: 'level', header: 'Level', filter: 'level'},
      {key: 'department', header: 'Department'},
    ];
    const filterPlugin = useTableFiltering<Employee>({
      filters,
      onFilterChange,
      variant: 'inline',
      searchConfig: config,
    });
    const data = applyFilters(
      toSearchFilters(filters, columns, config) as PowerSearchFilter[],
      employees,
    );
    return (
      <div style={{maxWidth: 800}}>
        <p
          style={{
            marginBottom: 8,
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}>
          Inline variant. Showing {data.length}/{employees.length} rows.
        </p>
        <Table
          data={data}
          columns={columns}
          idKey="name"
          plugins={{filter: filterPlugin}}
        />
      </div>
    );
  },
};

export const WithSelection: Story = {
  render: () => {
    const {config, applyFilters} = usePowerSearchConfig(fieldDefs);
    const {filters, onFilterChange} = useTableFilterState();
    const [selectedKeys, setSelectedKeys] = useState(new Set<string>());
    const columns: TableColumn<Employee>[] = [
      {key: 'name', header: 'Name', filter: 'name'},
      {key: 'role', header: 'Role', filter: 'role'},
      {key: 'department', header: 'Department', filter: 'department'},
      {key: 'level', header: 'Level'},
    ];
    const filterPlugin = useTableFiltering<Employee>({
      filters,
      onFilterChange,
      searchConfig: config,
    });
    const data = applyFilters(
      toSearchFilters(filters, columns, config) as PowerSearchFilter[],
      employees,
    );
    const {selectionConfig} = useTableSelectionState({
      data,
      idKey: 'name',
      selectedKeys,
      setSelectedKeys,
    });
    const selectionPlugin = useTableSelection<Employee>(selectionConfig);
    return (
      <div style={{maxWidth: 800}}>
        <p
          style={{
            marginBottom: 8,
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}>
          Filtering + Selection. Selected: {selectedKeys.size} | Showing{' '}
          {data.length}/{employees.length} rows.
        </p>
        <Table
          data={data}
          columns={columns}
          idKey="name"
          plugins={{selection: selectionPlugin, filter: filterPlugin}}
        />
      </div>
    );
  },
};

export const WithSorting: Story = {
  render: () => {
    const {config, applyFilters} = usePowerSearchConfig(fieldDefs);
    const {filters, onFilterChange} = useTableFilterState();
    const {
      sortedData: _unused,
      sort: _sort,
      sortConfig,
      applySort,
    } = useTableSortableState<Employee>({
      data: employees,
    });
    const columns: TableColumn<Employee>[] = [
      {key: 'name', header: 'Name', sortable: true, filter: 'name'},
      {key: 'role', header: 'Role', sortable: true, filter: 'role'},
      {key: 'level', header: 'Level', sortable: true, filter: 'level'},
      {key: 'department', header: 'Department'},
    ];
    const filterPlugin = useTableFiltering<Employee>({
      filters,
      onFilterChange,
      searchConfig: config,
    });
    const sortPlugin = useTableSortable<Employee>(sortConfig);
    const filtered = applyFilters(
      toSearchFilters(filters, columns, config) as PowerSearchFilter[],
      employees,
    );
    const data = applySort(filtered);
    return (
      <div style={{maxWidth: 800}}>
        <p
          style={{
            marginBottom: 8,
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}>
          Filtering + Sorting. Showing {data.length}/{employees.length} rows.
        </p>
        <Table
          data={data}
          columns={columns}
          idKey="name"
          plugins={{sort: sortPlugin, filter: filterPlugin}}
        />
      </div>
    );
  },
};

export const WithResize: Story = {
  render: () => {
    const {config, applyFilters} = usePowerSearchConfig(fieldDefs);
    const {filters, onFilterChange} = useTableFilterState();
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>(
      {},
    );
    const columns: TableColumn<Employee>[] = [
      {key: 'name', header: 'Name', filter: 'name'},
      {key: 'role', header: 'Role', filter: 'role'},
      {key: 'level', header: 'Level', filter: 'level'},
      {key: 'department', header: 'Department'},
    ];
    const filterPlugin = useTableFiltering<Employee>({
      filters,
      onFilterChange,
      variant: 'inline',
      searchConfig: config,
    });
    const resizePlugin = useTableColumnResize<Employee>({
      columnWidths,
      onColumnResizeEnd: updates =>
        setColumnWidths(prev => ({...prev, ...updates})),
      columns: columns as TableColumn<Record<string, unknown>>[],
    });
    const data = applyFilters(
      toSearchFilters(filters, columns, config) as PowerSearchFilter[],
      employees,
    );
    return (
      <div style={{maxWidth: 800}}>
        <p
          style={{
            marginBottom: 8,
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}>
          Inline filtering + Resize. Showing {data.length}/{employees.length}{' '}
          rows.
        </p>
        <Table
          data={data}
          columns={columns}
          idKey="name"
          plugins={{filter: filterPlugin, resize: resizePlugin}}
        />
      </div>
    );
  },
};

export const WithAllPlugins: Story = {
  render: () => {
    const {config, applyFilters} = usePowerSearchConfig(fieldDefs);
    const {filters, onFilterChange} = useTableFilterState();
    const {sortConfig, applySort} = useTableSortableState<Employee>({
      data: employees,
    });
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>(
      {},
    );
    const [selectedKeys, setSelectedKeys] = useState(new Set<string>());
    const columns: TableColumn<Employee>[] = [
      {key: 'name', header: 'Name', sortable: true, filter: 'name'},
      {key: 'role', header: 'Role', sortable: true, filter: 'role'},
      {key: 'level', header: 'Level', sortable: true, filter: 'level'},
      {key: 'department', header: 'Department', sortable: true},
    ];
    const filterPlugin = useTableFiltering<Employee>({
      filters,
      onFilterChange,
      searchConfig: config,
    });
    const sortPlugin = useTableSortable<Employee>(sortConfig);
    const resizePlugin = useTableColumnResize<Employee>({
      columnWidths,
      onColumnResizeEnd: updates =>
        setColumnWidths(prev => ({...prev, ...updates})),
      columns: columns as TableColumn<Record<string, unknown>>[],
    });
    const filtered = applyFilters(
      toSearchFilters(filters, columns, config) as PowerSearchFilter[],
      employees,
    );
    const data = applySort(filtered);
    const {selectionConfig} = useTableSelectionState({
      data,
      idKey: 'name',
      selectedKeys,
      setSelectedKeys,
    });
    const selectionPlugin = useTableSelection<Employee>(selectionConfig);
    return (
      <div style={{maxWidth: 900}}>
        <p
          style={{
            marginBottom: 8,
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}>
          All plugins. Selected: {selectedKeys.size} | Showing {data.length}/
          {employees.length} rows.
        </p>
        <Table
          data={data}
          columns={columns}
          idKey="name"
          plugins={{
            selection: selectionPlugin,
            sort: sortPlugin,
            filter: filterPlugin,
            resize: resizePlugin,
          }}
        />
      </div>
    );
  },
};

export const InlineWithClear: Story = {
  render: () => {
    const {config, applyFilters} = usePowerSearchConfig(fieldDefs);
    const {filters, onFilterChange} = useTableFilterState();
    const columns: TableColumn<Employee>[] = [
      {key: 'name', header: 'Name', filter: 'name'},
      {key: 'role', header: 'Role', filter: 'role'},
      {key: 'level', header: 'Level', filter: 'level'},
      {key: 'department', header: 'Department'},
    ];
    const filterPlugin = useTableFiltering<Employee>({
      filters,
      onFilterChange,
      variant: 'inline',
      searchConfig: config,
    });
    const data = applyFilters(
      toSearchFilters(filters, columns, config) as PowerSearchFilter[],
      employees,
    );
    return (
      <div style={{maxWidth: 800}}>
        <p
          style={{
            marginBottom: 8,
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}>
          Inline variant with clear buttons. Type to filter, then click ✕ to
          clear. Showing {data.length}/{employees.length} rows.
        </p>
        <Table
          data={data}
          columns={columns}
          idKey="name"
          plugins={{filter: filterPlugin}}
        />
      </div>
    );
  },
};

export const EmptyState: Story = {
  render: () => {
    const {config, applyFilters} = usePowerSearchConfig(fieldDefs);
    const {filters, onFilterChange} = useTableFilterState();
    const columns: TableColumn<Employee>[] = [
      {key: 'name', header: 'Name', filter: 'name'},
      {key: 'role', header: 'Role', filter: 'role'},
      {key: 'level', header: 'Level', filter: 'level'},
      {key: 'department', header: 'Department'},
    ];
    const filterPlugin = useTableFiltering<Employee>({
      filters,
      onFilterChange,
      variant: 'inline',
      searchConfig: config,
    });
    const data = applyFilters(
      toSearchFilters(filters, columns, config) as PowerSearchFilter[],
      employees,
    );
    return (
      <div style={{maxWidth: 800}}>
        <p
          style={{
            marginBottom: 8,
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}>
          Try filtering to get zero results; empty state appears.
        </p>
        <Table
          data={data}
          columns={columns}
          idKey="name"
          plugins={{filter: filterPlugin}}
          emptyState={
            <EmptyStateComponent
              title="No results"
              description="Try adjusting your filters to find what you're looking for."
              isCompact
            />
          }
        />
      </div>
    );
  },
};
