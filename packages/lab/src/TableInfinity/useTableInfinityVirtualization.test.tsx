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

function Fixture({
  direction,
  viewportHeight = geometry.viewportHeight,
  rowCount = geometry.rowCount,
}: {
  direction?: 'rtl' | 'ltr';
  viewportHeight?: number;
  rowCount?: number;
}) {
  const infinity = useTableInfinityVirtualization({
    ...geometry,
    viewportHeight,
    rowCount,
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

  it('inherits the document direction unless an explicit direction is supplied', () => {
    const {rerender} = render(
      <div dir="rtl" aria-label="RTL host">
        <Fixture />
      </div>,
    );
    const host = screen.getByLabelText('RTL host');
    const viewport = screen.getByRole('group', {name: 'Table viewport'});
    expect(viewport.closest('[dir]')).toBe(host);

    rerender(
      <div dir="rtl" aria-label="RTL host">
        <Fixture direction="ltr" />
      </div>,
    );
    expect(viewport.closest('[dir]')).not.toBe(host);
    expect(viewport.closest('[dir]')).toHaveAttribute('dir', 'ltr');
  });

  it('uses the new direction after the host changes without remounting', async () => {
    const computedStyle = window.getComputedStyle.bind(window);
    // The DOM test environment does not compute inherited direction.
    const directionStyle = vi
      .spyOn(window, 'getComputedStyle')
      .mockImplementation((node, pseudo) => {
        const style = computedStyle(node, pseudo);
        if (style.direction !== '') {
          return style;
        }
        Object.defineProperty(style, 'direction', {
          value: node.matches(':dir(rtl)') ? 'rtl' : 'ltr',
        });
        return style;
      });
    vi.useFakeTimers();
    try {
      const {rerender} = render(
        <div dir="ltr" style={{direction: 'ltr'}}>
          <Fixture />
        </div>,
      );
      const scrollbar = screen.getByRole('scrollbar', {name: 'Scroll columns'});
      rerender(
        <div dir="rtl" style={{direction: 'rtl'}}>
          <Fixture />
        </div>,
      );
      await act(async () => {});
      expect(screen.getByRole('scrollbar', {name: 'Scroll columns'})).toBe(
        scrollbar,
      );
      fireEvent.keyDown(scrollbar, {key: 'ArrowLeft'});
      frame();
      expect(scrollbar).toHaveAttribute('aria-valuenow', '1');
      fireEvent.wheel(screen.getByRole('group', {name: 'Table viewport'}), {
        deltaX: -112,
      });
      frame();
      expect(scrollbar).toHaveAttribute('aria-valuenow', '2');
      expect(screen.getByRole('table', {name: 'Archive'}).style.translate).toBe(
        '224px 0px',
      );
    } finally {
      vi.useRealTimers();
      directionStyle.mockRestore();
    }
  });

  it('announces the full range of a partially overflowing row', () => {
    vi.useFakeTimers();
    try {
      render(<Fixture rowCount={10} viewportHeight={310} />);
      const scrollbar = screen.getByRole('scrollbar', {name: 'Scroll rows'});
      expect(scrollbar).toHaveAttribute('aria-valuemin', '0');
      expect(Number(scrollbar.getAttribute('aria-valuemax'))).toBeGreaterThan(
        0,
      );
      expect(scrollbar).toHaveAttribute('aria-valuenow', '0');
      fireEvent.keyDown(scrollbar, {key: 'End'});
      frame();
      expect(scrollbar.getAttribute('aria-valuenow')).toBe(
        scrollbar.getAttribute('aria-valuemax'),
      );
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
