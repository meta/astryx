// Copyright (c) Meta Platforms, Inc. and affiliates.
import type {Meta, StoryObj} from '@storybook/react-vite';
import {
  Card,
  Table,
  VStack,
  useTableRowsVirtualization,
} from '@astryxdesign/core';
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
    initialViewportHeight: 320,
  });
  // The Table scrolls inside the height its parent gives it.
  return (
    <VStack height={320}>
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
    </VStack>
  );
}
export const FixedHeightWindowing: StoryObj = {
  render: () => <Example />,
};

function InCard() {
  const virtualization = useTableRowsVirtualization({
    rowHeight: 56,
    initialViewportHeight: 400,
  });
  // A 400px Card is the Table's parent; the Table bleeds to its edges.
  return (
    <Card height={400}>
      <Table
        data={rows}
        columns={[
          {key: 'name', header: 'Product'},
          {key: 'status', header: 'Status'},
        ]}
        idKey="id"
        virtualization={virtualization}
      />
    </Card>
  );
}
export const InSizedCard: StoryObj = {
  render: () => <InCard />,
};

function FallbackInCard() {
  const virtualization = useTableRowsVirtualization({
    rowHeight: 56,
    initialViewportHeight: 400,
  });
  // Wrapped text is not fixed-height, so the Table renders every row, inside
  // the Card's 400px instead of past it.
  return (
    <Card height={400}>
      <Table
        data={rows}
        columns={[
          {key: 'name', header: 'Product'},
          {key: 'status', header: 'Status'},
        ]}
        idKey="id"
        virtualization={virtualization}
        textOverflow="wrap"
      />
    </Card>
  );
}
export const FallbackInSizedCard: StoryObj = {
  render: () => <FallbackInCard />,
};
