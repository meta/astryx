// Copyright (c) Meta Platforms, Inc. and affiliates.
import {act, render, screen, cleanup} from '@testing-library/react';
import type {HTMLAttributes, ReactNode} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {useTableInfiniteScroll} from './plugins/infiniteScroll/useTableInfiniteScroll';
import type {TableColumn} from './types';
import {Table} from './Table';

const columns = [{key: 'id', header: 'ID'}];
afterEach(cleanup);

describe('Table plugin loading source', () => {
  it('renders only appended rows when a real loading plugin owns wrapper state', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    interface Item extends Record<string, unknown> {
      id: string;
      name: string;
    }
    const renderCell = vi.fn((item: Item) => item.name);
    const itemColumns: TableColumn<Item>[] = [
      {key: 'name', header: 'Name', renderCell},
    ];
    const rows: Item[] = Array.from({length: 200}, (_, index) => ({
      id: String(index),
      name: `Item ${index}`,
    }));
    const appended: Item[] = Array.from({length: 50}, (_, index) => ({
      id: String(index + 200),
      name: `Item ${index + 200}`,
    }));
    const onLoadMore = async () => {};
    function Fixture({
      data,
      isLoading = false,
    }: {
      data: Item[];
      isLoading?: boolean;
    }) {
      const loading = useTableInfiniteScroll<Item>({
        hasMore: true,
        isLoading,
        onLoadMore,
      });
      return (
        <Table
          data={data}
          columns={itemColumns}
          idKey="id"
          plugins={{loading}}
        />
      );
    }
    const view = render(<Fixture data={rows} />);
    renderCell.mockClear();
    view.rerender(<Fixture data={rows} isLoading />);
    expect(renderCell).not.toHaveBeenCalled();
    view.rerender(<Fixture data={[...rows, ...appended]} />);
    expect(renderCell.mock.calls).toEqual(appended.map(item => [item]));
    renderCell.mockClear();
    view.rerender(<Fixture data={rows} />);
    expect(renderCell).not.toHaveBeenCalled();
    view.unmount();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  it('reacts to a stable loading source before rendering the default empty state', () => {
    let notify: (() => void) | undefined;
    let snapshot = {isLoading: true};
    const source = {
      subscribe(fn: () => void) {
        notify = fn;
        return () => {
          notify = undefined;
        };
      },
      getSnapshot: () => snapshot,
      getServerSnapshot: () => snapshot,
    };
    // A stable plugin record: only the source's notification re-renders
    // Table, so the test fails if Table does not subscribe.
    const plugins = {load: {rowModel: 'flat' as const, renderState: source}};
    render(
      <>
        <button
          type="button"
          onClick={() => {
            snapshot = {isLoading: false};
            notify?.();
          }}>
          Settle
        </button>
        <Table data={[]} columns={columns} plugins={plugins} />
      </>,
    );
    expect(screen.queryByText('No data')).not.toBeInTheDocument();
    act(() => screen.getByRole('button', {name: 'Settle'}).click());
    expect(screen.getByText('No data')).toBeInTheDocument();
  });
  it('gives a caller scroll wrapper that renders afterTable no loading behavior', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onLoadMore = vi.fn(async () => {});
    const CallerWrapper = ({
      children,
      htmlProps,
      afterTable,
    }: {
      children: ReactNode;
      htmlProps?: HTMLAttributes<HTMLDivElement>;
      afterTable?: ReactNode;
    }) => (
      <div {...htmlProps} data-caller-wrapper>
        {children}
        {afterTable}
      </div>
    );
    function Fixture() {
      const loading = useTableInfiniteScroll<{id: string}>({
        hasMore: true,
        isLoading: true,
        onLoadMore,
      });
      return (
        <Table
          data={[]}
          columns={columns}
          plugins={{loading}}
          scrollWrapper={CallerWrapper}
        />
      );
    }
    render(<Fixture />);
    // Neither half of the loading behavior: the default empty state stays,
    // and no Load more surface or request appears.
    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: /load more/i})).toBeNull();
    expect(onLoadMore).not.toHaveBeenCalled();
    expect(
      warn.mock.calls.filter(call =>
        String(call[0]).includes("Table's own scroll wrapper"),
      ),
    ).toHaveLength(1);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  it('admits no loading state with a caller scroll wrapper', () => {
    const source = {
      subscribe: () => () => {},
      getSnapshot: () => ({isLoading: true}),
      getServerSnapshot: () => ({isLoading: true}),
    };
    const plugins = {load: {rowModel: 'flat' as const, renderState: source}};
    // The caller's wrapper does not render `afterTable`, so no loading
    // surface can show; the default empty state stays.
    const CallerWrapper = ({
      children,
      htmlProps,
    }: {
      children: ReactNode;
      htmlProps?: HTMLAttributes<HTMLDivElement>;
    }) => (
      <div {...htmlProps} data-caller-wrapper>
        {children}
      </div>
    );
    render(
      <Table
        data={[]}
        columns={columns}
        plugins={plugins}
        scrollWrapper={CallerWrapper}
      />,
    );
    expect(screen.getByText('No data')).toBeInTheDocument();
  });
});
