// Copyright (c) Meta Platforms, Inc. and affiliates.
/** Development fallback diagnostics through the public Table windowing surface. */
import {render, cleanup, act, screen} from '@testing-library/react';
import {useTableSelection} from './plugins/selection/useTableSelection';
import {useTableRowStatus} from './plugins/rowStatus/useTableRowStatus';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Table} from './Table';
import {useTableRowsVirtualization} from './plugins/virtualization/useTableRowsVirtualization';
import type {TableColumn, TablePlugin, BaseTableProps} from './types';
interface Item extends Record<string, unknown> {
  id: string;
  name: string;
}
const data: Item[] = Array.from({length: 50}, (_, i) => ({
  id: String(i),
  name: `Item ${i}`,
}));
const columns: TableColumn<Item>[] = [{key: 'name', header: 'Name'}];
const bodyModifier: TablePlugin<Item> = {transformBodyRow: props => props};
function Fixture({reason}: {reason: string}) {
  const virtualization = useTableRowsVirtualization({
    rowHeight: reason === 'geometry' ? 0 : 56,
    viewportHeight: 240,
  });
  return (
    <Table
      data={data}
      columns={
        reason === 'renderer'
          ? [{key: 'name', header: 'Name', renderCell: item => item.name}]
          : columns
      }
      idKey="id"
      virtualization={virtualization}
      textOverflow={reason === 'wrap' ? 'wrap' : undefined}
      rowIndexStart={reason === 'offset' ? 2 : undefined}
      rowCount={reason === 'count' ? 500 : undefined}
      plugins={reason === 'model' ? {modifier: bodyModifier} : undefined}
    />
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe('Table windowing admission diagnostics', () => {
  it('keeps unadmitted row-status composition fully rendered with its accessible markers', () => {
    function StatusFixture() {
      const virtualization = useTableRowsVirtualization({
        rowHeight: 56,
        viewportHeight: 240,
      });
      const rowStatus = useTableRowStatus<Item>({
        getStatus: () => ({status: 'success', label: 'Ready'}),
      });
      return (
        <Table
          data={data}
          columns={columns}
          idKey="id"
          virtualization={virtualization}
          plugins={{rowStatus}}
        />
      );
    }
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const view = render(<StatusFixture />);
    expect(view.container.querySelectorAll('tbody > tr')).toHaveLength(
      data.length,
    );
    expect(screen.getAllByRole('img', {name: 'Ready'})).toHaveLength(
      data.length,
    );
    expect(
      view.container.querySelector('[data-table-logical-index]'),
    ).toBeNull();
    expect(warning).toHaveBeenCalledTimes(1);
    view.rerender(<StatusFixture />);
    expect(warning).toHaveBeenCalledTimes(1);
  });
  it('names a virtualization value the hook did not make', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const foreign = Object.freeze({rowHeight: 56, viewportHeight: 240});
    const view = render(
      <Table
        data={data}
        columns={columns}
        idKey="id"
        virtualization={
          foreign as unknown as BaseTableProps<Item>['virtualization']
        }
      />,
    );
    expect(view.container.querySelectorAll('tbody > tr')).toHaveLength(
      data.length,
    );
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning.mock.calls[0].join(' ')).toContain(
      'not a value from useTableRowsVirtualization',
    );
  });

  it('renders fully with one diagnostic when a caller replaces the owned scroll wrapper', () => {
    const CallerWrapper: NonNullable<BaseTableProps<Item>['scrollWrapper']> = ({
      children,
      htmlProps,
    }) => (
      <div
        {...htmlProps}
        data-caller-wrapper
        style={{height: 240, overflow: 'auto'}}>
        {children}
      </div>
    );
    function CallerFixture() {
      const virtualization = useTableRowsVirtualization({
        rowHeight: 56,
        viewportHeight: 240,
      });
      return (
        <Table
          data={data}
          columns={columns}
          idKey="id"
          virtualization={virtualization}
          scrollWrapper={CallerWrapper}
        />
      );
    }
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const view = render(<CallerFixture />);
    expect(view.container.querySelectorAll('tbody > tr')).toHaveLength(
      data.length,
    );
    expect(
      view.container.querySelector('[data-table-logical-index]'),
    ).toBeNull();
    expect(view.container.querySelector('[data-caller-wrapper]')).toHaveStyle({
      height: '240px',
      overflow: 'auto',
    });
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning.mock.calls[0].join(' ')).toContain(
      'Table-owned scroll wrapper',
    );
    view.rerender(<CallerFixture />);
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it('keeps a caller scroll wrapper unchanged without virtualization', () => {
    const CallerWrapper: NonNullable<BaseTableProps<Item>['scrollWrapper']> = ({
      children,
      htmlProps,
    }) => (
      <div
        {...htmlProps}
        data-caller-wrapper
        style={{height: 240, overflow: 'auto'}}>
        {children}
      </div>
    );
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const view = render(
      <Table
        data={data}
        columns={columns}
        idKey="id"
        scrollWrapper={CallerWrapper}
      />,
    );
    expect(view.container.querySelectorAll('tbody > tr')).toHaveLength(
      data.length,
    );
    expect(view.container.querySelector('[data-caller-wrapper]')).toHaveStyle({
      height: '240px',
      overflow: 'auto',
    });
    expect(warning).not.toHaveBeenCalled();
  });
  it('preserves the focused selection control when the same keyed row falls back', () => {
    function FocusFixture({fallback}: {fallback: boolean}) {
      const virtualization = useTableRowsVirtualization({
        rowHeight: 56,
        viewportHeight: 240,
      });
      const selection = useTableSelection({
        getIsItemSelected: () => false,
        onSelectItem() {},
        onSelectAll() {},
        getIsAllSelected: () => false,
        getRowLabel: (item: Item) => item.name,
      });
      return (
        <Table
          data={data}
          columns={columns}
          idKey="id"
          virtualization={virtualization}
          textOverflow={fallback ? 'wrap' : undefined}
          plugins={{selection}}
        />
      );
    }
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const view = render(<FocusFixture fallback={false} />);
    const control = screen.getByRole('checkbox', {name: 'Select Item 0'});
    act(() => control.focus());
    expect(document.activeElement).toBe(control);
    view.rerender(<FocusFixture fallback />);
    expect(control.isConnected).toBe(true);
    expect(screen.getByRole('checkbox', {name: 'Select Item 0'})).toBe(control);
    expect(document.activeElement).toBe(control);
  });
  it.each(['renderer', 'wrap', 'offset', 'count', 'model', 'geometry'])(
    'explains %s full-render fallback once across rerenders',
    reason => {
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const view = render(<Fixture reason={reason} />);
      expect(view.container.querySelectorAll('tbody>tr')).toHaveLength(50);
      expect(warning).toHaveBeenCalledTimes(1);
      expect(warning.mock.calls[0].join(' ')).toContain('Windowing disabled:');
      view.rerender(<Fixture reason={reason} />);
      expect(warning).toHaveBeenCalledTimes(1);
    },
  );
  it('reports invalid identity once without a duplicate error for the same fallback', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const duplicateData = [
      {id: 'a', name: 'A'},
      {id: 'a', name: 'B'},
    ];
    function DuplicateFixture() {
      const virtualization = useTableRowsVirtualization({
        rowHeight: 56,
        viewportHeight: 240,
      });
      return (
        <Table
          data={duplicateData}
          columns={columns}
          idKey="id"
          virtualization={virtualization}
        />
      );
    }
    const view = render(<DuplicateFixture />);
    view.rerender(<DuplicateFixture />);
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning.mock.calls[0].join(' ')).toContain(
      'explicit unique valid row identity',
    );
    expect(error).not.toHaveBeenCalled();
    expect(view.container.querySelectorAll('tbody > tr')).toHaveLength(2);
  });
  it('keeps each fallback reason observable once across reason changes', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const view = render(<Fixture reason="wrap" />);
    view.rerender(<Fixture reason="renderer" />);
    view.rerender(<Fixture reason="wrap" />);
    expect(warning).toHaveBeenCalledTimes(2);
  });
  it('does not warn for valid bounded windowing', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Fixture reason="none" />);
    expect(warning).not.toHaveBeenCalled();
  });
});
