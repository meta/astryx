// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file InfinityTableShowcase.tsx
 * @input A generated archive indexed by row and column
 * @output A native Table with bounded two-axis scrolling and jump controls
 * @position Lab showcase for the Table Infinity plugin
 */
import {Button} from '@astryxdesign/core/Button';
import {HStack, VStack} from '@astryxdesign/core/Stack';
import {Table, type TableColumn} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {useTableInfinityVirtualization} from '@astryxdesign/lab';

const ROWS = 1_000_000_000;
const COLUMNS = 1_000_000;
type Row = {id: number};
const getRow = (index: number): Row => ({id: index});
const getColumn = (index: number): TableColumn<Row> => ({
  key: String(index),
  header: `Column ${index + 1}`,
  renderCell: row => `R${row.id + 1} C${index + 1}`,
});

export default function InfinityTableShowcase({
  direction,
}: {
  direction?: 'ltr' | 'rtl';
}) {
  const {tableProps, scrollToCell} = useTableInfinityVirtualization({
    rowCount: ROWS,
    columnCount: COLUMNS,
    rowHeight: 32,
    columnWidth: 184,
    viewportHeight: 320,
    viewportWidth: 552,
    headerHeight: 36,
    direction,
    viewportLabel: 'Table viewport',
    rowScrollbarLabel: 'Scroll rows',
    columnScrollbarLabel: 'Scroll columns',
    getRow,
    getColumn,
  });
  return (
    <VStack gap={3}>
      <Text>One billion rows and one million columns.</Text>
      <HStack gap={2}>
        <Button
          label="First"
          variant="secondary"
          onClick={() => scrollToCell(0, 0)}
        />
        <Button
          label="Middle"
          variant="secondary"
          onClick={() => scrollToCell(ROWS / 2, COLUMNS / 2)}
        />
        <Button
          label="Last"
          variant="secondary"
          onClick={() => scrollToCell(ROWS - 1, COLUMNS - 1)}
        />
      </HStack>
      <Table {...tableProps} idKey="id" aria-label="Archive table" />
    </VStack>
  );
}
