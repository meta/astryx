// Copyright (c) Meta Platforms, Inc. and affiliates.
import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {Table, useTableInfiniteScroll} from '@astryxdesign/core';
const rows = Array.from({length: 20}, (_, index) => ({
  id: String(index),
  name: `Product ${index + 1}`,
}));
const meta: Meta = {
  title: 'Core/Table infinite loading',
  component: Table,
};
export default meta;
function Example() {
  const [data, setData] = useState(rows.slice(0, 4));
  const [isLoading, setIsLoading] = useState(false);
  const loading = useTableInfiniteScroll({
    hasMore: data.length < 20,
    isLoading,
    onLoadMore: async () => {
      setIsLoading(true);
      await new Promise(resolve => setTimeout(resolve, 400));
      setData(previous => rows.slice(0, previous.length + 4));
      setIsLoading(false);
    },
  });
  return (
    <Table
      data={data}
      columns={[{key: 'name', header: 'Product'}]}
      idKey="id"
      plugins={{loading}}
    />
  );
}
export const ManualAndAutomaticLoading: StoryObj = {
  render: () => <Example />,
};
