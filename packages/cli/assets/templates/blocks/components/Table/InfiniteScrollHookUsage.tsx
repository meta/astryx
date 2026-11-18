// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Table, useTableInfiniteScroll} from '@astryxdesign/core/Table';

const products = Array.from({length: 20}, (_, index) => ({
  id: `product-${index}`,
  name: `Product ${index + 1}`,
}));
const columns = [{key: 'name', header: 'Product'}];

export default function InfiniteScrollHookUsage() {
  const [data, setData] = useState(products.slice(0, 4));
  const [isLoading, setIsLoading] = useState(false);
  const loading = useTableInfiniteScroll({
    hasMore: data.length < products.length,
    isLoading,
    onLoadMore: async () => {
      setIsLoading(true);
      try {
        const nextBatch = await Promise.resolve(
          products.slice(data.length, data.length + 4),
        );
        setData(previous => [...previous, ...nextBatch]);
      } finally {
        setIsLoading(false);
      }
    },
  });
  return <Table data={data} columns={columns} idKey="id" plugins={{loading}} />;
}
