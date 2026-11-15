// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useMemo, useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {
  Table,
  useTableRowIndex,
  useTablePagination,
  useTableSortable,
  useTableSortableState,
  proportional,
  pixel,
} from '@astryxdesign/core/Table';
import type {TableColumn, TableSortState} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/Layout';

// =============================================================================
// Sample Data
// =============================================================================

interface Track extends Record<string, unknown> {
  id: string;
  title: string;
  artist: string;
  plays: number;
}

const tracks: Track[] = [
  {id: 't1', title: 'Nightfall', artist: 'Ava Chen', plays: 1820},
  {id: 't2', title: 'Ember', artist: 'Liam Park', plays: 942},
  {id: 't3', title: 'Tidal', artist: 'Zoe Vega', plays: 3310},
  {id: 't4', title: 'Cinder', artist: 'Max Ross', plays: 604},
  {id: 't5', title: 'Halcyon', artist: 'Mia Cole', plays: 2075},
];

const columns: TableColumn<Track>[] = [
  {key: 'title', header: 'Title', width: proportional(2)},
  {key: 'artist', header: 'Artist', width: proportional(2)},
  {
    key: 'plays',
    header: 'Plays',
    width: pixel(90),
    align: 'end',
    sortable: true,
  },
];

const meta: Meta = {
  title: 'Core/TableRowIndex',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

/**
 * A monospaced, right-aligned row-number column is prepended to the table.
 * Numbering follows the rendered data order and starts at 1 by default.
 */
export const Default: Story = {
  render: () => {
    const rowIndex = useTableRowIndex<Track>();
    return (
      <Table
        data={tracks}
        columns={columns}
        idKey="id"
        hasHover
        plugins={{rowIndex}}
      />
    );
  },
};

/**
 * Customize the header `label` and the `startFrom` offset (e.g. 0-based).
 */
export const CustomLabelAndStart: Story = {
  render: () => {
    const rowIndex = useTableRowIndex<Track>({
      label: 'No.',
      startFrom: 0,
    });
    return (
      <Table
        data={tracks}
        columns={columns}
        idKey="id"
        hasHover
        plugins={{rowIndex}}
      />
    );
  },
};

/**
 * The index reflects the current view: Table gives each row its position, so
 * numbering renumbers as the sort order changes. Sort by Plays to see rows
 * renumber 1..n in the new order.
 */
export const RenumbersWithSort: Story = {
  render: () => {
    const [sort, setSort] = useState<TableSortState>([
      {sortKey: 'plays', direction: 'descending'},
    ]);
    const {sortedData, sortConfig} = useTableSortableState<Track>({
      data: tracks,
      sort,
      onSortChange: setSort,
    });
    const sortPlugin = useTableSortable<Track>(sortConfig);
    const rowIndex = useTableRowIndex<Track>();
    const plugins = useMemo(
      () => ({rowIndex, sort: sortPlugin}),
      [rowIndex, sortPlugin],
    );
    return (
      <Table
        data={sortedData}
        columns={columns}
        idKey="id"
        hasHover
        plugins={plugins}
      />
    );
  },
};

// =============================================================================
// Table-level ARIA row index (#3939)
// =============================================================================

interface Contact extends Record<string, unknown> {
  id: string;
  name: string;
  city: string;
}

const contacts: Contact[] = Array.from({length: 42}, (_, i) => ({
  id: `c${i + 1}`,
  name: `Contact ${i + 1}`,
  city: ['Lisbon', 'Tokyo', 'Oslo', 'Cairo'][i % 4],
}));

const contactColumns: TableColumn<Contact>[] = [
  {key: 'name', header: 'Name', width: proportional(2)},
  {key: 'city', header: 'City', width: proportional(1)},
];

/**
 * The row ordinal is an accessibility concern, not just a visible column. Pass
 * `rowCount` (and, for a windowed view, `rowIndexStart`) to emit `aria-rowindex`
 * on every `<tr>` and `aria-rowcount` on the `<table>`, correct even when no
 * visible `#` column is rendered. Inspect the DOM: rows carry `aria-rowindex`
 * with no index column in sight.
 */
export const AriaRowIndexNoVisibleColumn: Story = {
  render: () => (
    <VStack gap={2}>
      <Text type="body">
        No visible index column, but each row still exposes aria-rowindex, and
        the table exposes aria-rowcount. Inspect the DOM to verify.
      </Text>
      <Table
        data={contacts.slice(0, 5)}
        columns={contactColumns}
        idKey="id"
        rowCount={contacts.length}
      />
    </VStack>
  ),
};

/**
 * With pagination, `aria-rowindex` must reflect the row's position in the
 * **full** dataset, not the current page. Pass `rowIndexStart` as the offset of
 * the first visible row (`(page - 1) * pageSize + 1`) and `rowCount` as the
 * total. On page 3 below, the first row announces as row 21 of 42. The visible
 * `useTableRowIndex` numbering is seeded from the same offset so both agree.
 */
export const AriaRowIndexWithPagination: Story = {
  render: () => {
    const pageSize = 10;
    const [page, setPage] = useState(3);
    const start = (page - 1) * pageSize;
    const pageData = contacts.slice(start, start + pageSize);

    const pagination = useTablePagination<Contact>({
      page,
      onPageChange: setPage,
      totalItems: contacts.length,
      pageSize,
    });
    const rowIndex = useTableRowIndex<Contact>({
      data: pageData,
      getRowKey: item => item.id,
      startFrom: start + 1,
    });
    const plugins = useMemo(
      () => ({rowIndex, pagination}),
      [rowIndex, pagination],
    );

    return (
      <Table
        data={pageData}
        columns={contactColumns}
        idKey="id"
        hasHover
        rowIndexStart={start + 1}
        rowCount={contacts.length}
        plugins={plugins}
      />
    );
  },
};
