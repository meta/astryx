// Copyright (c) Meta Platforms, Inc. and affiliates.
/** Regression: legacy data-size changes must not repaint unchanged Table rows. */
import {render, screen, cleanup} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Table} from './Table';
import {useTableSelection} from './plugins/selection/useTableSelection';
import {useTableStickyColumns} from './plugins/stickyColumns/useTableStickyColumns';
import {useTableRowExpansion} from './plugins/rowExpansion/useTableRowExpansion';
import {pixel} from './columnUtils';
import type {
  TableColumn,
  BodyRowRenderProps,
  BodyCellRenderProps,
  TableRowContext,
} from './types';
interface Item extends Record<string, unknown> {
  id: string;
  name: string;
}
afterEach(cleanup);
describe('legacy Table incremental render cost', () => {
  it.each(['expansion', 'custom-row', 'custom-cell'] as const)(
    'preserves append cost for legacy %s plugins that do not read context',
    kind => {
      const renderCell = vi.fn((item: Item) => item.name);
      const columns: TableColumn<Item>[] = [
        {key: 'name', header: 'Name', renderCell},
      ];
      const items: Item[] = Array.from({length: 200}, (_, i) => ({
        id: String(i),
        name: `Item ${i}`,
      }));
      const expandedKeys = new Set<string>();
      const onToggle = () => {};
      const getRowKey = (item: Item) => item.id;
      const renderExpanded = () => null;
      const custom =
        kind === 'custom-row'
          ? {transformBodyRow: (props: BodyRowRenderProps) => props}
          : {
              transformBodyCell: (props: BodyCellRenderProps) => props,
            };
      function Fixture({data}: {data: Item[]}) {
        const expansion = useTableRowExpansion<Item>({
          expandedKeys,
          onToggle,
          getRowKey,
          renderExpanded,
        });
        return (
          <Table
            data={data}
            columns={columns}
            idKey="id"
            plugins={kind === 'expansion' ? {expansion} : {custom}}
          />
        );
      }
      const view = render(<Fixture data={items} />);
      renderCell.mockClear();
      const appended = {id: '200', name: 'Item 200'};
      view.rerender(<Fixture data={[...items, appended]} />);
      expect(renderCell.mock.calls).toEqual([[appended]]);
      renderCell.mockClear();
      view.rerender(<Fixture data={items} />);
      expect(renderCell).not.toHaveBeenCalled();
    },
  );
  it('tracks cell-level render totals without imposing count reads on other plugins', () => {
    const totals: number[] = [];
    const plugin = {
      transformBodyCell(
        props: BodyCellRenderProps,
        _col: TableColumn<Item>,
        _item: Item,
        _index: number,
        _columns: ReadonlyArray<TableColumn<Item>>,
        context?: TableRowContext,
      ) {
        totals.push(context?.render.logicalRowCount ?? -1);
        return props;
      },
    };
    const columns: TableColumn<Item>[] = [{key: 'name', header: 'Name'}];
    const data = [{id: 'a', name: 'A'}];
    const view = render(
      <Table data={data} columns={columns} plugins={{plugin}} />,
    );
    totals.length = 0;
    view.rerender(
      <Table
        data={[...data, {id: 'b', name: 'B'}]}
        columns={columns}
        plugins={{plugin}}
      />,
    );
    expect(totals).toEqual([2, 2]);
  });
  it.each([true, false])(
    'keeps logical totals fresh for a custom transform (flat declared=%s)',
    isFlat => {
      const counts: number[] = [];
      const plugin = {
        rowModel: isFlat ? ('flat' as const) : undefined,
        transformBodyRow(
          props: BodyRowRenderProps,
          _item: Item,
          _index: number,
          context?: TableRowContext,
        ) {
          counts.push(context?.logicalRowCount ?? -1);
          return props;
        },
      };
      const data = [{id: 'a', name: 'A'}];
      const columns: TableColumn<Item>[] = [{key: 'name', header: 'Name'}];
      const view = render(
        <Table
          data={data}
          columns={columns}
          idKey="id"
          plugins={{custom: plugin}}
        />,
      );
      counts.length = 0;
      view.rerender(
        <Table
          data={[...data, {id: 'b', name: 'B'}]}
          columns={columns}
          idKey="id"
          plugins={{custom: plugin}}
        />,
      );
      expect(counts).toEqual([2, 2]);
    },
  );
  it.each(['selection', 'sticky', 'combined'] as const)(
    'keeps existing %s rows unchanged on append and tail removal',
    kind => {
      const renderCell = vi.fn((item: Item) => item.name);
      const columns: TableColumn<Item>[] = [
        {key: 'name', header: 'Name', renderCell, width: pixel(200)},
      ];
      const items: Item[] = Array.from({length: 200}, (_, i) => ({
        id: String(i),
        name: `Item ${i}`,
      }));
      function Fixture({data}: {data: Item[]}) {
        const selection = useTableSelection<Item>({
          getIsItemSelected: () => false,
          onSelectItem: () => {},
          onSelectAll: () => {},
          getIsAllSelected: () => false,
          getRowLabel: item => item.name,
        });
        const sticky = useTableStickyColumns<Item>({startKeys: ['name']});
        return (
          <Table
            data={data}
            columns={columns}
            idKey="id"
            plugins={
              kind === 'selection'
                ? {selection}
                : kind === 'sticky'
                  ? {sticky}
                  : {selection, sticky}
            }
          />
        );
      }
      const view = render(<Fixture data={items} />);
      renderCell.mockClear();
      const appended = {id: '200', name: 'Item 200'};
      view.rerender(<Fixture data={[...items, appended]} />);
      expect(renderCell.mock.calls).toEqual([[appended]]);
      renderCell.mockClear();
      view.rerender(<Fixture data={items} />);
      expect(renderCell).not.toHaveBeenCalled();
    },
  );
  it('renders only the appended item, and no preceding item when the tail is removed', () => {
    const renderCell = vi.fn((item: Item) => item.name);
    const columns: TableColumn<Item>[] = [
      {key: 'name', header: 'Name', renderCell},
    ];
    const items: Item[] = Array.from({length: 200}, (_, i) => ({
      id: String(i),
      name: `Item ${i}`,
    }));
    const view = render(<Table data={items} columns={columns} idKey="id" />);
    renderCell.mockClear();
    const appended = {id: '200', name: 'Item 200'};
    view.rerender(
      <Table data={[...items, appended]} columns={columns} idKey="id" />,
    );
    expect(renderCell.mock.calls).toEqual([[appended]]);
    expect(screen.getByText('Item 200')).toBeInTheDocument();
    renderCell.mockClear();
    view.rerender(<Table data={items} columns={columns} idKey="id" />);
    expect(renderCell).not.toHaveBeenCalled();
    expect(screen.queryByText('Item 200')).not.toBeInTheDocument();
  });
  it('updates logical indices consumed by cells after a keyed re-sort', () => {
    const data: Item[] = [
      {id: 'a', name: 'A'},
      {id: 'b', name: 'B'},
    ];
    const columns: TableColumn<Item>[] = [{key: 'name', header: 'Name'}];
    const plugin = {
      rowModel: 'flat' as const,
      transformBodyCell(
        props: BodyCellRenderProps,
        _column: TableColumn<Item>,
        _item: Item,
        _index: number,
        _columns: ReadonlyArray<TableColumn<Item>>,
        context?: TableRowContext,
      ) {
        return {
          ...props,
          htmlProps: {
            ...props.htmlProps,
            'data-logical-index': context?.logicalIndex,
          },
        };
      },
    };
    const view = render(
      <Table data={data} columns={columns} idKey="id" plugins={{plugin}} />,
    );
    expect(screen.getByText('A').closest('td')).toHaveAttribute(
      'data-logical-index',
      '0',
    );
    view.rerender(
      <Table
        data={[data[1], data[0]]}
        columns={columns}
        idKey="id"
        plugins={{plugin}}
      />,
    );
    expect(screen.getByText('A').closest('td')).toHaveAttribute(
      'data-logical-index',
      '1',
    );
    expect(screen.getByText('B').closest('td')).toHaveAttribute(
      'data-logical-index',
      '0',
    );
  });
  it('moves keyed rows without repainting when cells do not read logical indices', () => {
    const renderCell = vi.fn((item: Item) => item.name);
    const columns: TableColumn<Item>[] = [
      {key: 'name', header: 'Name', renderCell},
    ];
    const data: Item[] = [
      {id: 'a', name: 'A'},
      {id: 'b', name: 'B'},
    ];
    const view = render(<Table data={data} columns={columns} idKey="id" />);
    renderCell.mockClear();
    view.rerender(
      <Table data={[data[1], data[0]]} columns={columns} idKey="id" />,
    );
    expect(renderCell).not.toHaveBeenCalled();
    expect(screen.getAllByRole('cell').map(cell => cell.textContent)).toEqual([
      'B',
      'A',
    ]);
  });
});
