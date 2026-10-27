// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListReorder.test.tsx
 * @input List with `reorderable` (createReorderable), ListItem `itemKey`,
 *   Testing Library
 * @output jsdom proofs of a reorderable List (spec:AST-103): each row with an
 *   item key gets a named reorder handle described by the list's
 *   instructions; a row without a key, or one `isReorderable` rejects, gets
 *   none, and only such rows at either end bound the others; the handle's
 *   click, Space or Enter toggles reorder mode (`aria-pressed`), in which
 *   each arrow moves the row at once with one report of its key and its
 *   index after the move, announced with its place and neighbours once it
 *   lands, a move into a row that stays at either end is refused and
 *   announced, and Escape, another activation or a lost focus ends the mode,
 *   keeping the moves (the first two announcing where the row is); the object's start(key) enters the same mode from the
 *   app's own UI, keeping it when that UI hands its focus back, and does
 *   nothing but warn for a key that cannot move or is not mounted, or in the
 *   list mounted last for an object on two; a mouse drags past the slop,
 *   and a drag's click
 *   leaves the mode alone; a new object keeps the mode and the next move
 *   calls the latest callback; one object serves two lists apart; the
 *   reorder adds one element to a row and no listener to a row or handle,
 *   and a List without it loads no reorder module
 * @position Tests for List/listReorderEngine.tsx, List/ListReorderHandle.tsx
 *   and reorderable/createReorderable.ts
 */

import {readFileSync} from 'node:fs';
import {useState, type Key} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {ContextMenu} from '../../ContextMenu';
import {List} from '../List';
import {ListItem} from '../ListItem';
import {MOUSE_DRAG_SLOP} from '../listReorderEngine';
import {
  createReorderable,
  type Reorderable,
  type ReorderMove,
} from '../../reorderable';
import {DRAG_SLOP} from '../../DateInput/usePointerDragScroll';
import {useAnnounce} from '../../hooks/useAnnounce';
import {motionRole} from '../../motion/roles';
import {getGestureHost} from '../../gestures/GestureHost';
import {pointerQuery} from '../../gestures/__tests__/pointerQuery';
import {touchMotion} from '../ListReorderTouch';

function moveKey<T extends Key>(
  items: ReadonlyArray<T>,
  key: Key,
  to: number,
): T[] {
  const next = items.filter(item => item !== key);
  next.splice(to, 0, key as T);
  return next;
}

const NONE: ReadonlyArray<string> = [];

function ReorderableRows({
  initial,
  fixed = NONE,
  onReorder,
  isDisabled = NONE,
}: {
  initial: ReadonlyArray<string>;
  fixed?: ReadonlyArray<string>;
  onReorder?: (move: ReorderMove) => void;
  isDisabled?: ReadonlyArray<string>;
}) {
  const [items, setItems] = useState(initial);
  // A new object on every render, as a caller may make it.
  const reorderable = createReorderable({
    onReorder: move => {
      onReorder?.(move);
      setItems(previous => moveKey(previous, move.key, move.to));
    },
    isReorderable: key => !fixed.includes(key as string),
  });
  return (
    <List reorderable={reorderable}>
      {items.map(item => (
        <ListItem
          key={item}
          itemKey={item}
          label={item}
          isDisabled={isDisabled.includes(item)}
        />
      ))}
    </List>
  );
}

/** The primary pointer: coarse (a touch screen) or fine (a mouse). */
let restorePointer: (() => void) | null = null;

