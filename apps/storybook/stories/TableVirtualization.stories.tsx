// Copyright (c) Meta Platforms, Inc. and affiliates.
import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {
  Button,
  Card,
  HStack,
  Table,
  VStack,
  pixel,
  useTableColumnsVirtualization,
  useTableRowIndex,
  useTableRowsVirtualization,
  useTableSelection,
  useTableSelectionState,
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

function ColumnWindowingFocusExample() {
  const virtualization = useTableColumnsVirtualization({
    initialViewportWidth: 900,
  });
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const {selectionConfig} = useTableSelectionState<WideRow>({
    data: wideRows,
    idKey: 'id',
    selectedKeys,
    setSelectedKeys,
  });
  const selection = useTableSelection<WideRow>(selectionConfig);
  const [columns, setColumns] = useState(wideColumns);
  // A focused checkbox stays mounted while its column scrolls away, and
  // column changes keep the first visible column in place.
  return (
    <VStack width={900} gap={2}>
      <HStack gap={2}>
        <Button
          label="Widen the first 40 columns"
          variant="secondary"
          onClick={() =>
            setColumns(current =>
              current.map((column, index) =>
                index < 40 ? {...column, width: pixel(200)} : column,
              ),
            )
          }>
          Widen the first 40 columns
        </Button>
        <Button
          label="Move the first column to the end"
          variant="secondary"
          onClick={() =>
            setColumns(current => [...current.slice(1), current[0]])
          }>
          Move the first column to the end
        </Button>
      </HStack>
      <Table
        aria-label="Selectable account metrics"
        data={wideRows}
        columns={columns}
        idKey="id"
        plugins={{selection}}
        virtualization={virtualization}
        dividers="grid"
      />
    </VStack>
  );
}
export const ColumnWindowingFocus: StoryObj = {
  render: () => <ColumnWindowingFocusExample />,
};

// Each row computes its metric values on read, so 10,000 rows of 300
// columns stay cheap to create.
class LargeRow {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly position: number,
  ) {}
}
for (let index = 1; index < 300; index++) {
  Object.defineProperty(LargeRow.prototype, `metric${index}`, {
    get(this: LargeRow) {
      return `${this.position + 1}.${index}`;
    },
  });
}
const largeRows = Array.from(
  {length: 10000},
  (_, row) =>
    new LargeRow(String(row), `Account ${row + 1}`, row) as unknown as WideRow,
);

function RowsAndColumnsExample() {
  const rowsVirtualization = useTableRowsVirtualization({
    rowHeight: 56,
    initialViewportHeight: 480,
  });
  const columnsVirtualization = useTableColumnsVirtualization({
    initialViewportWidth: 900,
  });
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const {selectionConfig} = useTableSelectionState<WideRow>({
    data: largeRows,
    idKey: 'id',
    selectedKeys,
    setSelectedKeys,
  });
  const selection = useTableSelection<WideRow>(selectionConfig);
  const rowIndex = useTableRowIndex<WideRow>();
  const sticky = useTableStickyColumns<WideRow>({endKeys: ['metric299']});
  // 10,000 rows and 300 columns: only the cells near the viewport mount.
  return (
    <VStack width={900} height={480}>
      <Table
        aria-label="Account metrics by row"
        data={largeRows}
        columns={wideColumns}
        idKey="id"
        plugins={{selection, rowIndex, sticky}}
        virtualization={[rowsVirtualization, columnsVirtualization]}
        dividers="grid"
      />
    </VStack>
  );
}
export const RowsAndColumnsWindowing: StoryObj = {
  render: () => <RowsAndColumnsExample />,
};
