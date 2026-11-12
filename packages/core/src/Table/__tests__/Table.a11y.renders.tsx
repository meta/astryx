// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/** Stable Table renders shared by jsdom, Storybook, and Chromium. */

import {useState, type ReactElement} from 'react';
import {useTableSortable, type TableSortState} from '../plugins/sortable';
import {Table} from '../Table';
import {TableBody} from '../TableBody';
import {TableCell} from '../TableCell';
import {TableHeader} from '../TableHeader';
import {TableHeaderCell} from '../TableHeaderCell';
import {TableRow} from '../TableRow';
import type {TableColumn} from '../types';
import type {TableA11yRow} from './Table.a11y.states';

type Member = {name: string; role: string; location: string};

const MEMBERS: Member[] = [
  {name: 'Ada', role: 'Engineer', location: 'London'},
  {name: 'Grace', role: 'Admiral', location: 'Arlington'},
];

const COLUMNS: TableColumn<Member>[] = [
  {key: 'name', header: 'Name'},
  {key: 'role', header: 'Role'},
  {key: 'location', header: 'Location'},
];

const SORTABLE_COLUMNS: TableColumn<Member>[] = COLUMNS.map(column => ({
  ...column,
  sortable: true,
}));

// useTableSortable only exposes the sort state; the caller orders the data.
// Rows follow the state so the exposed aria-sort always matches the rows.
function sortMembers(members: Member[], sort: TableSortState): Member[] {
  const [primary] = sort;
  if (primary == null) {
    return members;
  }
  const key = primary.sortKey as keyof Member;
  const sign = primary.direction === 'descending' ? -1 : 1;
  return [...members].sort(
    (a, b) => sign * (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0),
  );
}

function SortedTable(): ReactElement {
  const [sort, setSort] = useState<TableSortState>([
    {sortKey: 'name', direction: 'descending'},
  ]);
  const sortPlugin = useTableSortable<Member>({sort, onSortChange: setSort});
  return (
    <Table<Member>
      data-a11y-table
      aria-label="Team members"
      columns={SORTABLE_COLUMNS}
      data={sortMembers(MEMBERS, sort)}
      plugins={{sort: sortPlugin}}
    />
  );
}

export const TABLE_A11Y_RENDERS: Readonly<
  Record<TableA11yRow['id'], () => ReactElement>
> = {
  'data-columns': () => (
    <Table<Member>
      data-a11y-table
      aria-label="Team members"
      columns={COLUMNS}
      data={MEMBERS}
    />
  ),
  'sorted-descending': () => <SortedTable />,
  'children-row-headers-rtl': () => (
    <div dir="rtl">
      <h2 id="a11y-table-quarterly-heading">Quarterly totals</h2>
      <Table data-a11y-table aria-labelledby="a11y-table-quarterly-heading">
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Region</TableHeaderCell>
            <TableHeaderCell>Q1</TableHeaderCell>
            <TableHeaderCell>Q2</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableHeaderCell scope="row">North</TableHeaderCell>
            <TableCell>120</TableCell>
            <TableCell>135</TableCell>
          </TableRow>
          <TableRow>
            <TableHeaderCell scope="row">South</TableHeaderCell>
            <TableCell>98</TableCell>
            <TableCell>104</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  ),
  'empty-data': () => (
    <Table<Member>
      data-a11y-table
      aria-label="Team members"
      columns={COLUMNS}
      data={[]}
    />
  ),
};
