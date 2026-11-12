// Copyright (c) Meta Platforms, Inc. and affiliates.
import type {Meta, StoryObj} from '@storybook/react-vite';
import {
  Card,
  Table,
  VStack,
  pixel,
  useTableColumnsVirtualization,
  useTableRowsVirtualization,
  useTableStickyColumns,
  type TableColumn,
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

type WideRow = Record<string, string> & {id: string};
const wideColumns: TableColumn<WideRow>[] = [
  {key: 'name', header: 'Name', width: pixel(160)},
  ...Array.from({length: 299}, (_, index) => ({
    key: `metric${index + 1}`,
    header: `Metric ${index + 1}`,
    width: pixel(120),
  })),
];
const wideRows: WideRow[] = Array.from({length: 200}, (_, row) => {
  const item: WideRow = {id: String(row), name: `Account ${row + 1}`};
  for (let index = 1; index < 300; index++) {
    item[`metric${index}`] = `${row + 1}.${index}`;
  }
  return item;
});

function ColumnWindowingExample() {
  const virtualization = useTableColumnsVirtualization({
    initialViewportWidth: 900,
  });
  const sticky = useTableStickyColumns<WideRow>({startKeys: ['name']});
  // 300 columns and 200 rows: only the columns near the viewport mount.
  return (
    <VStack width={900}>
      <Table
        aria-label="Account metrics"
        data={wideRows}
        columns={wideColumns}
        idKey="id"
        plugins={{sticky}}
        virtualization={virtualization}
        dividers="grid"
      />
    </VStack>
  );
}
export const ColumnWindowing: StoryObj = {
  render: () => <ColumnWindowingExample />,
};
