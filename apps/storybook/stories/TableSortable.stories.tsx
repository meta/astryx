// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {
  Table,
  useTableSortable,
  useTableSortableState,
  useTableSelection,
  useTableSelectionState,
} from '@astryxdesign/core/Table';
import type {TableColumn, TableSortState} from '@astryxdesign/core/Table';
import {useCollator} from '@astryxdesign/core';
import {defineTheme, Theme} from '@astryxdesign/core/theme';

// =============================================================================
// Sample Data
// =============================================================================

interface Employee extends Record<string, unknown> {
  id: string;
  name: string;
  email: string;
  role: string;
  age: number;
  isLocked: boolean;
}

const employees: Employee[] = [
  {
    id: '1',
    name: 'Alice',
    email: 'alice@example.com',
    role: 'Engineer',
    age: 32,
    isLocked: false,
  },
  {
    id: '2',
    name: 'Bob',
    email: 'bob@example.com',
    role: 'Designer',
    age: 28,
    isLocked: false,
  },
  {
    id: '3',
    name: 'Charlie',
    email: 'charlie@example.com',
    role: 'Manager',
    age: 45,
    isLocked: false,
  },
  {
    id: '4',
    name: 'Diana',
    email: 'diana@example.com',
    role: 'Engineer',
    age: 37,
    isLocked: true,
  },
  {
    id: '5',
    name: 'Eve',
    email: 'eve@example.com',
    role: 'Admin',
    age: 29,
    isLocked: false,
  },
];

const columns: TableColumn<Employee>[] = [
  {key: 'name', header: 'Name', sortable: true},
  {key: 'email', header: 'Email', sortable: true},
  {key: 'role', header: 'Role', sortable: true},
  {key: 'age', header: 'Age', sortable: true},
];

// =============================================================================
// Stories
// =============================================================================

