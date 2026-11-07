// Copyright (c) Meta Platforms, Inc. and affiliates.
import {useState} from 'react';
import {render, screen, cleanup} from '@testing-library/react';
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
    function Host() {
      const [, bump] = useState(0);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              snapshot = {isLoading: false};
              notify?.();
              bump(n => n + 1);
            }}>
            Settle
          </button>
          <Table
            data={[]}
            columns={columns}
            plugins={{load: {rowModel: 'flat', renderState: source}}}
          />
        </>
      );
    }
    const {rerender} = render(<Host />);
    expect(screen.queryByText('No data')).not.toBeInTheDocument();
    snapshot = {isLoading: false};
    rerender(<Host />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });
});
