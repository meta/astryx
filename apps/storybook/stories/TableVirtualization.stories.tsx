// Copyright (c) Meta Platforms, Inc. and affiliates.
import type {Meta, StoryObj} from '@storybook/react-vite';
import {Table, useTableRowsVirtualization} from '@astryxdesign/core';
const rows = Array.from({length: 2000}, (_, index) => ({
  id: String(index),
  name: `Product ${index + 1}`,
  status: 'Available',
}));
const meta: Meta = {
  title: 'Core/Table virtualization',
  component: Table,
};
export default meta;
function Example() {
  const virtualization = useTableRowsVirtualization({
    rowHeight: 56,
    viewportHeight: 320,
  });
  return (
    <Table
      data={rows}
      columns={[
        {key: 'name', header: 'Product'},
        {key: 'status', header: 'Status'},
      ]}
      idKey="id"
      virtualization={virtualization}
      dividers="grid"
      isStriped
    />
  );
}
export const FixedHeightWindowing: StoryObj = {
  render: () => <Example />,
};