const meta: Meta = {
  title: 'Core/TableSortable',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

export const SingleSort: Story = {
  render: () => {
    const {sortedData, sort, sortConfig} = useTableSortableState<Employee>({
      data: employees,
      defaultSort: [{sortKey: 'name', direction: 'ascending'}],
    });

    const sortablePlugin = useTableSortable<Employee>(sortConfig);

    return (
      <div style={{maxWidth: 700}}>
        <p
          style={{
            marginBottom: 8,
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}>
          Click a column header to sort. Current:{' '}
          {sort.length > 0 ? `${sort[0].sortKey} ${sort[0].direction}` : 'none'}
        </p>
        <Table
          data={sortedData}
          columns={columns}
          idKey="id"
          plugins={{sortable: sortablePlugin}}
        />
      </div>
    );
  },
};

export const MultiSort: Story = {
  render: () => {
    const {sortedData, sort, sortConfig} = useTableSortableState<Employee>({
      data: employees,
      defaultSort: [{sortKey: 'role', direction: 'ascending'}],
      isMultiSortEnabled: true,
    });

    const sortablePlugin = useTableSortable<Employee>(sortConfig);

    return (
      <div style={{maxWidth: 700}}>
        <p
          style={{
            marginBottom: 8,
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}>
          Shift+click column headers to add secondary sorts. Active sorts:{' '}
          {sort.map(s => `${s.sortKey} (${s.direction})`).join(', ') || 'none'}
        </p>
        <Table
          data={sortedData}
          columns={columns}
          idKey="id"
          plugins={{sortable: sortablePlugin}}
        />
      </div>
    );
  },
};

export const CustomSortKey: Story = {
  render: () => {
    const collator = useCollator();
    const customColumns: TableColumn<Employee>[] = [
      {key: 'name', header: 'Name', sortable: true},
      {key: 'email', header: 'Email', sortable: {sortKey: 'emailSort'}},
      {key: 'role', header: 'Role', sortable: true},
      {key: 'age', header: 'Age', sortable: {sortKey: 'yearsOld'}},
    ];

    const {sortedData, sort, sortConfig} = useTableSortableState<Employee>({
      data: employees,
      defaultSort: [{sortKey: 'yearsOld', direction: 'ascending'}],
      comparators: {
        yearsOld: (a, b) => a.age - b.age,
        emailSort: (a, b) => collator.compare(a.email, b.email),
      },
    });

    const sortablePlugin = useTableSortable<Employee>(sortConfig);

    return (
      <div style={{maxWidth: 700}}>
        <p
          style={{
            marginBottom: 8,
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}>
          Age column uses sortKey &quot;yearsOld&quot;, Email uses
          &quot;emailSort&quot;. Current:{' '}
          {sort.length > 0 ? `${sort[0].sortKey} ${sort[0].direction}` : 'none'}
        </p>
        <Table
          data={sortedData}
          columns={customColumns}
          idKey="id"
          plugins={{sortable: sortablePlugin}}
        />
      </div>
    );
  },
};

export const AllowUnsortedState: Story = {
  render: () => {
    const {sortedData, sort, sortConfig} = useTableSortableState<Employee>({
      data: employees,
      allowUnsortedState: true,
    });

    const sortablePlugin = useTableSortable<Employee>(sortConfig);

    return (
      <div style={{maxWidth: 700}}>
        <p
          style={{
            marginBottom: 8,
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}>
          Cycles: ascending → descending → unsorted. Current:{' '}
          {sort.length > 0
            ? `${sort[0].sortKey} ${sort[0].direction}`
            : 'unsorted'}
        </p>
        <Table
          data={sortedData}
          columns={columns}
          idKey="id"
          plugins={{sortable: sortablePlugin}}
        />
      </div>
    );
  },
};

export const WithSelection: Story = {
  render: () => {
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

    const {sortedData, sort, sortConfig} = useTableSortableState<Employee>({
      data: employees,
      defaultSort: [{sortKey: 'name', direction: 'ascending'}],
    });

    const sortablePlugin = useTableSortable<Employee>(sortConfig);

    const {selectionConfig} = useTableSelectionState<Employee>({
      data: sortedData,
      idKey: 'id',
      selectedKeys,
      setSelectedKeys,
    });
    const selectionPlugin = useTableSelection<Employee>(selectionConfig);

    return (
      <div style={{maxWidth: 700}}>
        <p
          style={{
            marginBottom: 8,
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}>
          Sorting + Selection composed together. Selected: {selectedKeys.size}{' '}
          of {employees.length}. Sort:{' '}
          {sort.length > 0 ? `${sort[0].sortKey} ${sort[0].direction}` : 'none'}
        </p>
        <Table
          data={sortedData}
          columns={columns}
          idKey="id"
          plugins={{sortable: sortablePlugin, selection: selectionPlugin}}
        />
      </div>
    );
  },
};

export const Controlled: Story = {
  render: () => {
    const [sort, setSort] = useState<TableSortState>([
      {sortKey: 'age', direction: 'descending'},
    ]);

    const {sortedData, sortConfig} = useTableSortableState<Employee>({
      data: employees,
      sort,
      onSortChange: setSort,
    });

    const sortablePlugin = useTableSortable<Employee>(sortConfig);

    return (
      <div style={{maxWidth: 700}}>
        <p
          style={{
            marginBottom: 8,
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}>
          Controlled mode — external state. Current:{' '}
          {sort.length > 0 ? `${sort[0].sortKey} ${sort[0].direction}` : 'none'}
        </p>
        <div style={{display: 'flex', gap: 8, marginBottom: 8}}>
          <button
            onClick={() =>
              setSort([{sortKey: 'name', direction: 'ascending'}])
            }>
            Sort by Name ↑
          </button>
          <button
            onClick={() =>
              setSort([{sortKey: 'age', direction: 'descending'}])
            }>
            Sort by Age ↓
          </button>
          <button onClick={() => setSort([])}>Clear Sort</button>
        </div>
        <Table
          data={sortedData}
          columns={columns}
          idKey="id"
          plugins={{sortable: sortablePlugin}}
        />
      </div>
    );
  },
};

const largeIndicatorTheme = defineTheme({
  name: 'story-large-sort-indicator',
  componentIcons: {'table-sort-indicator': {size: 'lg'}},
});

const hiddenIndicatorTheme = defineTheme({
  name: 'story-hidden-sort-indicator',
  componentIcons: {'table-sort-indicator': null},
});

/**
 * The same sorted table with the default indicator, with a theme that asks
 * the `table-sort-indicator` slot for a large glyph, and with a theme that
 * hides it. The large glyph grows while the Sort control and the header row
 * keep their height; the hidden glyph leaves no gap beside the label.
 */
export const IndicatorSlotSize: Story = {
  render: () => {
    const sort: TableSortState = [{sortKey: 'name', direction: 'ascending'}];
    const sortPlugin = useTableSortable<Employee>({
      sort,
      onSortChange: () => {},
    });
    return (
      <div style={{display: 'grid', gap: 24}}>
        <div data-testid="default-indicator">
          <Table
            data={employees}
            columns={columns}
            plugins={{sort: sortPlugin}}
          />
        </div>
        <Theme theme={largeIndicatorTheme}>
          <div data-testid="large-indicator">
            <Table
              data={employees}
              columns={columns}
              plugins={{sort: sortPlugin}}
            />
          </div>
        </Theme>
        <Theme theme={hiddenIndicatorTheme}>
          <div data-testid="hidden-indicator">
            <Table
              data={employees}
              columns={columns}
              plugins={{sort: sortPlugin}}
            />
          </div>
        </Theme>
      </div>
    );
  },
};
