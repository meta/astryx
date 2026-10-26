// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListReorderLayout.test.tsx
 * @input List with `reorderable` and an `animatedLayout` handle, Testing
 *   Library
 * @output Proof that a drag's commits are the reorder's own. The layout
 *   updates measure nothing for them, and they measure the list's other
 *   changes
 * @position Tests for List/List.tsx and List/listReorderEngine.tsx
 */

import {useRef, useState, type Key} from 'react';
import {describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {useAnimatedLayout} from '../../hooks/useAnimatedLayout';
import {createReorderable} from '../../reorderable/createReorderable';
import {List} from '../List';
import {ListItem} from '../ListItem';
import type * as LayoutUpdates from '../listLayoutUpdates';
import {MOUSE_DRAG_SLOP} from '../listReorderEngine';

const measureRows = vi.fn();

// The layout updates' measure, observed: List calls it before a change of
// its rows lands.
vi.mock('../listLayoutUpdates', async importOriginal => ({
  ...(await importOriginal<typeof LayoutUpdates>()),
  useListLayoutUpdates: () => measureRows,
}));

function moveKey(items: ReadonlyArray<string>, key: Key, to: number) {
  const next = items.filter(item => item !== key);
  next.splice(to, 0, key as string);
  return next;
}

let addRow: (label: string) => void = () => {};

function AnimatedReorderableRows() {
  const containerRef = useRef<HTMLDivElement>(null);
  const animatedLayout = useAnimatedLayout({containerRef});
  const [items, setItems] = useState<ReadonlyArray<string>>(['A', 'B', 'C']);
  addRow = label => setItems(previous => [...previous, label]);
  return (
    <div ref={containerRef}>
      <List
        animatedLayout={animatedLayout}
        reorderable={createReorderable({
          onReorder: ({key, to}) =>
            setItems(previous => moveKey(previous, key, to)),
        })}>
        {items.map(item => (
          <ListItem key={item} itemKey={item} label={item} />
        ))}
      </List>
    </div>
  );
}

/** jsdom lays nothing out: 44 px rows from 300 px down the viewport. */
function layOut(list: HTMLElement) {
  const place = (row: Element) => Array.from(list.children).indexOf(row);
  for (const row of Array.from(list.children)) {
    Object.defineProperty(row, 'offsetParent', {
      configurable: true,
      get: () => list,
    });
    Object.defineProperty(row, 'offsetTop', {
      configurable: true,
      get: () => place(row) * 44,
    });
    Object.defineProperty(row, 'offsetHeight', {configurable: true, value: 44});
    row.getBoundingClientRect = () =>
      DOMRect.fromRect({
        x: 0,
        y: 300 + place(row) * 44,
        width: 300,
        height: 44,
      });
  }
}

const MOUSE = {pointerType: 'mouse', pointerId: 1, button: 0, clientX: 280};

describe('List reorderable with an animatedLayout handle', () => {
  it("leaves a drag's commit to the reorder, and measures the list's other changes", () => {
    render(<AnimatedReorderableRows />);
    const list = screen.getByRole('list');
    layOut(list);
    // A change that is no reorder's: the layout updates measure it.
    act(() => addRow('D'));
    expect(measureRows).toHaveBeenCalled();
    layOut(list);
    measureRows.mockClear();
    // A drag of A to C's place. Its drop commits the new order.
    const handle = screen.getByRole('button', {name: 'Reorder A'});
    fireEvent.pointerDown(handle, {...MOUSE, clientY: 322});
    fireEvent.pointerMove(handle, {...MOUSE, clientY: 322 + MOUSE_DRAG_SLOP});
    fireEvent.pointerMove(handle, {...MOUSE, clientY: 322 + 70});
    act(() => {
      fireEvent.pointerUp(handle, {...MOUSE, clientY: 322 + 70});
    });
    expect(
      Array.from(list.querySelectorAll('li:not([data-astryx-leaving])')).map(
        row => row.textContent,
      ),
    ).toEqual(['B', 'C', 'A', 'D']);
    expect(measureRows).not.toHaveBeenCalled();
  });
});