/** The primary pointer a test needs (jsdom's is fine), until it ends. */
function stubPrimaryPointer(coarse: boolean) {
  restorePointer?.();
  restorePointer = pointerQuery(coarse).restore;
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

/** A mouse presses `handle` at `from`, moves past the slop, then to `to`. */
function mouseDrag(handle: Element, from: number, to: number) {
  fireEvent.pointerDown(handle, {...MOUSE, clientY: from});
  fireEvent.pointerMove(handle, {...MOUSE, clientY: from + MOUSE_DRAG_SLOP});
  fireEvent.pointerMove(handle, {...MOUSE, clientY: to});
}

/** The rows' labels, without what the reorder draws over them. */
const labels = () =>
  Array.from(document.querySelectorAll('li:not([data-astryx-leaving])')).map(
    row => row.textContent,
  );

const handleOf = (label: string) =>
  screen.getByRole('button', {name: `Reorder ${label}`});

describe('List reorderable', () => {
  // The live region outlives each test: clear it, so one test's message is
  // never read by the next.
  afterEach(() => {
    const {result, unmount} = renderHook(() => useAnnounce());
    act(() => result.current(''));
    unmount();
    restorePointer?.();
    restorePointer = null;
  });

  it('adds no handle and no listener without reorderable', () => {
    render(
      <List>
        <ListItem itemKey="inbox" label="Inbox" />
        <ListItem itemKey="sent" label="Sent" />
      </List>,
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(document.querySelector('[data-astryx-list-reorder]')).toBeNull();
  });

  it('loads no reorder module from List or ListItem: they import its type and context only', () => {
    // spec:AST-103 FR2: the machinery ships with createReorderable.
    for (const file of ['../List.tsx', '../ListItem.tsx']) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      const imports = Array.from(
        source.matchAll(/^import\s+(type\s+)?[^;]*?from\s+'([^']+)';/gms),
        match => ({isType: match[1] != null, from: match[2]}),
      );
      for (const {isType, from} of imports) {
        if (/reorder/i.test(from)) {
          expect(
            isType || from === './listReorderContext',
            `${file} imports ${from}`,
          ).toBe(true);
        }
      }
    }
  });

  it('gives each row with an item key a handle named after it and described by the instructions', () => {
    render(<ReorderableRows initial={['Inbox', 'Sent', 'Drafts']} />);
    const handle = handleOf('Inbox');
    expect(handle).toHaveAttribute('type', 'button');
    expect(handle).toHaveAttribute('aria-pressed', 'false');
    expect(handle).toHaveAccessibleDescription(
      'Drag to move this item, or press Space or Enter, then the arrow keys to move it one place at a time. Press Escape when you are done.',
    );
    expect(screen.getAllByRole('button', {name: /^Reorder /})).toHaveLength(3);
    // The instructions are not shown, and sit outside the list.
    const hint = document.getElementById(
      handle.getAttribute('aria-describedby') ?? '',
    );
    expect(hint).not.toBeNull();
    expect(hint).toHaveAttribute('hidden');
    expect(hint?.closest('ul')).toBeNull();
    expect(screen.getByRole('list').children).toHaveLength(3);
  });

  it('names the handle of a row with a rich label after its text, and of one that shows no text after its place', async () => {
    render(
      <List reorderable={createReorderable({onReorder: () => {}})}>
        <ListItem itemKey="inbox" label="Inbox" />
        <ListItem
          itemKey="sent"
          label={
            <span>
              <strong>Sent</strong> {'mail'}
            </span>
          }
        />
        <ListItem itemKey="star" label={<svg aria-label="Starred" />} />
      </List>,
    );
    expect(handleOf('Sent mail')).toBeInTheDocument();
    // An icon with its own name names the row through the label element.
    expect(
      await screen.findByRole('button', {name: 'Reorder Starred'}),
    ).toBeInTheDocument();
  });

  it('names the handle "Reorder" then the row label element, for a component label too (spec:AST-103 FR4)', async () => {
    function FieldName({name}: {name: string}) {
      return <span>{name}</span>;
    }
    render(
      <List reorderable={createReorderable({onReorder: () => {}})}>
        <ListItem itemKey="inbox" label="Inbox" />
        <ListItem itemKey="custom" label={<FieldName name="Custom Name" />} />
      </List>,
    );
    expect(handleOf('Inbox')).toBeInTheDocument();
    const custom = await screen.findByRole('button', {
      name: 'Reorder Custom Name',
    });
    // Named by the label element ListItem renders, not by a copied string.
    expect(custom.getAttribute('aria-labelledby')?.split(' ')).toHaveLength(2);
  });

  it("names the handle after the row's own aria-label or aria-labelledby when its caller gave one", async () => {
    render(
      <>
        <span id="row-name">Billing address</span>
        <List reorderable={createReorderable({onReorder: () => {}})}>
          <ListItem itemKey="a" label={<span>A</span>} aria-label="Account" />
          <ListItem
            itemKey="b"
            label={<span>B</span>}
            aria-labelledby="row-name"
          />
        </List>
      </>,
    );
    expect(handleOf('Account')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', {name: 'Reorder Billing address'}),
    ).toBeInTheDocument();
  });

  it('names the handle of a row that shows no text and has no name after its place, and warns in development', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <List reorderable={createReorderable({onReorder: () => {}})}>
        <ListItem itemKey="inbox" label="Inbox" />
        <ListItem itemKey="dot" label={<svg aria-hidden="true" />} />
        <ListItem itemKey="star" label={<svg aria-label="Starred" />} />
      </List>,
    );
    expect(
      await screen.findByRole('button', {name: 'Reorder item 2'}),
    ).toBeInTheDocument();
    // Only the nameless row warns, once.
    const nameless = warn.mock.calls.filter(([message]) =>
      String(message).includes('A reorderable row has no accessible name'),
    );
    expect(nameless).toHaveLength(1);
    warn.mockRestore();
  });

  it('does not warn about a nameless reorderable row in production', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const {List: ProdList} = await import('../List');
      const {ListItem: ProdListItem} = await import('../ListItem');
      const {createReorderable: prodCreate} =
        await import('../../reorderable/createReorderable');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      render(
        <ProdList reorderable={prodCreate({onReorder: () => {}})}>
          <ProdListItem itemKey="dot" label={<svg aria-hidden="true" />} />
        </ProdList>,
      );
      expect(
        await screen.findByRole('button', {name: 'Reorder item 1'}),
      ).toBeInTheDocument();
      expect(
        warn.mock.calls.some(([message]) =>
          String(message).includes('A reorderable row has no accessible name'),
        ),
      ).toBe(false);
      warn.mockRestore();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("gives a finger's target as an invisible hit layer, not a bigger handle: the hit area writes its insets where the primary pointer is coarse", async () => {
    stubPrimaryPointer(true);
    render(<ReorderableRows initial={['A', 'B']} />);
    const handle = handleOf('A');
    await waitFor(() =>
      expect(handle.style.getPropertyValue('--astryx-hit-inset-top')).toMatch(
        /px$/,
      ),
    );
    for (const side of ['right', 'bottom', 'left']) {
      expect(
        handle.style.getPropertyValue(`--astryx-hit-inset-${side}`),
        side,
      ).toMatch(/px$/);
    }
  });

  it("starts the hit area's observers only where the primary pointer is coarse (spec:AST-094 FR24)", () => {
    const observed: Element[] = [];
    class Recording {
      observe(target: Element) {
        observed.push(target);
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    vi.stubGlobal('IntersectionObserver', Recording);
    vi.stubGlobal('ResizeObserver', Recording);
    const resizes = vi.spyOn(window, 'addEventListener');
    try {
      stubPrimaryPointer(false);
      const fine = render(<ReorderableRows initial={['A', 'B']} />);
      expect(observed).not.toContain(handleOf('A'));
      expect(resizes.mock.calls.filter(([type]) => type === 'resize')).toEqual(
        [],
      );
      fine.unmount();
      // The positive control: under a finger it watches the handle.
      stubPrimaryPointer(true);
      render(<ReorderableRows initial={['A', 'B']} />);
      expect(observed).toContain(handleOf('A'));
    } finally {
      resizes.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('adds one element to a row, the handle, whose lines are a pseudo-element', () => {
    const rows = (reorderable?: Reorderable) => (
      <List reorderable={reorderable}>
        <ListItem itemKey="inbox" label="Inbox" endContent={<span>3</span>} />
      </List>
    );
    const {rerender} = render(rows());
    const row = screen.getByText('Inbox').closest('li') as HTMLElement;
    const before = row.querySelectorAll('*').length;
    rerender(rows(createReorderable({onReorder: () => {}})));
    expect(row.querySelectorAll('*').length).toBe(before + 1);
    const handle = handleOf('Inbox');
    expect(handle.children).toHaveLength(0);
    expect(handle.textContent).toBe('');
  });

  it('keeps a row the object rejects in place: no handle, and nothing added to it', () => {
    const rows = (reorderable?: Reorderable) => (
      <List reorderable={reorderable}>
        <ListItem itemKey="inbox" label="Inbox" />
        <ListItem itemKey="trash" label="Trash" endContent={<span>9</span>} />
      </List>
    );
    const {rerender} = render(rows());
    const trash = screen.getByText('Trash').closest('li') as HTMLElement;
    const before = trash.outerHTML;
    rerender(
      rows(
        createReorderable({
          onReorder: () => {},
          isReorderable: key => key !== 'trash',
        }),
      ),
    );
    expect(screen.queryByRole('button', {name: 'Reorder Trash'})).toBeNull();
    expect(handleOf('Inbox')).toBeInTheDocument();
    expect(trash.outerHTML).toBe(before);
  });

  it('keeps a row without an item key in place, and warns in development when no row has one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const warnings = () =>
      warn.mock.calls.filter(([message]) =>
        String(message).includes('`itemKey`'),
      );
    const {unmount} = render(
      <List reorderable={createReorderable({onReorder: () => {}})}>
        <ListItem itemKey="inbox" label="Inbox" />
        <ListItem label="Sent" />
      </List>,
    );
    expect(screen.queryByRole('button', {name: 'Reorder Sent'})).toBeNull();
    expect(handleOf('Inbox')).toBeInTheDocument();
    expect(warnings()).toHaveLength(0);
    unmount();
    render(
      <List reorderable={createReorderable({onReorder: () => {}})}>
        <ListItem label="Sent" />
        <ListItem label="Drafts" />
      </List>,
    );
    expect(warnings()).toHaveLength(1);
    warn.mockRestore();
  });

  it.each([
    ['Space', ' '],
    ['Enter', '{Enter}'],
  ])(
    'turns reorder mode on with %s: each arrow moves the row at once, reported and announced with its place and neighbours',
    async (_, press) => {
      const user = userEvent.setup();
      const onReorder = vi.fn();
      render(
        <ReorderableRows
          initial={['Inbox', 'Sent', 'Drafts']}
          onReorder={onReorder}
        />,
      );
      const handle = handleOf('Inbox');
      expect(handle).toHaveAttribute('aria-pressed', 'false');
      handle.focus();
      await user.keyboard(press);
      expect(handle).toHaveAttribute('aria-pressed', 'true');
      await user.keyboard('{ArrowDown}');
      expect(onReorder).toHaveBeenCalledTimes(1);
      expect(onReorder).toHaveBeenLastCalledWith({key: 'Inbox', to: 1});
      expect(labels()).toEqual(['Sent', 'Inbox', 'Drafts']);
      expect(handle).toHaveFocus();
      expect(handle).toHaveAttribute('aria-pressed', 'true');
      await waitFor(() =>
        expect(document.body).toHaveTextContent(
          'Inbox, position 2 of 3, after Sent, before Drafts',
        ),
      );
      await user.keyboard('{ArrowDown}');
      expect(onReorder).toHaveBeenLastCalledWith({key: 'Inbox', to: 2});
      await waitFor(() =>
        expect(document.body).toHaveTextContent(
          'Inbox, position 3 of 3, after Drafts, at the end',
        ),
      );
      // Past the end: nothing moves.
      await user.keyboard('{ArrowDown}');
      expect(onReorder).toHaveBeenCalledTimes(2);
      await user.keyboard('{ArrowUp}{ArrowUp}');
      expect(onReorder).toHaveBeenCalledTimes(4);
      expect(onReorder).toHaveBeenLastCalledWith({key: 'Inbox', to: 0});
      expect(labels()).toEqual(['Inbox', 'Sent', 'Drafts']);
      await waitFor(() =>
        expect(document.body).toHaveTextContent(
          'Inbox, position 1 of 3, at the top, before Sent',
        ),
      );
      expect(handle).toHaveFocus();
    },
  );

  it('turns reorder mode on with a click, and the arrows move the row', async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    render(
      <ReorderableRows
        initial={['Inbox', 'Sent', 'Drafts']}
        onReorder={onReorder}
      />,
    );
    const handle = handleOf('Sent');
    await user.click(handle);
    expect(handle).toHaveAttribute('aria-pressed', 'true');
    expect(handle).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(onReorder).toHaveBeenCalledWith({key: 'Sent', to: 0});
    expect(labels()).toEqual(['Sent', 'Inbox', 'Drafts']);
  });

  it.each([
    ['Escape', '{Escape}'],
    ['a second activation', ' '],
  ])('leaves reorder mode with %s, keeping its moves', async (_, leave) => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    render(
      <ReorderableRows
        initial={['Inbox', 'Sent', 'Drafts']}
        onReorder={onReorder}
      />,
    );
    const handle = handleOf('Inbox');
    handle.focus();
    await user.keyboard(' {ArrowDown}{ArrowDown}');
    await user.keyboard(leave);
    expect(handle).toHaveAttribute('aria-pressed', 'false');
    expect(handle).toHaveFocus();
    // Kept: two moves, nothing undone, and where the row is announced.
    expect(onReorder).toHaveBeenCalledTimes(2);
    expect(labels()).toEqual(['Sent', 'Drafts', 'Inbox']);
    await waitFor(() =>
      expect(document.body).toHaveTextContent('Done, Inbox at position 3 of 3'),
    );
    // Out of the mode, the arrows move nothing.
    await user.keyboard('{ArrowUp}');
    expect(onReorder).toHaveBeenCalledTimes(2);
  });

  it("marks a key move's new place with the insertion line until the mode ends (design:ordered-collection-reordering)", async () => {
    const user = userEvent.setup();
    render(<ReorderableRows initial={['Inbox', 'Sent', 'Drafts']} />);
    const list = screen.getByRole('list');
    layOut(list);
    const handle = handleOf('Inbox');
    handle.focus();
    await user.keyboard(' ');
    // No line before a move.
    expect(list.querySelector('[data-astryx-reorder-line]')).toBeNull();
    await user.keyboard('{ArrowDown}');
    layOut(list);
    await user.keyboard('{ArrowDown}');
    expect(labels()).toEqual(['Sent', 'Drafts', 'Inbox']);
    const line = list.querySelector<HTMLElement>('[data-astryx-reorder-line]');
    expect(line).not.toBeNull();
    expect(line).not.toHaveAttribute('hidden');
    expect(line).toHaveAttribute('aria-hidden', 'true');
    await user.keyboard('{Escape}');
    expect(list.querySelector('[data-astryx-reorder-line]')).toBeNull();
  });

  it('moves nothing with the arrows outside reorder mode', async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    render(
      <ReorderableRows
        initial={['Inbox', 'Sent', 'Drafts']}
        onReorder={onReorder}
      />,
    );
    handleOf('Inbox').focus();
    await user.keyboard('{ArrowDown}{ArrowUp}');
    expect(onReorder).not.toHaveBeenCalled();
    expect(labels()).toEqual(['Inbox', 'Sent', 'Drafts']);
  });

  it('refuses a move into a row the object rejects at either end, announcing it, and passes one in the middle', async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    render(
      <ReorderableRows
        initial={['Pinned', 'Inbox', 'Sent', 'Locked', 'Drafts', 'Trash']}
        fixed={['Pinned', 'Locked', 'Trash']}
        onReorder={onReorder}
      />,
    );
    handleOf('Inbox').focus();
    await user.keyboard(' {ArrowUp}');
    expect(onReorder).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(document.body).toHaveTextContent("Can't move past Pinned"),
    );
    // Down past Sent, past Locked (in the middle), past Drafts.
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(onReorder).toHaveBeenLastCalledWith({key: 'Inbox', to: 3});
    await waitFor(() =>
      expect(document.body).toHaveTextContent(
        'Inbox, position 4 of 6, after Locked, before Drafts',
      ),
    );
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(onReorder).toHaveBeenCalledTimes(3);
    expect(onReorder).toHaveBeenLastCalledWith({key: 'Inbox', to: 4});
    expect(labels()).toEqual([
      'Pinned',
      'Sent',
      'Locked',
      'Drafts',
      'Inbox',
      'Trash',
    ]);
    await waitFor(() =>
      expect(document.body).toHaveTextContent("Can't move past Trash"),
    );
  });

  it('leaves out the ghost of a removed row still collapsing: places and names count only the rows', async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    render(
      <ReorderableRows
        initial={['Inbox', 'Sent', 'Drafts']}
        onReorder={onReorder}
      />,
    );
    // The update motion keeps a removed row in the list while it collapses.
    const list = screen.getByRole('list');
    const ghost = document.createElement('li');
    ghost.setAttribute('data-astryx-leaving', '');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.textContent = 'Spam';
    list.insertBefore(ghost, list.children[1]);
    handleOf('Drafts').focus();
    await user.keyboard(' {ArrowUp}');
    expect(onReorder).toHaveBeenCalledWith({key: 'Drafts', to: 1});
    await waitFor(() =>
      expect(document.body).toHaveTextContent(
        'Drafts, position 2 of 3, after Inbox, before Sent',
      ),
    );
    // Up again: Inbox, not the ghost, is passed.
    await user.keyboard('{ArrowUp}');
    expect(onReorder).toHaveBeenLastCalledWith({key: 'Drafts', to: 0});
    ghost.remove();
  });

  it('names a row that shows no text after its place', async () => {
    const user = userEvent.setup();
    render(
      <List
        reorderable={createReorderable({
          onReorder: () => {},
          isReorderable: key => key !== 'star',
        })}>
        <ListItem itemKey="star" label={<svg aria-label="Starred" />} />
        <ListItem itemKey="inbox" label="Inbox" />
      </List>,
    );
    handleOf('Inbox').focus();
    await user.keyboard(' {ArrowUp}');
    await waitFor(() =>
      expect(document.body).toHaveTextContent("Can't move past Item 1"),
    );
  });

  it('keeps reorder mode when its handle loses focus: only Escape, Done, the handle or the row going ends it (spec:AST-103 FR4a)', async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    render(
      <ReorderableRows
        initial={['Inbox', 'Sent', 'Drafts']}
        onReorder={onReorder}
      />,
    );
    const handle = handleOf('Inbox');
    handle.focus();
    await user.keyboard(' {ArrowDown}');
    await user.tab();
    expect(handle).not.toHaveFocus();
    expect(handle).toHaveAttribute('aria-pressed', 'true');
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(labels()).toEqual(['Sent', 'Inbox', 'Drafts']);
    // Back on the handle, its arrows move the row again; Escape ends it.
    handle.focus();
    await user.keyboard('{ArrowDown}');
    expect(onReorder).toHaveBeenCalledTimes(2);
    expect(labels()).toEqual(['Sent', 'Drafts', 'Inbox']);
    await user.keyboard('{Escape}');
    expect(handle).toHaveAttribute('aria-pressed', 'false');
  });

  it('ignores arrows with a modifier: they are shortcuts', async () => {
    const onReorder = vi.fn();
    const user = userEvent.setup();
    render(
      <ReorderableRows
        initial={['Inbox', 'Sent', 'Drafts']}
        onReorder={onReorder}
      />,
    );
    handleOf('Inbox').focus();
    await user.keyboard(' {Meta>}{ArrowDown}{/Meta}{Alt>}{ArrowDown}{/Alt}');
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("keeps a disabled row's handle focusable but moves nothing from it", async () => {
    const onReorder = vi.fn();
    const user = userEvent.setup();
    render(
      <ReorderableRows
        initial={['Inbox', 'Sent']}
        isDisabled={['Inbox']}
        onReorder={onReorder}
      />,
    );
    const handle = handleOf('Inbox');
    expect(handle).toHaveAttribute('aria-disabled', 'true');
    expect(handle).not.toHaveAttribute('disabled');
    handle.focus();
    expect(handle).toHaveFocus();
    await user.keyboard(' {ArrowDown}');
    expect(handle).toHaveAttribute('aria-pressed', 'false');
    expect(onReorder).not.toHaveBeenCalled();
    expect(handleOf('Sent')).not.toHaveAttribute('aria-disabled');
  });

  it('announces a move only once it lands, and a declined one with the place the row kept', async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    // A caller that keeps its order: the row never moves.
    render(
      <List reorderable={createReorderable({onReorder})}>
        {['Inbox', 'Sent', 'Drafts'].map(item => (
          <ListItem key={item} itemKey={item} label={item} />
        ))}
      </List>,
    );
    const handle = handleOf('Drafts');
    handle.focus();
    await user.keyboard(' {ArrowUp}');
    expect(onReorder).toHaveBeenCalledWith({key: 'Drafts', to: 1});
    await waitFor(() =>
      expect(document.body).toHaveTextContent(
        'Drafts, position 3 of 3, after Sent, at the end',
      ),
    );
    expect(document.body).not.toHaveTextContent('position 2 of 3');
    expect(labels()).toEqual(['Inbox', 'Sent', 'Drafts']);
    expect(handle).toHaveAttribute('aria-pressed', 'true');
    expect(handle).toHaveFocus();
  });

  it('reports the item key as given, a string or a number (spec:AST-103 FR1)', async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    const {rerender} = render(
      <List reorderable={createReorderable<number>({onReorder})}>
        <ListItem itemKey={7} label="Seven" />
        <ListItem itemKey={8} label="Eight" />
      </List>,
    );
    handleOf('Seven').focus();
    await user.keyboard(' {ArrowDown}');
    expect(onReorder).toHaveBeenLastCalledWith({key: 7, to: 1});
    await user.keyboard('{Escape}');
    rerender(
      <List reorderable={createReorderable<string>({onReorder})}>
        <ListItem itemKey="a" label="Alpha" />
        <ListItem itemKey="b" label="Beta" />
      </List>,
    );
    handleOf('Alpha').focus();
    await user.keyboard(' {ArrowDown}');
    expect(onReorder).toHaveBeenLastCalledWith({key: 'a', to: 1});
    // The key has Table's idKey shape: a string or a number, nothing else.
    // @ts-expect-error: a bigint is no item key.
    void (<ListItem itemKey={7n} label="Seven" />);
  });

  it('keeps reorder mode when the object is made anew, and calls the latest onReorder', async () => {
    const user = userEvent.setup();
    const first = vi.fn();
    const second = vi.fn();
    const rows = (onReorder: (move: ReorderMove) => void) => (
      <List reorderable={createReorderable({onReorder})}>
        {['Inbox', 'Sent', 'Drafts'].map(item => (
          <ListItem key={item} itemKey={item} label={item} />
        ))}
      </List>
    );
    const {rerender} = render(rows(first));
    const handle = handleOf('Inbox');
    handle.focus();
    await user.keyboard(' ');
    rerender(rows(second));
    expect(handle).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('{ArrowDown}');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith({key: 'Inbox', to: 1});
  });

  it('reorders two lists that share one object each on its own', async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    const reorderable = createReorderable({onReorder});
    render(
      <>
        <List reorderable={reorderable} aria-label="Today">
          <ListItem itemKey="a1" label="A1" />
          <ListItem itemKey="a2" label="A2" />
        </List>
        <List reorderable={reorderable} aria-label="Later">
          <ListItem itemKey="b1" label="B1" />
          <ListItem itemKey="b2" label="B2" />
        </List>
      </>,
    );
    handleOf('B1').focus();
    await user.keyboard(' ');
    expect(handleOf('B1')).toHaveAttribute('aria-pressed', 'true');
    expect(handleOf('A1')).toHaveAttribute('aria-pressed', 'false');
    await user.keyboard('{ArrowDown}');
    expect(onReorder).toHaveBeenLastCalledWith({key: 'b1', to: 1});
    act(() => handleOf('A2').focus());
    // Focus leaving B1's handle does not end its list's mode (FR4a).
    expect(handleOf('B1')).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard(' {ArrowUp}');
    expect(onReorder).toHaveBeenLastCalledWith({key: 'a2', to: 0});
  });

  /** Rows whose object a button outside the list starts reorder mode with. */
  function StartableRows({
    initial,
    fixed = NONE,
    onReorder,
    start,
    isMenu = false,
  }: {
    initial: ReadonlyArray<string>;
    fixed?: ReadonlyArray<string>;
    onReorder?: (move: ReorderMove) => void;
    start: string;
    isMenu?: boolean;
  }) {
    const [items, setItems] = useState(initial);
    // A new object on every render: `start` on the latest one works.
    const reorderable = createReorderable({
      onReorder: move => {
        onReorder?.(move);
        setItems(previous => moveKey(previous, move.key, move.to));
      },
      isReorderable: key => !fixed.includes(key as string),
    });
    return (
      <>
        <button
          type="button"
          onClick={event => {
            reorderable.start(start);
            // A closing menu hands the focus back to what had it.
            if (isMenu) {
              event.currentTarget.focus();
            }
          }}>
          Move {start}
        </button>
        <List reorderable={reorderable}>
          {items.map(item => (
            <ListItem key={item} itemKey={item} label={item} />
          ))}
        </List>
      </>
    );
  }

  it("starts reorder mode from the app's own UI with start(key): the focus moves to the handle, and the arrows move the row", async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    render(
      <StartableRows
        initial={['Inbox', 'Sent', 'Drafts']}
        onReorder={onReorder}
        start="Sent"
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Move Sent'}));
    const handle = handleOf('Sent');
    expect(handle).toHaveAttribute('aria-pressed', 'true');
    expect(handle).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(onReorder).toHaveBeenCalledWith({key: 'Sent', to: 2});
    await waitFor(() =>
      expect(document.body).toHaveTextContent(
        'Sent, position 3 of 3, after Drafts, at the end',
      ),
    );
    await user.keyboard('{Escape}');
    expect(handle).toHaveAttribute('aria-pressed', 'false');
    expect(labels()).toEqual(['Inbox', 'Drafts', 'Sent']);
  });

  it('keeps the mode start(key) entered when the UI that started it hands its focus back, as a closing menu does', async () => {
    const user = userEvent.setup();
    render(
      <StartableRows
        initial={['Inbox', 'Sent', 'Drafts']}
        start="Sent"
        isMenu
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Move Sent'}));
    const handle = handleOf('Sent');
    await waitFor(() => expect(handle).toHaveFocus());
    expect(handle).toHaveAttribute('aria-pressed', 'true');
  });

  it.each([
    ['cannot move', 'Pinned'],
    ['is not mounted', 'Spam'],
  ])(
    'does nothing with start(key) for a key that %s, and warns in development',
    async (_, key) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const user = userEvent.setup();
      const onReorder = vi.fn();
      render(
        <StartableRows
          initial={['Pinned', 'Inbox', 'Sent']}
          fixed={['Pinned']}
          onReorder={onReorder}
          start={key}
        />,
      );
      await user.click(screen.getByRole('button', {name: `Move ${key}`}));
      for (const label of ['Inbox', 'Sent']) {
        expect(handleOf(label)).toHaveAttribute('aria-pressed', 'false');
      }
      await user.keyboard('{ArrowDown}');
      expect(onReorder).not.toHaveBeenCalled();
      expect(
        warn.mock.calls.some(([message]) =>
          String(message).includes(`start(${key})`),
        ),
      ).toBe(true);
      warn.mockRestore();
    },
  );

  it('starts reorder mode in the list mounted last when one object serves two, and warns in development', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const reorderable = createReorderable({onReorder: () => {}});
    render(
      <>
        <List reorderable={reorderable} aria-label="Today">
          <ListItem itemKey="same" label="Today's" />
        </List>
        <List reorderable={reorderable} aria-label="Later">
          <ListItem itemKey="same" label="Later's" />
        </List>
      </>,
    );
    act(() => reorderable.start('same'));
    expect(handleOf("Later's")).toHaveAttribute('aria-pressed', 'true');
    expect(handleOf("Today's")).toHaveAttribute('aria-pressed', 'false');
    expect(
      warn.mock.calls.some(([message]) =>
        String(message).includes('more than one collection'),
      ),
    ).toBe(true);
    warn.mockRestore();
  });

  it("keeps the mouse drag slop equal to the date wheel's", () => {
    expect(MOUSE_DRAG_SLOP).toBe(DRAG_SLOP);
  });

  it('drags with a mouse once it moves the slop, from where it pressed; a smaller move stays a click', async () => {
    stubPrimaryPointer(false);
    const onReorder = vi.fn();
    render(<ReorderableRows initial={['A', 'B', 'C']} onReorder={onReorder} />);
    const list = screen.getByRole('list');
    layOut(list);
    const handle = handleOf('A');
    // Under the slop: a click, so nothing is picked up and nothing announced.
    fireEvent.pointerDown(handle, {...MOUSE, clientY: 322});
    fireEvent.pointerMove(handle, {
      ...MOUSE,
      clientY: 322 + MOUSE_DRAG_SLOP - 1,
    });
    expect(list).not.toHaveAttribute('data-astryx-reordering');
    fireEvent.pointerUp(handle, {...MOUSE, clientY: 322 + MOUSE_DRAG_SLOP - 1});
    expect(document.body).not.toHaveTextContent('Picked up');
    // That click turns reorder mode on, and another turns it off.
    fireEvent.click(handle);
    expect(handle).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(handle);
    expect(handle).toHaveAttribute('aria-pressed', 'false');
    // Past it the row follows from the press point: past both boundaries.
    mouseDrag(handle, 322, 322 + 70);
    expect(list).toHaveAttribute('data-astryx-reordering');
    await waitFor(() =>
      expect(document.body).toHaveTextContent('Picked up, position 1 of 3'),
    );
    act(() => {
      fireEvent.pointerUp(handle, {...MOUSE, clientY: 322 + 70});
    });
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith({key: 'A', to: 2});
    expect(labels()).toEqual(['B', 'C', 'A']);
    // The drag's own click leaves reorder mode off.
    fireEvent.click(handle);
    expect(handle).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() =>
      expect(document.body).toHaveTextContent('Dropped, position 3 of 3'),
    );
  });

  it('keeps the other rows still during a drag: the source dims in place, a preview follows the pointer, and an insertion line marks the drop position (design:ordered-collection-reordering)', async () => {
    stubPrimaryPointer(false);
    const onReorder = vi.fn();
    render(<ReorderableRows initial={['A', 'B', 'C']} onReorder={onReorder} />);
    const list = screen.getByRole('list');
    layOut(list);
    const [a, b, c] = Array.from(list.querySelectorAll('li'));
    mouseDrag(handleOf('A'), 322, 322 + 70);
    // The rows the drag passes stay where they are.
    for (const row of [a, b, c]) {
      expect(['', '0px 0px', 'none']).toContain(row.style.translate);
    }
    // The source stays in its place, dimmed.
    expect(a).toHaveAttribute('data-astryx-reorder-source');
    // A preview of it follows the pointer, hidden from assistive technology.
    const preview = list.querySelector<HTMLElement>(
      '[data-astryx-reorder-preview]',
    );
    expect(preview).not.toBeNull();
    expect(preview).toHaveAttribute('aria-hidden', 'true');
    expect(preview!.textContent).toBe(a.textContent);
    // The same item, moving: the row's reduced emphasis, not raised (DR2).
    expect(preview!.style.opacity).toBe(a.style.opacity);
    expect(preview!.style.boxShadow).toBe('none');
    expect(preview!.style.translate).toBe('0px 70px');
    // The line sits after C, where A would land (position 2 of 0-2).
    const line = list.querySelector<HTMLElement>('[data-astryx-reorder-line]');
    expect(line).not.toBeNull();
    expect(line).not.toHaveAttribute('hidden');
    expect(line!.style.translate).toBe('0px 131px');
    // The drop rearranges the rows and takes the preview and line away.
    act(() => {
      fireEvent.pointerUp(handleOf('A'), {...MOUSE, clientY: 322 + 70});
    });
    expect(onReorder).toHaveBeenCalledWith({key: 'A', to: 2});
    expect(labels()).toEqual(['B', 'C', 'A']);
    expect(list.querySelector('[data-astryx-reorder-preview]')).toBeNull();
    expect(list.querySelector('[data-astryx-reorder-line]')).toBeNull();
    expect(a).not.toHaveAttribute('data-astryx-reorder-source');
  });

  it('announces Done when a drag ends reorder mode, keeping its moves', async () => {
    stubPrimaryPointer(false);
    render(<ReorderableRows initial={['A', 'B', 'C']} />);
    const list = screen.getByRole('list');
    layOut(list);
    const handle = handleOf('A');
    fireEvent.click(handle);
    expect(handle).toHaveAttribute('aria-pressed', 'true');
    mouseDrag(handle, 322, 322 + 70);
    expect(handle).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() =>
      expect(document.body).toHaveTextContent('Done, A at position 1 of 3'),
    );
    act(() => {
      fireEvent.pointerUp(handle, {...MOUSE, clientY: 322 + 70});
    });
  });

  it('restores a cancelled drag at once: no preview, no line, the source undimmed, nothing moved', async () => {
    stubPrimaryPointer(false);
    const onReorder = vi.fn();
    render(<ReorderableRows initial={['A', 'B', 'C']} onReorder={onReorder} />);
    const list = screen.getByRole('list');
    layOut(list);
    const a = list.querySelector('li')!;
    mouseDrag(handleOf('A'), 322, 322 + 70);
    expect(list.querySelector('[data-astryx-reorder-preview]')).not.toBeNull();
    act(() => {
      fireEvent.pointerCancel(handleOf('A'), {...MOUSE, clientY: 322 + 70});
    });
    expect(list.querySelector('[data-astryx-reorder-preview]')).toBeNull();
    expect(list.querySelector('[data-astryx-reorder-line]')).toBeNull();
    expect(a).not.toHaveAttribute('data-astryx-reorder-source');
    expect(onReorder).not.toHaveBeenCalled();
    expect(labels()).toEqual(['A', 'B', 'C']);
  });

  it.each([
    ['its row is disabled', {isDisabled: ['A']}],
    ['its row stops being reorderable', {fixed: ['A']}],
    ['the list stops being reorderable', {isReorderable: false}],
  ])(
    'sends a mouse drag home when %s mid-drag',
    async (
      _,
      change: {
        isDisabled?: ReadonlyArray<string>;
        fixed?: ReadonlyArray<string>;
        isReorderable?: boolean;
      },
    ) => {
      stubPrimaryPointer(false);
      const onReorder = vi.fn();
      const rows = ({
        isDisabled = NONE,
        fixed = NONE,
        isReorderable = true,
      }: typeof change) => (
        <List
          reorderable={
            isReorderable
              ? createReorderable({
                  onReorder,
                  isReorderable: key => !fixed.includes(key as string),
                })
              : undefined
          }>
          {['A', 'B', 'C'].map(item => (
            <ListItem
              key={item}
              itemKey={item}
              label={item}
              isDisabled={isDisabled.includes(item)}
            />
          ))}
        </List>
      );
      const {rerender} = render(rows({}));
      const list = screen.getByRole('list');
      layOut(list);
      mouseDrag(handleOf('A'), 322, 322 + 70);
      expect(list).toHaveAttribute('data-astryx-reordering');
      rerender(rows(change));
      // No pointer reports this end: the session sends the row home.
      await waitFor(() =>
        expect(document.body).toHaveTextContent(
          'Reorder cancelled, back to position 1 of 3',
        ),
      );
      expect(list).not.toHaveAttribute('data-astryx-reordering');
      fireEvent.pointerUp(list, {...MOUSE, clientY: 322 + 70});
      expect(onReorder).not.toHaveBeenCalled();
      expect(labels()).toEqual(['A', 'B', 'C']);
    },
  );

  it("plays a committed move's glide on the shared settle role, springs.settle (spec:AST-105 FR4)", async () => {
    stubPrimaryPointer(true);
    const glide = vi.spyOn(touchMotion, 'glideBase');
    const user = userEvent.setup();
    render(<ReorderableRows initial={['A', 'B', 'C']} />);
    const list = screen.getByRole('list');
    layOut(list);
    const handle = handleOf('A');
    handle.focus();
    await user.keyboard(' {ArrowDown}');
    await waitFor(() => expect(glide).toHaveBeenCalled());
    expect(glide.mock.results[0]?.value).toEqual({duration: 0.5, bounce: 0});
    expect(motionRole('springs.settle')).toBeDefined();
    glide.mockRestore();
  });

  it('sends a still-gliding row home on the shared settle role, keeping its velocity (spec:AST-094 FR4, FR6)', async () => {
    stubPrimaryPointer(true);
    const home = vi.spyOn(touchMotion, 'home');
    const user = userEvent.setup();
    render(<ReorderableRows initial={['A', 'B', 'C']} />);
    const list = screen.getByRole('list');
    layOut(list);
    // A key move commits, and its rows glide on springs.settle.
    handleOf('A').focus();
    await user.keyboard(' {ArrowDown}{Escape}');
    await waitFor(() => expect(labels()).toEqual(['B', 'A', 'C']));
    layOut(list);
    // Picked up again while it still glides, then cancelled: it goes home on
    // the same role, from where it is shown, at the speed it has.
    const handle = handleOf('A');
    mouseDrag(handle, 344, 344 + 30);
    fireEvent.pointerCancel(handle, {...MOUSE, clientY: 344 + 30});
    const draggedRow = handle.closest('li');
    const calls = home.mock.calls.filter(([element]) => element === draggedRow);
    expect(calls.length).toBeGreaterThan(0);
    for (const [, spring, , fromRest] of calls) {
      expect(spring).toEqual({duration: 0.5, bounce: 0});
      expect(fromRest).toBe(false);
    }
    home.mockRestore();
  });

  it('puts its listeners on the list: none on a row or a handle', () => {
    stubPrimaryPointer(true);
    const add = vi.spyOn(EventTarget.prototype, 'addEventListener');
    render(<ReorderableRows initial={['Inbox', 'Sent', 'Drafts']} />);
    const list = screen.getByRole('list');
    const targets = add.mock.contexts;
    const rows = Array.from(list.children);
    const handles = Array.from(
      list.querySelectorAll('[data-astryx-list-reorder]'),
    );
    expect(handles).toHaveLength(3);
    expect(
      targets.filter(target => handles.includes(target as Element)),
    ).toEqual([]);
    expect(targets.filter(target => rows.includes(target as Element))).toEqual(
      [],
    );
    expect(
      add.mock.calls.filter(
        (_, index) => targets[index] === list && _[0] === 'pointerdown',
      ),
    ).toHaveLength(1);
    add.mockRestore();
  });

  it('attaches one hold to the list where the primary pointer is coarse, and none where it is fine', () => {
    const attached = (coarse: boolean) => {
      stubPrimaryPointer(coarse);
      const host = getGestureHost(document);
      const attach = vi.spyOn(host, 'attach');
      const {unmount} = render(
        <ReorderableRows initial={['Inbox', 'Sent', 'Drafts']} />,
      );
      const elements = attach.mock.calls.map(([element]) => element);
      const list = screen.getByRole('list');
      unmount();
      attach.mockRestore();
      return {elements, list};
    };
    const coarse = attached(true);
    expect(coarse.elements).toEqual([coarse.list]);
    expect(attached(false).elements).toEqual([]);
  });

  it('listens for touches on the document only while the list is mounted', () => {
    // A touch screen: the hold attaches where the primary pointer is coarse.
    stubPrimaryPointer(true);
    // A document of its own, so no earlier test has touched it, in a window
    // whose primary pointer is the page's.
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const doc = frame.contentDocument as Document;
    Object.defineProperty(frame.contentWindow, 'matchMedia', {
      configurable: true,
      value: (query: string) => window.matchMedia(query),
    });
    const touches = new Set(['touchstart', 'touchend', 'touchcancel']);
    const added = vi.spyOn(doc, 'addEventListener');
    const removed = vi.spyOn(doc, 'removeEventListener');
    const mount = () => {
      const container = doc.createElement('div');
      doc.body.append(container);
      return render(<ReorderableRows initial={['Inbox', 'Sent']} />, {
        container,
        baseElement: doc.body,
      });
    };
    const first = mount();
    const second = mount();
    const listeners = added.mock.calls.filter(([type]) => touches.has(type));
    expect(listeners.length).toBeGreaterThan(0);
    first.unmount();
    second.unmount();
    // Every touch listener the lists put on the document went with them.
    for (const [type, listener, options] of listeners) {
      expect(
        removed.mock.calls.some(
          ([removedType, removedListener]) =>
            removedType === type && removedListener === listener,
        ),
        `${type} ${JSON.stringify(options)}`,
      ).toBe(true);
    }
    added.mockRestore();
    removed.mockRestore();
    frame.remove();
  });

  it('with a fine primary pointer attaches no recognizer and registers no touch listener', () => {
    // spec:AST-094 FR19, FR24: a finger there gets the browser's defaults.
    stubPrimaryPointer(false);
    const doc = document.implementation.createHTMLDocument('fine');
    const added = vi.spyOn(doc, 'addEventListener');
    const container = doc.createElement('div');
    doc.body.append(container);
    const {unmount} = render(<ReorderableRows initial={['Inbox', 'Sent']} />, {
      container,
      baseElement: doc.body,
    });
    expect(
      added.mock.calls.filter(([type]) => type.startsWith('touch')),
    ).toEqual([]);
    unmount();
    added.mockRestore();
  });

  it('a hold on the handle opens no row menu, and a hold elsewhere on the row opens it (spec:AST-103)', () => {
    vi.useFakeTimers();
    const show = vi.spyOn(HTMLElement.prototype, 'showPopover');
    try {
      render(
        <ContextMenu label="Row actions" items={[{label: 'Move Inbox'}]}>
          <List reorderable={createReorderable({onReorder: () => {}})}>
            <ListItem itemKey="inbox" label="Inbox" />
            <ListItem itemKey="sent" label="Sent" />
          </List>
        </ContextMenu>,
      );
      const handle = handleOf('Inbox');
      show.mockClear();
      // Held past the menu's long press: the handle's hold is the row's, not
      // the menu's.
      fireEvent.touchStart(handle, {touches: [{clientX: 300, clientY: 20}]});
      act(() => {
        vi.advanceTimersByTime(800);
      });
      fireEvent.touchEnd(handle, {touches: []});
      expect(show).not.toHaveBeenCalled();
      // A finger's long press on the handle sends the menu no context
      // request either.
      const request = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(request, 'pointerType', {value: 'touch'});
      act(() => {
        handle.dispatchEvent(request);
      });
      expect(request.defaultPrevented).toBe(true);
      expect(show).not.toHaveBeenCalled();
      // A hold on the row's label opens the row's menu.
      const label = screen.getByText('Inbox');
      fireEvent.touchStart(label, {touches: [{clientX: 40, clientY: 20}]});
      act(() => {
        vi.advanceTimersByTime(500);
      });
      fireEvent.touchEnd(label, {touches: []});
      expect(show).toHaveBeenCalled();
    } finally {
      show.mockRestore();
      vi.useRealTimers();
    }
  });

  it("keeps the handle's touch from a row menu without hiding it from the gesture host or capture listeners", () => {
    // The handle stops its touchstart in React's bubble phase. The gesture
    // host and its recognizers listen in the capture phase (on the document
    // and on armed elements), so they still see every touch that starts on
    // the handle, as does any capture-phase listener.
    stubPrimaryPointer(true);
    render(
      <ContextMenu label="Row actions" items={[{label: 'Move Inbox'}]}>
        <List reorderable={createReorderable({onReorder: () => {}})}>
          <ListItem itemKey="inbox" label="Inbox" />
          <ListItem itemKey="sent" label="Sent" />
        </List>
      </ContextMenu>,
    );
    const handle = handleOf('Inbox');
    const captured = vi.fn();
    document.addEventListener('touchstart', captured, {capture: true});
    const host = getGestureHost(document);
    try {
      const touch = {identifier: 0, clientX: 300, clientY: 20, target: handle};
      fireEvent.touchStart(handle, {touches: [touch], changedTouches: [touch]});
      expect(captured).toHaveBeenCalledTimes(1);
      expect(host.fingersDown()).toBe(1);
      fireEvent.touchEnd(handle, {touches: [], changedTouches: [touch]});
      expect(host.fingersDown()).toBe(0);
    } finally {
      document.removeEventListener('touchstart', captured, {capture: true});
    }
  });

  it('does not activate an interactive row from its handle', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <List reorderable={createReorderable({onReorder: () => {}})}>
        <ListItem itemKey="inbox" label="Inbox" onClick={onClick} />
      </List>,
    );
    await user.click(handleOf('Inbox'));
    expect(onClick).not.toHaveBeenCalled();
  });
});
