// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {act, render, screen, within} from '@testing-library/react';
import {useState} from 'react';
import {vi} from 'vitest';
import {useTableRowsVirtualization} from '../virtualization/useTableRowsVirtualization';
import {Table} from '../../Table';
import type {TableColumn, TablePlugin} from '../../types';
import {useTableRowIndex} from './useTableRowIndex';

interface Row extends Record<string, unknown> {
  id: string;
  name: string;
}

const data: Row[] = [
  {id: 'a', name: 'Alice'},
  {id: 'b', name: 'Bob'},
  {id: 'c', name: 'Carol'},
];

const columns: TableColumn<Row>[] = [{key: 'name', header: 'Name'}];

function Harness({
  rows = data,
  label,
  startFrom,
  useKey = false,
}: {
  rows?: Row[];
  label?: string;
  startFrom?: number;
  useKey?: boolean;
}) {
  const rowIndex = useTableRowIndex<Row>({
    data: rows,
    label,
    startFrom,
    getRowKey: useKey ? item => item.id : undefined,
  });
  return (
    <Table data={rows} columns={columns} idKey="id" plugins={{rowIndex}} />
  );
}

function ContextHarness({rows = data}: {rows?: Row[]}) {
  const rowIndex = useTableRowIndex<Row>();
  return (
    <Table data={rows} columns={columns} idKey="id" plugins={{rowIndex}} />
  );
}

