// Copyright (c) Meta Platforms, Inc. and affiliates.
import {describe, expect, it} from 'vitest';
import {
  registerFixedHeightColumn,
  withLogicalPositionWidths,
} from './tableColumnAdmission';
import type {TableColumn} from './types';

type Row = {id: string};

function numbered(): TableColumn<Row> {
  const column: TableColumn<Row> = {
    key: 'number',
    header: '#',
    width: {type: 'pixel', value: 48},
    renderCell: () => null,
  };
  registerFixedHeightColumn(column, true, index => index + 1);
  return column;
}

describe('logical-position column widths', () => {
  it('keeps the columns array when no width is measured or every width fits', () => {
    const columns = [numbered(), {key: 'name', header: 'Name'}];
    expect(withLogicalPositionWidths(columns, new Map())).toBe(columns);
    expect(withLogicalPositionWidths(columns, new Map([[0, 40]]))).toBe(
      columns,
    );
  });

  it('widens a logical-position column to its measured width', () => {
    const columns = [numbered(), {key: 'name', header: 'Name'}];
    const sized = withLogicalPositionWidths(columns, new Map([[0, 61]]));
    expect(sized).not.toBe(columns);
    expect(sized[1]).toBe(columns[1]);
    expect(sized[0]).toMatchObject({
      key: 'number',
      width: {type: 'pixel', value: 61},
    });
  });

  it('leaves columns that render no logical position unchanged', () => {
    const plain: TableColumn<Row> = {key: 'id', header: 'ID'};
    registerFixedHeightColumn(plain);
    const columns = [plain];
    expect(withLogicalPositionWidths(columns, new Map([[0, 200]]))).toBe(
      columns,
    );
  });
});
