// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import {Table} from './Table';
import type {
  TableColumn,
  TablePlugin,
  TableRenderContext,
  TableRowContext,
} from './types';

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

describe('Table transform context (FR17, FR20)', () => {
  it('passes each body row and cell transform an immutable row context', () => {
    const rowContexts: TableRowContext[] = [];
    const cellContexts: TableRowContext[] = [];
    const plugin: TablePlugin<Row> = {
      rowModel: 'flat',
      transformBodyRow(props, _item, _index, context) {
        if (context) {
          rowContexts.push(context);
        }
        return props;
      },
      transformBodyCell(props, _column, _item, _ci, _columns, context) {
        if (context) {
          cellContexts.push(context);
        }
        return props;
      },
    };
    render(
      <Table data={data} columns={columns} idKey="id" plugins={{plugin}} />,
    );

    expect(rowContexts.map(c => [c.key, c.logicalIndex])).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ]);
    const [first] = rowContexts;
    expect(first.identityStatus).toBe('valid');
    expect(first.kind).toBe('product');
    expect(first.logicalRowCount).toBe(3);
    expect(first.headerRowCount).toBe(1);
    expect(first.render.mode).toBe('data');
    expect(first.render.rowModel).toBe('flat');
    expect(first.render.logicalRowCount).toBe(3);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.render)).toBe(true);
    expect(cellContexts.map(c => c.logicalIndex)).toEqual([0, 1, 2]);
  });

  it('keys a row by its index when there is no idKey', () => {
    const keys: TableRowContext['key'][] = [];
    const plugin: TablePlugin<Row> = {
      rowModel: 'flat',
      transformBodyRow(props, _item, _index, context) {
        keys.push(context?.key);
        return props;
      },
    };
    render(<Table data={data} columns={columns} plugins={{plugin}} />);
    expect(keys).toEqual([0, 1, 2]);
  });

  it('admits a custom row model for an undeclared body transform, and a declared model as declared', () => {
    const seen: [string, string][] = [];
    const undeclared: TablePlugin<Row> = {
      transformBodyRow(props, _item, _index, context) {
        if (context) {
          seen.push([context.render.rowModel, context.kind]);
        }
        return props;
      },
    };
    const {unmount} = render(
      <Table
        data={data.slice(0, 1)}
        columns={columns}
        idKey="id"
        plugins={{undeclared}}
      />,
    );
    unmount();
    const tree: TablePlugin<Row> = {...undeclared, rowModel: 'tree'};
    render(
      <Table
        data={data.slice(0, 1)}
        columns={columns}
        idKey="id"
        plugins={{tree}}
      />,
    );
    expect(seen).toEqual([
      ['custom', 'unknown'],
      ['tree', 'unknown'],
    ]);
  });

  it('passes the scroll-wrapper transform the render context, whose viewport is the scroll container', () => {
    let renderContext: TableRenderContext | undefined;
    const plugin: TablePlugin<Row> = {
      transformScrollWrapper(props, context) {
        renderContext = context;
        return props;
      },
    };
    render(
      <Table data={data} columns={columns} idKey="id" plugins={{plugin}} />,
    );
    expect(renderContext?.mode).toBe('data');
    expect(renderContext?.rowModel).toBe('flat');
    const viewport = renderContext?.viewport.current;
    expect(viewport).toBeInstanceOf(HTMLDivElement);
    expect(viewport?.contains(screen.getByRole('table'))).toBe(true);
  });

  it('re-renders moved rows only for a plugin that reads the index', () => {
    const indexReader = vi.fn();
    const nonReader = vi.fn();
    const reading: TablePlugin<Row> = {
      rowModel: 'flat',
      transformBodyCell(props, _column, item, _ci, _columns, context) {
        indexReader(item.id, context?.logicalIndex);
        return props;
      },
    };
    const notReading: TablePlugin<Row> = {
      rowModel: 'flat',
      transformBodyCell(props, _column, item) {
        nonReader(item.id);
        return props;
      },
    };
    const reordered = [data[2], data[0], data[1]];

    const first = render(
      <Table data={data} columns={columns} idKey="id" plugins={{reading}} />,
    );
    indexReader.mockClear();
    first.rerender(
      <Table
        data={reordered}
        columns={columns}
        idKey="id"
        plugins={{reading}}
      />,
    );
    expect(indexReader.mock.calls).toEqual([
      ['c', 0],
      ['a', 1],
      ['b', 2],
    ]);
    first.unmount();

    const second = render(
      <Table data={data} columns={columns} idKey="id" plugins={{notReading}} />,
    );
    nonReader.mockClear();
    second.rerender(
      <Table
        data={reordered}
        columns={columns}
        idKey="id"
        plugins={{notReading}}
      />,
    );
    expect(nonReader).not.toHaveBeenCalled();
  });

  it('re-renders existing rows for a new row count only when a plugin reads a count', () => {
    const counts: [string, number | undefined][] = [];
    const plugin: TablePlugin<Row> = {
      rowModel: 'flat',
      transformBodyRow(props, item, _index, context) {
        counts.push([item.id, context?.logicalRowCount]);
        return props;
      },
    };
    const {rerender} = render(
      <Table
        data={data.slice(0, 2)}
        columns={columns}
        idKey="id"
        plugins={{plugin}}
      />,
    );
    counts.length = 0;
    rerender(
      <Table data={data} columns={columns} idKey="id" plugins={{plugin}} />,
    );
    expect(counts).toEqual([
      ['a', 3],
      ['b', 3],
      ['c', 3],
    ]);
  });
});
