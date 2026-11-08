// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTableRowsVirtualization.test.tsx
 * @input Public capability and actual Table
 * @output Capability identity, bounded pre-cell rendering, SSR and fallback tests
 * @position Colocated Table virtualization runtime coverage
 */
import {describe, it, expect, vi} from 'vitest';
import {cleanup, render, renderHook, screen} from '@testing-library/react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as TableApi from '@astryxdesign/core/Table';
import {Table} from '../../Table';
import type {TableColumn} from '../../types';
import {
  getTableVirtualizationConfig,
  useTableRowsVirtualization,
} from './useTableRowsVirtualization';

interface Item extends Record<string, unknown> {
  id: string;
  label: string;
}
const columns: TableColumn<Item>[] = [{key: 'label', header: 'Label'}];
const data: Item[] = Array.from({length: 100}, (_, i) => ({
  id: `row-${i}`,
  label: `Item ${i}`,
}));
function Fixture({
  items = data,
  rowHeight = 48,
  viewportHeight = 240,
  tableColumns = columns,
}: {
  items?: Item[];
  rowHeight?: number;
  viewportHeight?: number;
  tableColumns?: TableColumn<Item>[];
}) {
  const virtualization = useTableRowsVirtualization({
    rowHeight,
    viewportHeight,
  });
  return (
    <Table
      data={items}
      columns={tableColumns}
      idKey="id"
      virtualization={virtualization}
    />
  );
}

describe('Table virtualization capability', () => {
  it('exports only the row-specific virtualization hook name', () => {
    expect(typeof Reflect.get(TableApi, 'useTableRowsVirtualization')).toBe(
      'function',
    );
    expect('useTableVirtualization' in TableApi).toBe(false);
  });
  it('is immutable geometry intent with stable identity and no public payload or knobs', () => {
    const {result, rerender} = renderHook(
      ({rowHeight, viewportHeight}) =>
        useTableRowsVirtualization({rowHeight, viewportHeight}),
      {initialProps: {rowHeight: 48, viewportHeight: 240}},
    );
    const original = result.current;
    expect(Object.keys(original)).toEqual([]);
    expect(Object.isFrozen(original)).toBe(true);
    expect(Object.isFrozen(getTableVirtualizationConfig(original))).toBe(true);
    expect(getTableVirtualizationConfig(original)).toEqual({
      rowHeight: 48,
      viewportHeight: 240,
    });
    expect(
      getTableVirtualizationConfig({rowHeight: 48, viewportHeight: 240}),
    ).toBeUndefined();
    rerender({rowHeight: 48, viewportHeight: 240});
    expect(result.current).toBe(original);
    rerender({rowHeight: 50, viewportHeight: 240});
    expect(result.current).not.toBe(original);
  });
});

