// Copyright (c) Meta Platforms, Inc. and affiliates.

import {act, fireEvent, render, screen, within} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {Table, pixel, type TableColumn} from '@astryxdesign/core/Table';
import {useTableInfinityVirtualization} from './useTableInfinityVirtualization';

type Row = {id: number};
const getRow = (index: number): Row => ({id: index});
const getColumn = (index: number): TableColumn<Row> => ({
  key: String(index),
  width: pixel(112),
  header: `Column ${index + 1}`,
  renderCell: row => `R${row.id + 1} C${index + 1}`,
});
const geometry = {
  rowCount: 1_000_000_000,
  columnCount: 1_000_000,
  rowHeight: 32,
  columnWidth: 112,
  viewportHeight: 320,
  viewportWidth: 448,
  headerHeight: 36,
};

function Fixture({direction = 'ltr'}: {direction?: 'rtl' | 'ltr'}) {
  const infinity = useTableInfinityVirtualization({
    ...geometry,
    direction,
    viewportLabel: 'Table viewport',
    rowScrollbarLabel: 'Scroll rows',
    columnScrollbarLabel: 'Scroll columns',
    getRow,
    getColumn,
  });
  return (
    <>
      <button onClick={() => infinity.scrollToCell(500_000_000, 500_000)}>
        Middle
      </button>
      <Table {...infinity.tableProps} idKey="id" aria-label="Archive" />
    </>
  );
}

function frame() {
  act(() => vi.advanceTimersToNextFrame());
}

function verifyCell(row: number, column: number) {
  const table = screen.getByRole('table', {name: 'Archive'});
  const cell = within(table).getByText(`R${row} C${column}`).closest('td');
  expect(cell).toHaveAttribute('aria-colindex', String(column));
  expect(cell?.parentElement).toHaveAttribute('aria-rowindex', String(row + 1));
}

describe('Table Infinity window', () => {
  it('mounts a bounded native table and replaces both ranges in one frame', () => {
    vi.useFakeTimers();
    try {
      render(<Fixture />);
      const table = screen.getByRole('table', {name: 'Archive'});
      expect(table).toHaveAttribute('aria-rowcount', '1000000001');
      expect(table).toHaveAttribute('aria-colcount', '1000000');
      verifyCell(1, 1);
      fireEvent.click(screen.getByRole('button', {name: 'Middle'}));
      frame();
      verifyCell(500_000_001, 500_001);
      expect(table.querySelectorAll('tbody td').length).toBeLessThanOrEqual(
        247,
      );

      const viewport = screen.getByRole('group', {name: 'Table viewport'});
      const anchor = within(table).getByText('R500000001 C500001');
      expect(fireEvent.wheel(viewport, {deltaX: 1.25, deltaY: 2.5})).toBe(
        false,
      );
      frame();
      expect(within(table).getByText('R500000001 C500001')).toBe(anchor);
      expect(table.style.translate).toBe('-449.25px 0px');
      expect(table.querySelector('tbody')?.style.translate).toBe(
        '0px -130.5px',
      );
      expect(
        fireEvent.wheel(viewport!, {deltaX: 800, deltaY: 600, ctrlKey: true}),
      ).toBe(true);
      frame();
      expect(table.style.translate).toBe('-449.25px 0px');
      fireEvent.wheel(viewport!, {deltaX: 1_120, deltaY: 640});
      frame();
      verifyCell(500_000_021, 500_011);
    } finally {
      vi.useRealTimers();
    }
  });

  it('moves the inline scrollbar logically in RTL and keeps axes independent', () => {
    vi.useFakeTimers();
    try {
      render(<Fixture direction="rtl" />);
      const bar = screen.getByRole('scrollbar', {name: 'Scroll columns'});
      fireEvent.keyDown(bar, {key: 'ArrowLeft'});
      frame();
      expect(bar).toHaveAttribute('aria-valuenow', '1');
      const table = screen.getByRole('table', {name: 'Archive'});
      expect(table.style.translate).toBe('112px 0px');
      expect(
        screen.getByRole('scrollbar', {name: 'Scroll rows'}),
      ).toHaveAttribute('aria-valuenow', '0');
    } finally {
      vi.useRealTimers();
    }
  });
});
