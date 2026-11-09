// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  Table,
  useTableRowsVirtualization,
  type TableColumn,
} from '@astryxdesign/core/Table';
import {VStack} from '@astryxdesign/core/Layout';

interface Product extends Record<string, unknown> {
  id: string;
  name: string;
}

const products: Product[] = Array.from({length: 1000}, (_, index) => ({
  id: `product-${index}`,
  name: `Product ${index + 1}`,
}));
const columns: TableColumn<Product>[] = [{key: 'name', header: 'Product'}];

export default function RowsVirtualizationHookUsage() {
  const virtualization = useTableRowsVirtualization({
    rowHeight: 56,
    initialViewportHeight: 320,
  });
  // The Table scrolls inside the height its parent gives it;
  // initialViewportHeight only sizes the first window.
  return (
    <VStack height={320}>
      <Table
        data={products}
        columns={columns}
        idKey="id"
        virtualization={virtualization}
      />
    </VStack>
  );
}
