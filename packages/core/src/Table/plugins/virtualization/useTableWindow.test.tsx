// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTableWindow.test.tsx
 * @input Private shared-geometry controller with a fake geometry source
 * @output Bounded range, focus-island, anchor and lifecycle tests
 * @position Colocated Table virtualization controller coverage
 */
import {describe, it, expect, vi} from 'vitest';
import {act, renderHook} from '@testing-library/react';
import {Profiler, StrictMode, useMemo, type RefObject} from 'react';
import {useTableRowsVirtualization} from './useTableRowsVirtualization';
import {
  useTableWindow,
  type TableWindowGeometry,
  type TableWindowGeometrySource,
} from './useTableWindow';
import type {ListWindowSegment} from '../../../utils/listWindow';

interface Item extends Record<string, unknown> {
  id: string;
  label: string;
}
const data: Item[] = Array.from({length: 100}, (_, i) => ({
  id: `row-${i}`,
  label: `Item ${i}`,
}));
const keys = data.map(item => item.id);
const seed: TableWindowGeometry = Object.freeze({
  viewportHeight: 0,
  scrollTop: 0,
  bodyOffset: 0,
  isMeasured: false,
});
function source(initial: TableWindowGeometry = seed) {
  let current = initial;
  const listeners = new Set<() => void>();
  const store: TableWindowGeometrySource = {
    subscribe: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    getSnapshot: () => current,
    getServerSnapshot: () => seed,
  };
  return {
    store,
    listeners,
    publish(next: TableWindowGeometry) {
      current = next;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}
const nullRef = <E,>(): RefObject<E | null> => ({current: null});
function mounted(segments: ListWindowSegment[]) {
  return segments.flatMap(segment =>
    segment.type === 'rows'
      ? Array.from(
          {length: segment.end - segment.start},
          (_, i) => segment.start + i,
        )
      : [],
  );
}
describe('private Table shared-geometry controller', () => {
  it.each(['pointer', 'keyboard'] as const)(
    'follows %s input in the viewport own document on row removal',
    modality => {
      const iframe = document.createElement('iframe');
      document.body.append(iframe);
      const doc = iframe.contentDocument as Document;
      const viewport = doc.createElement('div');
      const table = doc.createElement('table');
      const body = doc.createElement('tbody');
      const row = doc.createElement('tr');
      const cell = doc.createElement('td');
      const control = doc.createElement('button');
      cell.append(control);
      row.append(cell);
      body.append(row);
      table.append(body);
      viewport.append(table);
      doc.body.append(viewport);
      const refs = {
        viewport: {current: viewport},
        body: {current: body},
        table: {current: table},
      };
      const geometry = source();
      const view = renderHook(
        ({items, rowKeys}) =>
          useTableWindow({
            capability: useTableRowsVirtualization({
              rowHeight: 20,
              initialViewportHeight: 100,
            }),
            data: items,
            keys: rowKeys,
            isAdmitted: true,
            ...refs,
            geometry: geometry.store,
          }),
        {initialProps: {items: data, rowKeys: keys}},
      );
      const focus = vi.spyOn(viewport, 'focus');
      const win = doc.defaultView as typeof window;
      doc.dispatchEvent(
        modality === 'pointer'
          ? new win.Event('pointerdown', {bubbles: true})
          : new win.KeyboardEvent('keydown', {key: 'Tab', bubbles: true}),
      );
      control.focus();
      act(() => view.result.current.onRowFocus('row-80', control));
      control.remove();
      view.rerender({
        items: data.filter(item => item.id !== 'row-80'),
        rowKeys: keys.filter(key => key !== 'row-80'),
      });
      expect(doc.activeElement).toBe(viewport);
      expect(focus).toHaveBeenCalledWith(
        modality === 'pointer'
          ? {preventScroll: true, focusVisible: false}
          : {preventScroll: true},
      );
      viewport.blur();
      view.unmount();
      iframe.remove();
    },
  );
  it('subscribes once, publishes bounded ranges and preserves no-op segment identity', () => {
    const geometry = source();
    const viewport = nullRef<HTMLDivElement>();
    const body = nullRef<HTMLTableSectionElement>();
    const table = nullRef<HTMLTableElement>();
    const {result, rerender, unmount} = renderHook(() => {
      const capability = useTableRowsVirtualization({
        rowHeight: 20,
        initialViewportHeight: 100,
      });
      return useTableWindow({
        capability,
        data,
        keys,
        isAdmitted: true,
        viewport,
        body,
        table,
        geometry: geometry.store,
      });
    });
    expect(mounted(result.current.segments)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    act(() =>
      geometry.publish({
        viewportHeight: 100,
        scrollTop: 210,
        bodyOffset: 0,
        isMeasured: true,
      }),
    );
    expect(mounted(result.current.segments)).toEqual(
      Array.from({length: 14}, (_, i) => i + 6),
    );
    const segments = result.current.segments;
    act(() =>
      geometry.publish({
        viewportHeight: 100,
        scrollTop: 211,
        bodyOffset: 0,
        isMeasured: true,
      }),
    );
    expect(result.current.segments).toBe(segments);
    rerender();
    expect(result.current.segments).toBe(segments);
    expect(geometry.store.subscribe).toHaveBeenCalledTimes(1);
    act(() => geometry.publish(seed));
    expect(result.current.segments).toBe(segments);
    unmount();
    expect(geometry.listeners.size).toBe(0);
  });
  it('retains one canonical focused row and releases it on genuine departure', () => {
    const geometry = source({
      viewportHeight: 100,
      scrollTop: 400,
      bodyOffset: 0,
      isMeasured: true,
    });
    const refs = {
      viewport: nullRef<HTMLDivElement>(),
      body: nullRef<HTMLTableSectionElement>(),
      table: nullRef<HTMLTableElement>(),
    };
    const {result} = renderHook(() =>
      useTableWindow({
        capability: useTableRowsVirtualization({
          rowHeight: 20,
          initialViewportHeight: 100,
        }),
        data,
        keys,
        isAdmitted: true,
        ...refs,
        geometry: geometry.store,
      }),
    );
    act(() => result.current.onRowFocus('row-80'));
    expect(mounted(result.current.segments)).toEqual([
      ...Array.from({length: 13}, (_, i) => i + 16),
      80,
    ]);
    act(() => result.current.onRowFocus('row-90'));
    expect(mounted(result.current.segments).filter(i => i >= 80)).toEqual([90]);
    act(() => result.current.onRowBlur());
    expect(mounted(result.current.segments)).toEqual(
      Array.from({length: 13}, (_, i) => i + 16),
    );
  });
  it('reconciles first-visible keys on changed data without a per-scroll data scan', () => {
    const geometry = source({
      viewportHeight: 100,
      scrollTop: 210,
      bodyOffset: 0,
      isMeasured: true,
    });
    const refs = {
      viewport: nullRef<HTMLDivElement>(),
      body: nullRef<HTMLTableSectionElement>(),
      table: nullRef<HTMLTableElement>(),
    };
    const {result, rerender} = renderHook(
      ({items, rowKeys}) =>
        useTableWindow({
          capability: useTableRowsVirtualization({
            rowHeight: 20,
            initialViewportHeight: 100,
          }),
          data: items,
          keys: rowKeys,
          isAdmitted: true,
          ...refs,
          geometry: geometry.store,
        }),
      {initialProps: {items: data, rowKeys: keys}},
    );
    const inserted = {
      items: [{id: 'new', label: 'New'}, ...data],
      rowKeys: ['new', ...keys],
    };
    rerender(inserted);
    expect(mounted(result.current.segments)).toEqual(
      Array.from({length: 14}, (_, i) => i + 7),
    );
    const anchored = result.current.segments;
    rerender(inserted);
    expect(result.current.segments).toBe(anchored);
    act(() =>
      geometry.publish({
        viewportHeight: 100,
        scrollTop: 230,
        bodyOffset: 0,
        isMeasured: true,
      }),
    );
    expect(result.current.segments).toBe(anchored);
  });
  it.each([false, true])(
    'keeps a reordered anchor through viewport handoff and releases it after acknowledgement (StrictMode: %s)',
    isStrict => {
      const measured: TableWindowGeometry = Object.freeze({
        viewportHeight: 100,
        scrollTop: 210,
        bodyOffset: 0,
        isMeasured: true,
      });
      const geometry = source(measured);
      const firstViewport = document.createElement('div');
      const nextViewport = document.createElement('div');
      firstViewport.scrollTop = measured.scrollTop;
      const refs = {
        viewport: {current: firstViewport},
        body: nullRef<HTMLTableSectionElement>(),
        table: nullRef<HTMLTableElement>(),
      };
      const onCommit = vi.fn();
      const {result, rerender, unmount} = renderHook(
        ({items, rowKeys}) =>
          useTableWindow({
            capability: useTableRowsVirtualization({
              rowHeight: 20,
              initialViewportHeight: 100,
            }),
            data: items,
            keys: rowKeys,
            isAdmitted: true,
            ...refs,
            geometry: geometry.store,
          }),
        {
          initialProps: {items: data, rowKeys: keys},
          wrapper: ({children}) => {
            const content = (
              <Profiler id="window" onRender={onCommit}>
                {children}
              </Profiler>
            );
            return isStrict ? <StrictMode>{content}</StrictMode> : content;
          },
        },
      );
      // Move the first-visible key to index 30, retaining its half-row offset.
      const items = data.filter(item => item.id !== 'row-10');
      items.splice(30, 0, data[10]);
      const reordered = {items, rowKeys: items.map(item => item.id)};
      rerender(reordered);
      expect(firstViewport.scrollTop).toBe(610);
      expect(mounted(result.current.segments)).toEqual(
        Array.from({length: 14}, (_, index) => index + 26),
      );
      const anchored = result.current.segments;
      // A DOM resource handoff must not choose a different rendered range while
      // the parent geometry source still holds the pre-anchor snapshot.
      refs.viewport.current = nextViewport;
      for (let index = 0; index < 3; index++) {
        onCommit.mockClear();
        rerender(reordered);
        expect(result.current.segments).toBe(anchored);
        expect(onCommit).toHaveBeenCalledTimes(1);
      }
      expect(nextViewport.scrollTop).toBe(610);
      act(() => geometry.publish(Object.freeze({...measured, scrollTop: 610})));
      expect(result.current.segments).toBe(anchored);
      // Once acknowledged, an actual user scroll back to the original coordinate
      // is not mistaken for the old pending anchor.
      act(() => geometry.publish(Object.freeze({...measured})));
      expect(mounted(result.current.segments)).toEqual(
        Array.from({length: 14}, (_, index) => index + 6),
      );
      expect(geometry.listeners.size).toBe(1);
      unmount();
      expect(geometry.listeners.size).toBe(0);
    },
  );
  it('keeps the latest key and fraction through successive pitch changes, removal and lost measurement without following appended rows', () => {
    const measured: TableWindowGeometry = Object.freeze({
      viewportHeight: 100,
      scrollTop: 250,
      bodyOffset: 40,
      isMeasured: true,
    });
    const geometry = source(measured);
    const viewport = document.createElement('div');
    viewport.scrollTop = measured.scrollTop;
    const refs = {
      viewport: {current: viewport},
      body: nullRef<HTMLTableSectionElement>(),
      table: nullRef<HTMLTableElement>(),
    };
    const {result, rerender, unmount} = renderHook(
      ({items, rowKeys, rowHeight}) =>
        useTableWindow({
          capability: useTableRowsVirtualization({
            rowHeight,
            initialViewportHeight: 100,
          }),
          data: items,
          keys: rowKeys,
          isAdmitted: true,
          ...refs,
          geometry: geometry.store,
        }),
      {
        initialProps: {items: data, rowKeys: keys, rowHeight: 20},
        wrapper: StrictMode,
      },
    );
    const items = data.filter(item => item.id !== 'row-10');
    items.splice(30, 0, data[10]);
    const reordered = {
      items,
      rowKeys: items.map(item => item.id),
      rowHeight: 20,
    };
    rerender(reordered);
    expect(viewport.scrollTop).toBe(650);
    // The next data/config commit precedes the geometry acknowledgement.
    rerender({...reordered, rowHeight: 40});
    expect(viewport.scrollTop).toBe(1260);
    const remaining = items.filter(item => item.id !== 'row-10');
    const removed = {
      items: remaining,
      rowKeys: remaining.map(item => item.id),
      rowHeight: 40,
    };
    rerender(removed);
    expect(viewport.scrollTop).toBe(1260);
    expect(removed.rowKeys[30]).toBe('row-31');
    expect(mounted(result.current.segments)).toEqual(
      Array.from({length: 11}, (_, index) => index + 26),
    );
    act(() => geometry.publish(Object.freeze({...measured, scrollTop: 1260})));
    const anchored = result.current.segments;
    act(() => geometry.publish(seed));
    expect(result.current.segments).toBe(anchored);
    const appended = [...remaining, {id: 'appended', label: 'Appended'}];
    rerender({
      items: appended,
      rowKeys: appended.map(item => item.id),
      rowHeight: 40,
    });
    expect(viewport.scrollTop).toBe(1260);
    expect(mounted(result.current.segments)).toEqual(mounted(anchored));
    unmount();
    expect(geometry.listeners.size).toBe(0);
  });
  it('replaces a pending anchor when data reverts to the original scroll coordinate before acknowledgement', () => {
    const measured: TableWindowGeometry = Object.freeze({
      viewportHeight: 100,
      scrollTop: 210,
      bodyOffset: 0,
      isMeasured: true,
    });
    const geometry = source(measured);
    const viewport = document.createElement('div');
    viewport.scrollTop = measured.scrollTop;
    const refs = {
      viewport: {current: viewport},
      body: nullRef<HTMLTableSectionElement>(),
      table: nullRef<HTMLTableElement>(),
    };
    const original = {items: data, rowKeys: keys};
    const {result, rerender, unmount} = renderHook(
      ({items, rowKeys}) =>
        useTableWindow({
          capability: useTableRowsVirtualization({
            rowHeight: 20,
            initialViewportHeight: 100,
          }),
          data: items,
          keys: rowKeys,
          isAdmitted: true,
          ...refs,
          geometry: geometry.store,
        }),
      {initialProps: original, wrapper: StrictMode},
    );
    const items = data.filter(item => item.id !== 'row-10');
    items.splice(30, 0, data[10]);
    rerender({items, rowKeys: items.map(item => item.id)});
    expect(viewport.scrollTop).toBe(610);
    rerender(original);
    expect(viewport.scrollTop).toBe(210);
    expect(mounted(result.current.segments)).toEqual(
      Array.from({length: 14}, (_, index) => index + 6),
    );
    act(() => geometry.publish(Object.freeze({...measured})));
    act(() => geometry.publish(Object.freeze({...measured, scrollTop: 610})));
    expect(mounted(result.current.segments)).toEqual(
      Array.from({length: 14}, (_, index) => index + 26),
    );
    unmount();
    expect(geometry.listeners.size).toBe(0);
  });
  it('preserves the visible anchor when a batch is appended below trailing loading content', () => {
    const items = data.slice(0, 40);
    const geometry = source(
      Object.freeze({
        viewportHeight: 400,
        scrollTop: 1935,
        bodyOffset: 38,
        isMeasured: true,
        scrollHeight: 2335,
      }),
    );
    const viewport = document.createElement('div');
    viewport.scrollTop = 1935;
    const {result, rerender} = renderHook(
      ({items}) => {
        const keys = useMemo(() => items.map(item => item.id), [items]);
        return useTableWindow({
          capability: useTableRowsVirtualization({
            rowHeight: 56,
            initialViewportHeight: 400,
          }),
          data: items,
          keys,
          isAdmitted: true,
          viewport: {current: viewport},
          body: nullRef<HTMLTableSectionElement>(),
          table: nullRef<HTMLTableElement>(),
          geometry: geometry.store,
        });
      },
      {initialProps: {items}},
    );
    const before = mounted(result.current.segments);
    rerender({items: data.slice(0, 60)});
    expect(viewport.scrollTop).toBe(1935);
    expect(mounted(result.current.segments).slice(0, before.length)).toEqual(
      before,
    );
  });
  it('does not attach geometry subscriptions for rejected admission or invalid sizes', () => {
    const geometry = source();
    const refs = {
      viewport: nullRef<HTMLDivElement>(),
      body: nullRef<HTMLTableSectionElement>(),
      table: nullRef<HTMLTableElement>(),
    };
    const {result} = renderHook(() =>
      useTableWindow({
        capability: useTableRowsVirtualization({
          rowHeight: 0,
          initialViewportHeight: 100,
        }),
        data,
        keys,
        isAdmitted: false,
        ...refs,
        geometry: geometry.store,
      }),
    );
    expect(result.current.isFixedHeight).toBe(false);
    expect(mounted(result.current.segments)).toHaveLength(100);
    expect(geometry.store.subscribe).not.toHaveBeenCalled();
  });
  it('bounds identity work to changed keys at both 1k and 100k, never per scroll', () => {
    for (const count of [1000, 100000]) {
      const items = Array.from({length: count}, (_, index) => ({
        id: `key-${index}`,
        label: `Label ${index}`,
      }));
      let reads = 0;
      const rowKeys = new Proxy(
        items.map(item => item.id),
        {
          // eslint-disable-next-line @typescript-eslint/promise-function-async -- Proxy property access is synchronous even when its value is unknown
          get(target, property, receiver): unknown {
            if (typeof property === 'string' && /^\d+$/.test(property)) {
              reads++;
            }
            return Reflect.get(target, property, receiver);
          },
        },
      );
      const geometry = source({
        viewportHeight: 100,
        scrollTop: 0,
        bodyOffset: 0,
        isMeasured: true,
      });
      const refs = {
        viewport: nullRef<HTMLDivElement>(),
        body: nullRef<HTMLTableSectionElement>(),
        table: nullRef<HTMLTableElement>(),
      };
      const {result, unmount} = renderHook(() =>
        useTableWindow({
          capability: useTableRowsVirtualization({
            rowHeight: 20,
            initialViewportHeight: 100,
          }),
          data: items,
          keys: rowKeys,
          isAdmitted: true,
          ...refs,
          geometry: geometry.store,
        }),
      );
      expect(reads).toBe(count);
      reads = 0;
      for (const scrollTop of [10, 400, 1000, 2000]) {
        act(() =>
          geometry.publish({
            viewportHeight: 100,
            scrollTop,
            bodyOffset: 0,
            isMeasured: true,
          }),
        );
      }
      expect(reads).toBe(0);
      expect(mounted(result.current.segments).length).toBeLessThanOrEqual(14);
      unmount();
      expect(geometry.listeners.size).toBe(0);
    }
  });
  it('returns removed detached focus to the viewport, restores temporary focusability, and never steals a successor', () => {
    const viewport = document.createElement('div');
    viewport.setAttribute('role', 'group');
    viewport.setAttribute('aria-label', 'Rows');
    document.body.append(viewport);
    const successor = document.createElement('button');
    document.body.append(successor);
    const geometry = source();
    const table = document.createElement('table');
    const body = document.createElement('tbody');
    const focusedRow = document.createElement('tr');
    const cell = document.createElement('td');
    const control = document.createElement('button');
    cell.append(control);
    focusedRow.append(cell);
    body.append(focusedRow);
    table.append(body);
    viewport.append(table);
    const refs = {
      viewport: {current: viewport},
      body: {current: body},
      table: {current: table},
    };
    const {result, rerender, unmount} = renderHook(
      ({items, rowKeys}) =>
        useTableWindow({
          capability: useTableRowsVirtualization({
            rowHeight: 20,
            initialViewportHeight: 100,
          }),
          data: items,
          keys: rowKeys,
          isAdmitted: true,
          ...refs,
          geometry: geometry.store,
        }),
      {initialProps: {items: data, rowKeys: keys}},
    );
    control.focus();
    act(() => result.current.onRowFocus('row-80'));
    control.remove();
    rerender({
      items: data.filter(item => item.id !== 'row-80'),
      rowKeys: keys.filter(key => key !== 'row-80'),
    });
    expect(document.activeElement).toBe(viewport);
    expect(viewport).toHaveAttribute('tabindex', '-1');
    rerender({items: data, rowKeys: keys});
    expect(mounted(result.current.segments)).not.toContain(80);
    expect(document.activeElement).toBe(viewport);
    successor.focus();
    expect(viewport).not.toHaveAttribute('tabindex');
    cell.append(control);
    control.focus();
    act(() => result.current.onRowFocus('row-90'));
    successor.focus();
    control.remove();
    rerender({
      items: data.filter(item => item.id !== 'row-90'),
      rowKeys: keys.filter(key => key !== 'row-90'),
    });
    expect(document.activeElement).toBe(successor);
    expect(viewport).not.toHaveAttribute('tabindex');
    unmount();
    viewport.remove();
    successor.remove();
  });
  it('latches actual mounted extent violations, unsubscribes, and retries only changed admission inputs', () => {
    const viewport = document.createElement('div');
    const table = document.createElement('table');
    const body = document.createElement('tbody');
    table.append(body);
    viewport.append(table);
    document.body.append(viewport);
    Object.defineProperty(viewport, 'clientHeight', {value: 100});
    let height = 1500;
    vi.spyOn(body, 'getBoundingClientRect').mockImplementation(
      () => ({height}) as DOMRect,
    );
    const geometry = source({
      viewportHeight: 100,
      scrollTop: 0,
      bodyOffset: 0,
      isMeasured: true,
    });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const refs = {
      viewport: {current: viewport},
      body: {current: body},
      table: {current: table},
    };
    const {result, rerender, unmount} = renderHook(
      ({items, rowKeys}) =>
        useTableWindow({
          capability: useTableRowsVirtualization({
            rowHeight: 20,
            initialViewportHeight: 100,
          }),
          data: items,
          keys: rowKeys,
          isAdmitted: true,
          ...refs,
          geometry: geometry.store,
        }),
      {initialProps: {items: data, rowKeys: keys}},
    );
    expect(result.current.isWindowed).toBe(false);
    expect(geometry.listeners.size).toBe(0);
    expect(warning).toHaveBeenCalledTimes(1);
    height = 2000;
    rerender({items: data, rowKeys: keys});
    expect(result.current.isWindowed).toBe(false);
    rerender({items: [...data], rowKeys: [...keys]});
    expect(result.current.isWindowed).toBe(true);
    expect(geometry.listeners.size).toBe(1);
    unmount();
    viewport.remove();
    warning.mockRestore();
  });
  it('reads no mounted-row layout on a scroll or a content change and re-checks every row after a layout change', () => {
    const viewport = document.createElement('div');
    const table = document.createElement('table');
    const body = document.createElement('tbody');
    const row = document.createElement('tr');
    body.append(row);
    table.append(body);
    viewport.append(table);
    document.body.append(viewport);
    Object.defineProperty(viewport, 'clientHeight', {value: 100});
    const bodyRect = vi
      .spyOn(body, 'getBoundingClientRect')
      .mockImplementation(() => ({height: 2000}) as DOMRect);
    const rowRect = vi
      .spyOn(row, 'getBoundingClientRect')
      .mockImplementation(() => ({height: 20}) as DOMRect);
    const measured = {
      viewportHeight: 100,
      bodyOffset: 0,
      isMeasured: true,
    };
    const geometry = source({
      ...measured,
      scrollTop: 0,
      revision: 1,
      layoutRevision: 1,
    });
    const {result, unmount} = renderHook(() =>
      useTableWindow({
        capability: useTableRowsVirtualization({
          rowHeight: 20,
          initialViewportHeight: 100,
        }),
        data,
        keys,
        isAdmitted: true,
        viewport: {current: viewport},
        body: {current: body},
        table: {current: table},
        geometry: geometry.store,
      }),
    );
    expect(result.current.isWindowed).toBe(true);
    const rowReads = rowRect.mock.calls.length;
    const bodyReads = bodyRect.mock.calls.length;
    expect(rowReads).toBeGreaterThan(0);
    const publish = (scrollTop: number, revision: number, layout: number) =>
      act(() =>
        geometry.publish({
          ...measured,
          scrollTop,
          revision,
          layoutRevision: layout,
        }),
      );
    publish(4, 1, 1);
    publish(8, 1, 1);
    expect(rowRect).toHaveBeenCalledTimes(rowReads);
    expect(bodyRect).toHaveBeenCalledTimes(bodyReads);
    // A mounted row is a content change: rows that passed are not read again.
    publish(8, 2, 1);
    expect(rowRect).toHaveBeenCalledTimes(rowReads);
    expect(bodyRect).toHaveBeenCalledTimes(bodyReads);
    // A font, size or outer style change can clip rows that passed before.
    publish(8, 3, 2);
    expect(bodyRect.mock.calls.length).toBeGreaterThan(bodyReads);
    expect(rowRect.mock.calls.length).toBeGreaterThan(rowReads);
    unmount();
    viewport.remove();
  });
  it('sizes a logical-position column from canvas text metrics without a layout read or DOM write', () => {
    const measureText = vi.fn((text: string) => ({width: text.length * 7}));
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return {font: '', measureText};
        }
      },
    );
    const viewport = document.createElement('div');
    const table = document.createElement('table');
    const body = document.createElement('tbody');
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    const number = document.createElement('span');
    number.textContent = '1';
    number.style.fontSize = '12px';
    number.style.fontFamily = 'monospace';
    cell.style.paddingLeft = '12px';
    cell.style.paddingRight = '12px';
    cell.append(number);
    row.append(cell);
    body.append(row);
    table.append(body);
    viewport.append(table);
    document.body.append(viewport);
    Object.defineProperty(viewport, 'clientHeight', {value: 100});
    vi.spyOn(body, 'getBoundingClientRect').mockImplementation(
      () => ({height: 2000}) as DOMRect,
    );
    vi.spyOn(row, 'getBoundingClientRect').mockImplementation(
      () => ({height: 20}) as DOMRect,
    );
    const numberRect = vi.spyOn(number, 'getBoundingClientRect');
    const cellWrites = vi.spyOn(cell, 'append');
    const positions = new Set([0]);
    const measured = {viewportHeight: 100, bodyOffset: 0, isMeasured: true};
    const geometry = source({
      ...measured,
      scrollTop: 0,
      revision: 1,
      layoutRevision: 1,
    });
    const {result, unmount} = renderHook(() =>
      useTableWindow({
        capability: useTableRowsVirtualization({
          rowHeight: 20,
          initialViewportHeight: 100,
        }),
        data,
        keys,
        isAdmitted: true,
        logicalPositionColumns: positions,
        viewport: {current: viewport},
        body: {current: body},
        table: {current: table},
        geometry: geometry.store,
      }),
    );
    // '100' at 7px per digit, 24px of padding and 1px of slack.
    expect(result.current.logicalPositionWidths.get(0)).toBe(46);
    expect(measureText).toHaveBeenLastCalledWith('100');
    expect(numberRect).not.toHaveBeenCalled();
    expect(cellWrites).not.toHaveBeenCalled();
    const calls = measureText.mock.calls.length;
    const publish = (scrollTop: number, revision: number, layout: number) =>
      act(() =>
        geometry.publish({
          ...measured,
          scrollTop,
          revision,
          layoutRevision: layout,
        }),
      );
    // A scroll or a content change does not measure again; a layout change does.
    publish(4, 1, 1);
    publish(4, 2, 1);
    expect(measureText).toHaveBeenCalledTimes(calls);
    publish(4, 3, 2);
    expect(measureText.mock.calls.length).toBeGreaterThan(calls);
    unmount();
    viewport.remove();
    vi.unstubAllGlobals();
  });
  it('checks the body extent after a row-number width changes at mount', () => {
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return {
            font: '',
            measureText: (text: string) => ({width: text.length * 7}),
          };
        }
      },
    );
    const viewport = document.createElement('div');
    const table = document.createElement('table');
    const body = document.createElement('tbody');
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    const number = document.createElement('span');
    number.textContent = '1';
    number.style.fontSize = '12px';
    number.style.fontFamily = 'monospace';
    cell.append(number);
    row.append(cell);
    body.append(row);
    table.append(body);
    viewport.append(table);
    document.body.append(viewport);
    Object.defineProperty(viewport, 'clientHeight', {value: 100});
    // 100 rows of 20px need a 2,000px body; this one cannot hold them.
    vi.spyOn(body, 'getBoundingClientRect').mockImplementation(
      () => ({height: 1234}) as DOMRect,
    );
    vi.spyOn(row, 'getBoundingClientRect').mockImplementation(
      () => ({height: 20}) as DOMRect,
    );
    const positions = new Set([0]);
    const geometry = source({
      viewportHeight: 100,
      bodyOffset: 0,
      isMeasured: true,
      scrollTop: 0,
      revision: 1,
      layoutRevision: 1,
    });
    const {result, unmount} = renderHook(() =>
      useTableWindow({
        capability: useTableRowsVirtualization({
          rowHeight: 20,
          initialViewportHeight: 100,
        }),
        data,
        keys,
        isAdmitted: true,
        logicalPositionColumns: positions,
        viewport: {current: viewport},
        body: {current: body},
        table: {current: table},
        geometry: geometry.store,
      }),
    );
    expect(result.current.isWindowed).toBe(false);
    unmount();
    viewport.remove();
    vi.unstubAllGlobals();
  });
  it('cleans the parent source subscription across StrictMode replay', () => {
    const geometry = source();
    const refs = {
      viewport: nullRef<HTMLDivElement>(),
      body: nullRef<HTMLTableSectionElement>(),
      table: nullRef<HTMLTableElement>(),
    };
    const {unmount} = renderHook(
      () =>
        useTableWindow({
          capability: useTableRowsVirtualization({
            rowHeight: 20,
            initialViewportHeight: 100,
          }),
          data,
          keys,
          isAdmitted: true,
          ...refs,
          geometry: geometry.store,
        }),
      {wrapper: StrictMode},
    );
    expect(geometry.listeners.size).toBe(1);
    unmount();
    expect(geometry.listeners.size).toBe(0);
  });
});
