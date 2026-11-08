// Copyright (c) Meta Platforms, Inc. and affiliates.
'use client';
/**
 * @file TableVirtualization.release.fixture.tsx
 * @input Synthetic flat rows and public Table/plugin configuration
 * @output Test-only mount, update and operation-count controls
 * @position Production-compiled browser fixture; no alternate window algorithm
 */
import {useLayoutEffect, useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {Table} from '../Table';
import {VStack} from '../../Stack';
import {useTableRowsVirtualization} from '../plugins/virtualization/useTableRowsVirtualization';
import {useTableSelection} from '../plugins/selection/useTableSelection';
import {useTableRowIndex} from '../plugins/rowIndex/useTableRowIndex';
import {useTableStickyColumns} from '../plugins/stickyColumns/useTableStickyColumns';
import type {TableColumn, TablePlugin} from '../types';
import '../../reset.css';

type Row = {id: string; name: string; value: number};
export type Combination = 'core' | 'supported';
export type Density = 'compact' | 'balanced' | 'spacious';
export interface RowReleaseAPI {
  pendingFrames(): number;
  prepare(count: number): void;
  mount(combination: Combination, density?: Density): number;
  unmount(): void;
  noop(): number;
  remove(id: string): void;
  append(): void;
  /** Starts recording scroll-to-commit spans on the mounted viewport. */
  startRangeProbe(): void;
  /** Stops recording and returns the spans in milliseconds. */
  stopRangeProbe(): number[];
  counts: {identity: number; cells: number; rows: number};
  oldViewports: WeakRef<Element>[];
}
declare global {
  interface Window {
    __rowRelease: RowReleaseAPI;
  }
}
const columns: TableColumn<Row>[] = [
  {key: 'id', header: 'ID'},
  {key: 'name', header: 'Product'},
  {key: 'value', header: 'Value'},
];
const counts = {identity: 0, cells: 0, rows: 0};
const audit: TablePlugin<Row> = {
  rowModel: 'flat',
  transformBodyCell(props) {
    counts.cells++;
    return props;
  },
  transformBodyRow(props) {
    counts.rows++;
    return props;
  },
};
const getKey = (row: Row) => {
  counts.identity++;
  return row.id;
};
let data: Row[] = [];
let update: (() => void) | undefined;
let remove: ((id: string) => void) | undefined;
let append: (() => void) | undefined;
const pendingFrames = new Set<number>();
let rangeSamples: number[] = [];
let stopRangeProbe: (() => void) | undefined;
const nativeRequestFrame = window.requestAnimationFrame.bind(window);
const nativeCancelFrame = window.cancelAnimationFrame.bind(window);
window.requestAnimationFrame = callback => {
  const id = nativeRequestFrame(time => {
    pendingFrames.delete(id);
    callback(time);
  });
  pendingFrames.add(id);
  return id;
};
window.cancelAnimationFrame = id => {
  pendingFrames.delete(id);
  nativeCancelFrame(id);
};
const container = document.getElementById('root');
if (container == null) {
  throw new Error('The fixture page has no #root element');
}
const root = createRoot(container);

function Rows({
  plugins,
  density,
}: {
  plugins?: Record<string, TablePlugin<Row>>;
  density?: Density;
}) {
  const virtualization = useTableRowsVirtualization({
    rowHeight: 56,
    initialViewportHeight: 320,
  });
  const [items, setItems] = useState(data);
  const [, rerender] = useState(0);
  // The page drives the mounted table through these test-only handles.
  useLayoutEffect(() => {
    update = () => rerender(value => value + 1);
    remove = id => setItems(previous => previous.filter(row => row.id !== id));
    append = () =>
      setItems(previous => [
        ...previous,
        {id: 'append', name: 'Appended', value: 0},
      ]);
  }, []);
  const effectivePlugins = useMemo(() => ({...plugins, audit}), [plugins]);
  // The Table scrolls inside the height its parent gives it.
  return (
    <VStack height={320}>
      <Table
        data={items}
        columns={columns}
        idKey={getKey}
        virtualization={virtualization}
        plugins={effectivePlugins}
        aria-label="Release rows"
        emptyState="No release rows"
        dividers="grid"
        density={density}
        isStriped
      />
    </VStack>
  );
}
function SupportedRows({density}: {density?: Density}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const selection = useTableSelection<Row>({
    getIsItemSelected: row => selected.has(row.id),
    onSelectItem: ({item, isSelected}) =>
      setSelected(previous => {
        const next = new Set(previous);
        if (isSelected) {
          next.add(item.id);
        } else {
          next.delete(item.id);
        }
        return next;
      }),
    onSelectAll: () => {},
    getIsAllSelected: () => false,
    getRowLabel: row => row.name,
  });
  const rowIndex = useTableRowIndex<Row>();
  const sticky = useTableStickyColumns<Row>({startKeys: ['id']});
  const plugins = useMemo(
    () => ({selection, rowIndex, sticky}),
    [selection, rowIndex, sticky],
  );
  return <Rows plugins={plugins} density={density} />;
}
window.__rowRelease = {
  counts,
  oldViewports: [],
  pendingFrames: () => pendingFrames.size,
  prepare(count) {
    data = Array.from({length: count}, (_, index) => ({
      id: `row-${index}`,
      name: `Product ${index + 1}`,
      value: index,
    }));
  },
  mount(combination, density) {
    const start = performance.now();
    // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- the timing sample needs a synchronous commit
    flushSync(() =>
      root.render(
        combination === 'core' ? (
          <Rows density={density} />
        ) : (
          <SupportedRows density={density} />
        ),
      ),
    );
    const viewport = document.querySelector('.astryx-table-scroll-wrapper');
    if (viewport) {
      this.oldViewports.push(new WeakRef(viewport));
    }
    return performance.now() - start;
  },
  unmount() {
    // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- the timing sample needs a synchronous commit
    flushSync(() => root.render(null));
    update = undefined;
    remove = undefined;
    append = undefined;
  },
  noop() {
    const start = performance.now();
    // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- the timing sample needs a synchronous commit
    flushSync(() => update?.());
    return performance.now() - start;
  },
  startRangeProbe() {
    const scrollRegion = document.querySelector<HTMLElement>(
      '.astryx-table-scroll-wrapper',
    );
    if (scrollRegion == null) {
      throw new Error('The Table viewport is missing');
    }
    stopRangeProbe?.();
    rangeSamples = [];
    let scrollStart: number | undefined;
    // A window capture listener runs before the Table's own scroll listener.
    const onScrollStart = (event: Event) => {
      if (event.target === scrollRegion) {
        scrollStart = performance.now();
      }
    };
    // This listener is added after the Table's, so it runs after it. React
    // commits the synchronous geometry update in a microtask that the Table's
    // listener queued, so this later microtask runs after the commit.
    const onTableListenersDone = () => {
      const start = scrollStart;
      scrollStart = undefined;
      if (start !== undefined) {
        queueMicrotask(() => rangeSamples.push(performance.now() - start));
      }
    };
    window.addEventListener('scroll', onScrollStart, {
      capture: true,
      passive: true,
    });
    scrollRegion.addEventListener('scroll', onTableListenersDone, {
      passive: true,
    });
    stopRangeProbe = () => {
      window.removeEventListener('scroll', onScrollStart, {capture: true});
      scrollRegion.removeEventListener('scroll', onTableListenersDone);
      stopRangeProbe = undefined;
    };
  },
  stopRangeProbe() {
    stopRangeProbe?.();
    return rangeSamples;
  },
  remove(id) {
    // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- the timing sample needs a synchronous commit
    flushSync(() => remove?.(id));
  },
  append() {
    // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- the timing sample needs a synchronous commit
    flushSync(() => append?.());
  },
};