describe('useTableRowIndex', () => {
  it('numbers from a passed data array, not from row positions', () => {
    // The table shows Bob and Carol; the caller's data orders the numbers.
    function Subset() {
      const rowIndex = useTableRowIndex<Row>({data});
      return (
        <Table
          data={[data[1], data[2]]}
          columns={columns}
          idKey="id"
          plugins={{rowIndex}}
        />
      );
    }
    render(<Subset />);
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('2')).toBeInTheDocument();
    expect(within(rows[2]).getByText('3')).toBeInTheDocument();
  });

  it('numbers rows from the row context without data, and renumbers after a re-sort', () => {
    const {rerender} = render(<ContextHarness />);
    let rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('1')).toBeInTheDocument();
    expect(within(rows[3]).getByText('3')).toBeInTheDocument();

    rerender(<ContextHarness rows={[data[2], data[0], data[1]]} />);
    rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Carol')).toBeInTheDocument();
    expect(within(rows[1]).getByText('1')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Alice')).toBeInTheDocument();
    expect(within(rows[2]).getByText('2')).toBeInTheDocument();
  });

  it('falls back instead of clipping a measured windowed number without changing legacy column widths', () => {
    const rows = Array.from({length: 20}, (_, index) => ({
      id: String(index),
      name: `Product ${index}`,
    }));
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(320);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(48);
    const createRange = document.createRange.bind(document);
    vi.spyOn(document, 'createRange').mockImplementation(() => {
      const range = createRange();
      Object.defineProperty(range, 'getBoundingClientRect', {
        value: () => ({
          width: 53,
          height: 16,
          top: 0,
          bottom: 16,
          left: 0,
          right: 53,
          x: 0,
          y: 0,
          toJSON() {
            return {};
          },
        }),
      });
      return range;
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        return {
          height: this.localName === 'tbody' ? rows.length * 56 : 0,
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON() {
            return {};
          },
        };
      },
    );
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    function Fixture() {
      const rowIndex = useTableRowIndex({data: rows});
      const virtualization = useTableRowsVirtualization({
        rowHeight: 56,
        viewportHeight: 320,
      });
      return (
        <Table
          data={rows}
          columns={columns}
          idKey="id"
          plugins={{rowIndex}}
          virtualization={virtualization}
        />
      );
    }
    try {
      const {container} = render(<Fixture />);
      expect(container.querySelectorAll('tbody > tr')).toHaveLength(
        rows.length,
      );
      expect(container.querySelector('[data-table-logical-index]')).toBeNull();
      expect(screen.getByRole('columnheader', {name: '#'}).style.width).toBe(
        '48px',
      );
      expect(warning).toHaveBeenCalledWith(
        expect.stringContaining('row-number content exceeds'),
      );
    } finally {
      vi.restoreAllMocks();
    }
  });
  it('numbers windowed rows from Table positions after same-array append without consulting a second key lookup', () => {
    const rows: Row[] = data.map(item => ({...item}));
    const getRowKey = vi.fn((item: Row) => item.id);
    function Windowed() {
      const rowIndex = useTableRowIndex({data: rows, getRowKey});
      const virtualization = useTableRowsVirtualization({
        rowHeight: 56,
        viewportHeight: 320,
      });
      return (
        <Table
          data={rows}
          columns={columns}
          idKey="id"
          virtualization={virtualization}
          plugins={{rowIndex}}
        />
      );
    }
    const view = render(<Windowed />);
    rows.push({id: 'd', name: 'Dora'});
    view.rerender(<Windowed />);
    const appended = screen
      .getByText('Dora')
      .closest('tr') as HTMLTableRowElement;
    expect(appended).toHaveAttribute('aria-rowindex', '5');
    expect(appended.cells[0]).toHaveTextContent('4');
    expect(getRowKey).not.toHaveBeenCalled();
    rows.reverse();
    view.rerender(<Windowed />);
    const reordered = screen
      .getByText('Dora')
      .closest('tr') as HTMLTableRowElement;
    expect(reordered).toHaveAttribute('aria-rowindex', '2');
    expect(reordered.cells[0]).toHaveTextContent('1');
  });

  it('prepends a header cell with the default label', () => {
    render(<Harness />);
    const headers = screen.getAllByRole('columnheader');
    // First column is the index column.
    expect(within(headers[0]).getByText('#')).toBeInTheDocument();
  });

  it('numbers rows 1..n by default', () => {
    render(<Harness />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('respects startFrom', () => {
    render(<Harness startFrom={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.queryByText('3')).not.toBeInTheDocument();
  });

  it('supports a custom label', () => {
    render(<Harness label="Row" />);
    const headers = screen.getAllByRole('columnheader');
    expect(within(headers[0]).getByText('Row')).toBeInTheDocument();
  });

  it('numbers a single row', () => {
    render(<Harness rows={[{id: 'a', name: 'Alice'}]} />);
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('1')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Alice')).toBeInTheDocument();
  });

  it('renders the index header with empty data and no row numbers', () => {
    render(<Harness rows={[]} />);
    const headers = screen.getAllByRole('columnheader');
    expect(within(headers[0]).getByText('#')).toBeInTheDocument();
    // No body rows → no ordinals.
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('renumbers when the data order changes (reference path)', () => {
    const {rerender} = render(<Harness rows={data} />);
    let rows = screen.getAllByRole('row');
    // rows[0] is the header row.
    expect(within(rows[1]).getByText('Alice')).toBeInTheDocument();
    expect(within(rows[1]).getByText('1')).toBeInTheDocument();

    // Reorder: Carol, Alice, Bob (same object identities, new order).
    rerender(<Harness rows={[data[2], data[0], data[1]]} />);
    rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Carol')).toBeInTheDocument();
    expect(within(rows[1]).getByText('1')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Alice')).toBeInTheDocument();
    expect(within(rows[2]).getByText('2')).toBeInTheDocument();
  });

  it('renumbers when the data order changes (keyed path)', () => {
    // With getRowKey provided, the keyed lookup must still produce ordinals in
    // the new order. If the keyed branch were broken it would return undefined
    // and render no numbers — so this fails for the right reason.
    const {rerender} = render(<Harness rows={data} useKey />);
    let rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Alice')).toBeInTheDocument();
    expect(within(rows[1]).getByText('1')).toBeInTheDocument();

    rerender(<Harness rows={[data[1], data[2], data[0]]} useKey />);
    rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Bob')).toBeInTheDocument();
    expect(within(rows[1]).getByText('1')).toBeInTheDocument();
    expect(within(rows[3]).getByText('Alice')).toBeInTheDocument();
    expect(within(rows[3]).getByText('3')).toBeInTheDocument();
  });

  it('keyed path resolves ordinals across fresh object identities', () => {
    // Simulates a re-fetch: brand-new objects with the same ids. Keyed lookup
    // must map them correctly.
    const fresh: Row[] = [
      {id: 'a', name: 'Alice'},
      {id: 'b', name: 'Bob'},
    ];
    render(<Harness rows={fresh} useKey />);
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('1')).toBeInTheDocument();
    expect(within(rows[2]).getByText('2')).toBeInTheDocument();
  });

  it('keeps unchanged rows from re-rendering when the parent re-renders', () => {
    let cellTransforms = 0;
    const audit: TablePlugin<Row> = {
      rowModel: 'flat',
      transformBodyCell(props) {
        cellTransforms++;
        return props;
      },
    };
    let rerender: () => void = () => {};
    function Parent() {
      const [, setTick] = useState(0);
      rerender = () => setTick(value => value + 1);
      const rowIndex = useTableRowIndex<Row>();
      return (
        <Table
          data={data}
          columns={columns}
          idKey="id"
          plugins={{rowIndex, audit}}
        />
      );
    }
    render(<Parent />);
    const afterMount = cellTransforms;
    expect(afterMount).toBeGreaterThan(0);
    act(() => rerender());
    expect(cellTransforms).toBe(afterMount);
  });
});
