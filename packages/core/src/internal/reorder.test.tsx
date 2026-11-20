// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reorder.test.tsx
 * @input Core's internal reorder entry: a reorderable object's options, and
 *   List's reorder session run over rows that are not ListItems
 * @output Proof that the session reorders a list whose rows hold their own
 *   content: rows of any tag, with the handle anywhere inside each. It reports
 *   each move to the object and keeps a rejected row in place. The options
 *   read back as the object was made with them. The entry loads no reorder
 *   code: the handle comes with the object
 * @position Testing for packages/core/src/internal/reorder.ts as Lab's
 *   ListInput and TransferList use it
 */

import {readFileSync} from 'node:fs';
import {useId, useRef, useState, type Key, type ReactNode} from 'react';
import {describe, expect, it, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {createReorderable} from '../reorderable/createReorderable';
import {
  ListReorderScope,
  reorderableOptions,
  useListReorderScope,
} from './reorder';

describe("Core's internal reorder entry", () => {
  it('reads back the options a reorderable object was made with', () => {
    const onReorder = vi.fn();
    const isReorderable = (key: Key) => key !== 'pinned';
    const options = reorderableOptions(
      createReorderable({onReorder, isReorderable}),
    );
    expect(options.onReorder).toBe(onReorder);
    expect(options.isReorderable).toBe(isReorderable);
  });

  it('reorders rows that hold their own content, and keeps a rejected row in place', async () => {
    const onReorder = vi.fn();
    function Records(): ReactNode {
      const listRef = useRef<HTMLOListElement>(null);
      const hintId = useId();
      const [items, setItems] = useState(['Alpha', 'Beta', 'Gamma']);
      const [reorderable] = useState(() =>
        createReorderable({
          onReorder: move => {
            onReorder(move);
            setItems(current => {
              const rest = current.filter(item => item !== move.key);
              return [
                ...rest.slice(0, move.to),
                String(move.key),
                ...rest.slice(move.to),
              ];
            });
          },
          isReorderable: key => key !== 'Gamma',
        }),
      );
      const scope = useListReorderScope(
        reorderable,
        () => listRef.current,
        hintId,
      );
      const Handle = scope?.session.Handle;
      return (
        <ListReorderScope reorder={scope}>
          <ol ref={listRef}>
            {items.map(item => (
              <li key={item}>
                <input aria-label={`${item} name`} defaultValue={item} />
                {item === 'Gamma' || Handle == null ? null : (
                  <span>
                    <Handle label={item} itemKey={item} />
                  </span>
                )}
              </li>
            ))}
          </ol>
        </ListReorderScope>
      );
    }
    const user = userEvent.setup();
    render(<Records />);
    const handle = screen.getByRole('button', {name: 'Reorder Alpha'});
    // The scope renders the handles' instructions under the id it was given.
    expect(handle).toHaveAccessibleDescription(/Drag to move this item/);
    expect(screen.queryByRole('button', {name: 'Reorder Gamma'})).toBeNull();
    handle.focus();
    await user.keyboard('{Enter}{ArrowDown}');
    expect(onReorder).toHaveBeenLastCalledWith({key: 'Alpha', to: 1});
    // The rejected row bounds the others: Alpha cannot pass Gamma.
    await user.keyboard('{ArrowDown}');
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', {name: 'Reorder Alpha'})).toHaveFocus();
  });

  it('renders its children alone without a reorderable object', () => {
    function Plain(): ReactNode {
      const listRef = useRef<HTMLUListElement>(null);
      const scope = useListReorderScope(
        undefined,
        () => listRef.current,
        'hint',
      );
      const Handle = scope?.session.Handle;
      return (
        <ListReorderScope reorder={scope}>
          <ul ref={listRef}>
            <li>
              Alpha
              {Handle == null ? null : <Handle label="Alpha" itemKey="Alpha" />}
            </li>
          </ul>
        </ListReorderScope>
      );
    }
    render(<Plain />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('loads no reorder code: the entry and the scope import the context and types only', () => {
    for (const file of ['./reorder.ts', '../List/ListReorderScope.tsx']) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      const imports = Array.from(
        source.matchAll(
          /^(?:import|export)\s+(type\s+)?[^;]*?from\s+'([^']+)';/gms,
        ),
        match => ({isType: match[1] != null, from: match[2]}),
      );
      for (const {isType, from} of imports) {
        if (/reorder/i.test(from)) {
          expect(
            isType ||
              from.endsWith('/listReorderContext') ||
              from === './listReorderContext' ||
              from.endsWith('/ListReorderScope'),
            `${file} imports ${from}`,
          ).toBe(true);
        }
      }
    }
  });
});
