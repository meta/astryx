// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {VStack} from '@astryxdesign/core/Layout';
import {
  Table,
  useTableSortable,
  useTableSortableState,
} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';

interface Order extends Record<string, unknown> {
  id: string;
  customer: string;
  total: number;
}

const orders: Order[] = [
  {id: '1042', customer: 'Chen', total: 85},
  {id: '1043', customer: 'Ana', total: 120},
  {id: '1044', customer: 'Ben', total: 40},
  {id: '1045', customer: 'Ana', total: 35},
  {id: '1046', customer: 'Chen', total: 15},
  {id: '1047', customer: 'Ben', total: 210},
  {id: '1048', customer: 'Ana', total: 60},
];

const columns: TableColumn<Order>[] = [
  {key: 'id', header: 'Order'},
  {key: 'customer', header: 'Customer', sortable: true},
  {key: 'total', header: 'Total ($)', sortable: true, align: 'end'},
];

export default function UseTableSortableStateHookUsage() {
  const {sortedData, sort, sortConfig} = useTableSortableState<Order>({
    data: orders,
    isMultiSortEnabled: true,
  });
  const sortablePlugin = useTableSortable<Order>(sortConfig);

  return (
    <VStack gap={3}>
      <Text type="supporting" color="secondary">
        Sorted by:{' '}
        {sort.length === 0
          ? 'none'
          : sort
              .map(({sortKey, direction}) => `${sortKey} ${direction}`)
              .join(', then ')}
      </Text>
      <Table
        data={sortedData}
        columns={columns}
        idKey="id"
        plugins={{sortable: sortablePlugin}}
      />
    </VStack>
  );
}