describe('actual Table virtualization', () => {
  it('plans before cell construction at 100k and keeps native rows plus truthful metadata', () => {
    const readCell = vi.fn();
    const items: Item[] = Array.from({length: 100000}, (_, i) => ({
      id: `id-${i}`,
      get label() {
        readCell(i);
        return `Value ${i}`;
      },
    }));
    const {container} = render(<Fixture items={items} />);
    const table = screen.getByRole('table');
    expect(table).toHaveAttribute('aria-rowcount', '100001');
    const bodyRows = Array.from(
      container.querySelectorAll('tbody > tr'),
    ).filter(row => row.getAttribute('aria-hidden') !== 'true');
    expect(bodyRows).toHaveLength(9);
    expect(bodyRows[0]).toHaveAttribute('aria-rowindex', '2');
    expect(bodyRows[8]).toHaveAttribute('aria-rowindex', '10');
    expect(readCell.mock.calls.every(([index]) => index < 9)).toBe(true);
    expect(readCell).toHaveBeenCalled();
    const gap = container.querySelector('tbody > tr[aria-hidden="true"]');
    expect(gap).not.toBeNull();
    expect(gap?.firstElementChild?.tagName).toBe('TD');
    expect(gap?.firstElementChild).toHaveAttribute('colspan', '1');
    expect(gap?.querySelector('button,input,a')).toBeNull();
    cleanup();
  });
  it('uses the same bounded server seed and first client output, never a full intermediate body', () => {
    const html = renderToStaticMarkup(<Fixture />);
    const server = document.createElement('div');
    server.innerHTML = html;
    const serverRows = Array.from(server.querySelectorAll('tbody > tr')).filter(
      row => row.getAttribute('aria-hidden') !== 'true',
    );
    expect(serverRows).toHaveLength(9);
    const {container} = render(<Fixture />);
    const clientRows = Array.from(
      container.querySelectorAll('tbody > tr'),
    ).filter(row => row.getAttribute('aria-hidden') !== 'true');
    expect(clientRows.map(row => row.getAttribute('aria-rowindex'))).toEqual(
      serverRows.map(row => row.getAttribute('aria-rowindex')),
    );
    cleanup();
  });
  it('falls back before rendering unsupported custom content or duplicate identity', () => {
    const renderCell = vi.fn((item: Item) => <span>{item.label}</span>);
    const {container} = render(
      <Fixture tableColumns={[{key: 'label', header: 'Label', renderCell}]} />,
    );
    expect(renderCell).toHaveBeenCalledTimes(100);
    expect(
      container.querySelector('tbody > tr[aria-hidden="true"]'),
    ).toBeNull();
    cleanup();
    const duplicates = data.map(item => ({...item, id: 'same'}));
    const duplicateResult = render(<Fixture items={duplicates} />);
    expect(
      duplicateResult.container.querySelectorAll('tbody > tr'),
    ).toHaveLength(100);
    expect(
      duplicateResult.container.querySelector('table'),
    ).not.toHaveAttribute('aria-rowcount');
    cleanup();
  });
  it('keeps typed keys distinct from an idKey function and falls back for projected duplicates or null ids', () => {
    interface Loose extends Record<string, unknown> {
      id: unknown;
      label: string;
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    function LooseTable({
      items,
      idKey,
    }: {
      items: Loose[];
      idKey: 'id' | ((item: Loose) => string | number);
    }) {
      const virtualization = useTableRowsVirtualization({
        rowHeight: 48,
        viewportHeight: 240,
      });
      return (
        <Table
          data={items}
          columns={[{key: 'label', header: 'Label'}]}
          idKey={idKey}
          virtualization={virtualization}
        />
      );
    }
    const rendered = (container: HTMLElement) =>
      container.querySelectorAll('tbody > tr:not([aria-hidden="true"])').length;
    const typed: Loose[] = data.map((item, index) => ({
      label: item.label,
      id: index === 1 ? '0' : index,
    }));
    // A function keeps 0 and '0' as different keys, so the table windows.
    const fromFunction = render(
      <LooseTable items={typed} idKey={item => item.id as string | number} />,
    );
    expect(rendered(fromFunction.container)).toBeLessThan(100);
    expect(fromFunction.container.querySelector('table')).toHaveAttribute(
      'aria-rowcount',
      '101',
    );
    cleanup();
    // A property name projects both to '0', a duplicate, so the table falls back.
    const fromProperty = render(<LooseTable items={typed} idKey="id" />);
    expect(rendered(fromProperty.container)).toBe(100);
    cleanup();
    const withNull = typed.map((item, index) =>
      index === 5 ? {...item, id: null} : {...item, id: `row-${index}`},
    );
    const fromNull = render(<LooseTable items={withNull} idKey="id" />);
    expect(rendered(fromNull.container)).toBe(100);
    cleanup();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('explicit unique valid row identity'),
    );
    warn.mockRestore();
  });
  it('preserves legacy full rendering and empty-state semantics', () => {
    const {container} = render(
      <Table data={data} columns={columns} idKey="id" />,
    );
    expect(container.querySelectorAll('tbody > tr')).toHaveLength(100);
    expect(container.querySelector('table')).not.toHaveAttribute(
      'aria-rowcount',
    );
    cleanup();
    const empty = render(<Fixture items={[]} />);
    expect(empty.container.querySelector('table')).not.toHaveAttribute(
      'aria-rowcount',
    );
    expect(
      empty.container.querySelector('tbody > tr[aria-hidden="true"]'),
    ).toBeNull();
    cleanup();
  });
});
