// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file TableLoadingViewport.test.tsx
 * @input Real Table/loading/windowing hooks and native observation seam
 * @output Fallback root and stale observer regression coverage
 * @position Parent/loading composition tests
 */
import {act, cleanup, render} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Table} from './Table';
import {useTableInfiniteScroll} from './plugins/infiniteScroll/useTableInfiniteScroll';
import {useTableRowsVirtualization} from './plugins/virtualization/useTableRowsVirtualization';
import type {TableColumn} from './types';
interface Item extends Record<string, unknown> {
  id: string;
  name: string;
}
const rows: Item[] = Array.from({length: 30}, (_, i) => ({
  id: String(i),
  name: `Item ${i}`,
}));
const columns: TableColumn<Item>[] = [{key: 'name', header: 'Name'}];
class Observer {
  static instances: Observer[] = [];
  callback: IntersectionObserverCallback;
  options: IntersectionObserverInit;
  target: Element | null = null;
  observe = vi.fn((target: Element) => {
    this.target = target;
  });
  disconnect = vi.fn();
  constructor(
    callback: IntersectionObserverCallback,
    options: IntersectionObserverInit = {},
  ) {
    this.callback = callback;
    this.options = options;
    Observer.instances.push(this);
  }
  enter() {
    this.callback(
      [
        {
          target: this.target,
          isIntersecting: true,
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver,
    );
  }
}
const noopLoad = async () => {};
function Fixture({
  fallback = 'none',
  load = noopLoad,
}: {
  fallback?: string;
  load?: () => Promise<void>;
}) {
  const loading = useTableInfiniteScroll<Item>({
    hasMore: true,
    isLoading: false,
    onLoadMore: load,
  });
  const virtualization = useTableRowsVirtualization({
    rowHeight: 56,
    initialViewportHeight: 240,
  });
  const props = {
    data:
      fallback === 'empty'
        ? []
        : fallback === 'duplicate'
          ? [rows[0], rows[0]]
          : rows,
    columns:
      fallback === 'renderer'
        ? [{key: 'name', header: 'Name', renderCell: (item: Item) => item.name}]
        : columns,
    textOverflow: fallback === 'wrap' ? ('wrap' as const) : undefined,
    rowIndexStart: fallback === 'offset' ? 10 : undefined,
    plugins: {loading},
  };
  if (fallback === 'plain') {
    return <Table {...props} idKey="id" />;
  }
  if (fallback === 'identity') {
    return <Table {...props} virtualization={virtualization} />;
  }
  return <Table {...props} idKey="id" virtualization={virtualization} />;
}
beforeEach(() => {
  Observer.instances = [];
  vi.stubGlobal('IntersectionObserver', Observer);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('Table loading observation uses actual window admission', () => {
  it.each([
    'plain',
    'renderer',
    'wrap',
    'empty',
    'duplicate',
    'identity',
    'offset',
  ])('uses the browser viewport for %s full-render fallback', fallback => {
    const load = vi.fn(async () => {});
    render(<Fixture fallback={fallback} load={load} />);
    expect(Observer.instances.at(-1)?.options.root).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });
  it('uses the bounded Table block viewport only for admitted windowing', () => {
    const view = render(<Fixture />);
    expect(Observer.instances.at(-1)?.options.root).toBe(
      view.container.querySelector('.astryx-table-scroll-wrapper'),
    );
  });
  it('disconnects the old bounded root and ignores its late entries after fallback', () => {
    const load = vi.fn(async () => {});
    const view = render(<Fixture load={load} />);
    const old = Observer.instances.at(-1)!;
    view.rerender(<Fixture fallback="renderer" load={load} />);
    expect(old.disconnect).toHaveBeenCalled();
    expect(Observer.instances.at(-1)?.options.root).toBeNull();
    act(() => old.enter());
    expect(load).not.toHaveBeenCalled();
  });
});
