// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file TableIncrementalCount.test.tsx
 * @input Real Table, loading/windowing hooks and caller-controlled exhaustion
 * @output Regression evidence for unknown remote row totals
 * @position Infinite-loading composition coverage of parent-owned row metadata
 */
import {act, cleanup, render, screen} from '@testing-library/react';
import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Table} from './Table';
import {useTableInfiniteScroll} from './plugins/infiniteScroll/useTableInfiniteScroll';
import {useTableRowsVirtualization} from './plugins/virtualization/useTableRowsVirtualization';
import type {TablePlugin, TablePluginRenderState} from './types';

interface Item extends Record<string, unknown> {
  id: string;
  name: string;
}
const data: Item[] = Array.from({length: 30}, (_, i) => ({
  id: String(i),
  name: `Item ${i}`,
}));
const columns = [{key: 'name', header: 'Name'}];
const onLoadMore = async () => {};
function Fixture({
  hasMore,
  isLoading = false,
  items = data,
  isWindowed = true,
}: {
  hasMore: boolean;
  isLoading?: boolean;
  items?: Item[];
  isWindowed?: boolean;
}) {
  const loading = useTableInfiniteScroll<Item>({
    hasMore,
    isLoading,
    onLoadMore,
  });
  const virtualization = useTableRowsVirtualization({
    rowHeight: 56,
    initialViewportHeight: 240,
  });
  return isWindowed ? (
    <Table
      data={items}
      columns={columns}
      idKey="id"
      plugins={{loading}}
      virtualization={virtualization}
    />
  ) : (
    <Table
      data={items}
      columns={columns}
      idKey="id"
      plugins={{loading}}
      rowIndexStart={4}
      rowCount={90}
    />
  );
}
beforeEach(() => vi.stubGlobal('IntersectionObserver', undefined));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('incrementally loaded Table row totals', () => {
  it.each([false, true])(
    'reports unknown full row total while more data exists (busy=%s)',
    isLoading => {
      render(<Fixture hasMore isLoading={isLoading} />);
      expect(screen.getByRole('table')).toHaveAttribute('aria-rowcount', '-1');
      expect(screen.getAllByRole('row')[0]).toHaveAttribute(
        'aria-rowindex',
        '1',
      );
      expect(screen.getAllByRole('row')[1]).toHaveAttribute(
        'aria-rowindex',
        '2',
      );
    },
  );
  it('keeps the total unknown across append, becomes exact at exhaustion, and becomes unknown again', () => {
    const view = render(<Fixture hasMore items={data.slice(0, 15)} />);
    const table = screen.getByRole('table');
    expect(table).toHaveAttribute('aria-rowcount', '-1');
    view.rerender(<Fixture hasMore items={data} />);
    expect(table).toHaveAttribute('aria-rowcount', '-1');
    view.rerender(<Fixture hasMore={false} items={data} />);
    expect(table).toHaveAttribute('aria-rowcount', '31');
    view.rerender(<Fixture hasMore items={data} />);
    expect(table).toHaveAttribute('aria-rowcount', '-1');
  });
  it('publishes the unknown total on the server and preserves empty-data metadata', () => {
    const markup = renderToStaticMarkup(<Fixture hasMore />);
    expect(markup).toContain('aria-rowcount="-1"');
    expect(renderToStaticMarkup(<Fixture hasMore items={[]} />)).not.toContain(
      'aria-rowcount',
    );
  });
  it('preserves legacy non-windowed caller counts during incremental loading', () => {
    render(<Fixture hasMore isWindowed={false} />);
    expect(screen.getByRole('table')).toHaveAttribute('aria-rowcount', '90');
    expect(screen.getAllByRole('row')[1]).toHaveAttribute('aria-rowindex', '4');
  });
  it('keeps loading-only sources backward compatible and ignores incremental totals outside flat admission', () => {
    const snapshot = Object.freeze({isLoading: false});
    const source: TablePluginRenderState = {
      subscribe: () => () => {},
      getSnapshot: () => snapshot,
      getServerSnapshot: () => snapshot,
    };
    function CompatibilityFixture({isCustom = false}: {isCustom?: boolean}) {
      const virtualization = useTableRowsVirtualization({
        rowHeight: 56,
        initialViewportHeight: 240,
      });
      const plugin: TablePlugin<Item> = {
        rowModel: isCustom ? 'custom' : 'flat',
        renderState: isCustom
          ? {
              ...source,
              getSnapshot: () => ({isLoading: false, hasMore: true}),
              getServerSnapshot: () => ({isLoading: false, hasMore: true}),
            }
          : source,
      };
      return (
        <Table
          data={data}
          columns={columns}
          idKey="id"
          virtualization={virtualization}
          plugins={{loading: plugin}}
        />
      );
    }
    const view = render(<CompatibilityFixture />);
    expect(screen.getByRole('table')).toHaveAttribute('aria-rowcount', '31');
    view.rerender(<CompatibilityFixture isCustom />);
    expect(screen.getByRole('table')).not.toHaveAttribute('aria-rowcount');
  });
  it('subscribes to hasMore independently of loading without replacing the plugin', () => {
    let snapshot: Readonly<{isLoading: boolean; hasMore: boolean}> = {
      isLoading: false,
      hasMore: true,
    };
    const listeners = new Set<() => void>();
    const source: TablePluginRenderState = {
      subscribe(fn) {
        listeners.add(fn);
        return () => {
          listeners.delete(fn);
        };
      },
      getSnapshot: () => snapshot,
      getServerSnapshot: () => snapshot,
    };
    const plugin: TablePlugin<Item> = {rowModel: 'flat', renderState: source};
    function StoreFixture() {
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
          plugins={{loading: plugin}}
        />
      );
    }
    render(<StoreFixture />);
    expect(screen.getByRole('table')).toHaveAttribute('aria-rowcount', '-1');
    act(() => {
      snapshot = {isLoading: false, hasMore: false};
      for (const fn of listeners) {
        fn();
      }
    });
    expect(screen.getByRole('table')).toHaveAttribute('aria-rowcount', '31');
  });
});
