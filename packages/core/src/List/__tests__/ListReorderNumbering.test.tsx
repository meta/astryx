// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListReorderNumbering.test.tsx
 * @input List with `reorderable` (createReorderable) and `listStyle`,
 *   ListItem `itemKey`, Testing Library
 * @output jsdom proof that a mouse still drags a row after the list's
 *   numbering turns on, and after it turns off again. The List renders a new
 *   list element each time.
 * @position Tests for List/listReorderEngine.tsx; the browser proofs are in
 *   ListReorderNumbering.interaction.browser.spec.ts
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {useState, type Key} from 'react';
import {describe, expect, it, vi} from 'vitest';
import {pointerQuery} from '../../gestures/__tests__/pointerQuery';
import {createReorderable} from '../../reorderable/createReorderable';
import {List} from '../List';
import {ListItem} from '../ListItem';
import {MOUSE_DRAG_SLOP} from '../listReorderEngine';

const MOUSE = {pointerType: 'mouse', pointerId: 1, button: 0, clientX: 280};

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

function Rows({
  isNumbered,
  onReorder,
}: {
  isNumbered: boolean;
  onReorder: (move: {key: Key; to: number}) => void;
}) {
  const [rows, setRows] = useState(['A', 'B', 'C']);
  return (
    <List
      listStyle={isNumbered ? 'decimal' : 'none'}
      reorderable={createReorderable({
        onReorder: move => {
          onReorder(move);
          setRows(current => {
            const next = current.filter(row => row !== move.key);
            next.splice(move.to, 0, String(move.key));
            return next;
          });
        },
      })}>
      {rows.map(row => (
        <ListItem key={row} itemKey={row} label={row} />
      ))}
    </List>
  );
}

/** A mouse drags `label`'s handle 70 px down, past two row boundaries. */
function dragTwoDown(label: string) {
  const handle = screen.getByRole('button', {name: `Reorder ${label}`});
  fireEvent.pointerDown(handle, {...MOUSE, clientY: 322});
  fireEvent.pointerMove(handle, {...MOUSE, clientY: 322 + MOUSE_DRAG_SLOP});
  fireEvent.pointerMove(handle, {...MOUSE, clientY: 392});
  act(() => {
    fireEvent.pointerUp(handle, {...MOUSE, clientY: 392});
  });
}

describe('List reorder after the numbering changes', () => {
  it.each([
    ['turns on', [true]],
    ['turns on and off again', [true, false]],
  ])('drags a row with a mouse after the numbering %s', async (_, steps) => {
    const restore = pointerQuery(false).restore;
    try {
      const onReorder = vi.fn();
      const {rerender} = render(
        <Rows isNumbered={false} onReorder={onReorder} />,
      );
      const first = screen.getByRole('list');
      for (const isNumbered of steps) {
        rerender(<Rows isNumbered={isNumbered} onReorder={onReorder} />);
        // The remounted handles' refresh, which finds the new list.
        await act(async () => {
          await Promise.resolve();
        });
      }
      const list = screen.getByRole('list');
      expect(list).not.toBe(first);
      layOut(list);
      dragTwoDown('A');
      expect(onReorder).toHaveBeenCalledWith({key: 'A', to: 2});
    } finally {
      restore();
    }
  });
});
