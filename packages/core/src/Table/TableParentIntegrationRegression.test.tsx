// Copyright (c) Meta Platforms, Inc. and affiliates.
import {render, screen, cleanup, fireEvent} from '@testing-library/react';
import {afterEach, describe, it, expect, vi} from 'vitest';
import {publishScrollGeometry} from '../hooks/scrollGeometrySubscriptions';
import {Table} from './Table';
import {TableBody} from './TableBody';
import {TableCell} from './TableCell';
import {TableRow} from './TableRow';
import type {TablePlugin} from './types';
import {useTableRowsVirtualization} from './plugins/virtualization/useTableRowsVirtualization';
const columns = [{key: 'name', header: 'Name'}];
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe('Table parent compatibility regressions', () => {
  it('does not read windowing rectangles when an ordinary Table scrolls', () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(240);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(240);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(
      1000,
    );
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(240);
    const {container} = render(
      <Table data={[{id: 'a', name: 'A'}]} columns={columns} idKey="id" />,
    );
    const viewport = screen.getByRole('group');
    const body = container.querySelector('tbody');
    expect(body).not.toBeNull();
    const viewportRead = vi.spyOn(viewport, 'getBoundingClientRect');
    const bodyRead = vi.spyOn(
      body as HTMLTableSectionElement,
      'getBoundingClientRect',
    );
    fireEvent.scroll(viewport);
    publishScrollGeometry(viewport, true);
    expect(viewportRead).not.toHaveBeenCalled();
    expect(bodyRead).not.toHaveBeenCalled();
  });
  it('retains legacy key resolution when a caller appends in place', () => {
    const data = [{id: 'a', name: 'A'}];
    const {rerender} = render(
      <Table data={data} columns={columns} idKey="id" />,
    );
    data.push({id: 'b', name: 'B'});
    rerender(<Table data={data} columns={columns} idKey="id" />);
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });
  it('refreshes identity and stays rendered when windowed data is appended in place', () => {
    const data = Array.from({length: 20}, (_, i) => ({
      id: String(i),
      name: `Item ${i}`,
    }));
    function Fixture() {
      const virtualization = useTableRowsVirtualization({
        rowHeight: 56,
        initialViewportHeight: 240,
      });
      return (
        <Table
          data={data}
          columns={columns}
          idKey="id"
          virtualization={virtualization}
        />
      );
    }
    const view = render(<Fixture />);
    data.push({id: '20', name: 'Appended item'});
    view.rerender(<Fixture />);
    expect(screen.getByRole('table')).toHaveAttribute('aria-rowcount', '22');
    expect(
      view.container.querySelectorAll('tbody > tr:not([aria-hidden])').length,
    ).toBeLessThan(21);
  });
  it('uses actual fallback overflow rather than requested virtualization intent', () => {
    function Fixture() {
      const virtualization = useTableRowsVirtualization({
        rowHeight: 56,
        initialViewportHeight: 240,
      });
      return (
        <Table
          data={[{id: 'a', name: 'A'}]}
          columns={[{key: 'name', renderCell: item => item.name}]}
          idKey="id"
          virtualization={virtualization}
        />
      );
    }
    const {container} = render(<Fixture />);
    expect(container.querySelector('td')?.className).toContain('wrapStyles');
    expect(container.querySelector('td')?.className).not.toContain(
      'overflowStyles',
    );
  });
  it('reports no header row to scroll-wrapper plugins in children mode', () => {
    const headerRowCounts: number[] = [];
    const probe: TablePlugin<Record<string, unknown>> = {
      transformScrollWrapper(props, context) {
        if (context) {
          headerRowCounts.push(context.headerRowCount);
        }
        return props;
      },
    };
    render(
      <Table columns={columns} plugins={{probe}}>
        <TableBody>
          <TableRow>
            <TableCell>A</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.queryAllByRole('columnheader')).toHaveLength(0);
    expect(headerRowCounts.length).toBeGreaterThan(0);
    expect(new Set(headerRowCounts)).toEqual(new Set([0]));
  });
});
