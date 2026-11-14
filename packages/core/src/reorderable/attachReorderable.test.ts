// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act, fireEvent, screen, waitFor} from '@testing-library/react';
import {
  announceInModal,
  announceMessage,
  enclosingModalDialog,
} from '../hooks/useAnnounce';
import {createReorderable} from './createReorderable';
import type {ReorderMove} from './createReorderable';

type ReorderableAttachment = ReturnType<
  ReturnType<typeof createReorderable>['attach']
>;

vi.mock('../hooks/useAnnounce', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  announceMessage: vi.fn(() => null),
  announceInModal: vi.fn(() => null),
  enclosingModalDialog: vi.fn(() => null),
}));

const announced = () =>
  vi.mocked(announceMessage).mock.calls.map(([message]) => message);

type Apply = 'sync' | 'microtask' | 'chained' | 'rerender' | 'never' | 'late';

/** A plain list the app renders: one `<li>` per item, each with a button. */
function renderPlainList(
  names: string[],
  {
    apply = 'sync',
    isReorderable,
    handleTag = 'button',
    handleDescribedBy,
    handleText,
  }: {
    apply?: Apply;
    isReorderable?: (key: string | number) => boolean;
    handleTag?: 'button' | 'span';
    handleDescribedBy?: string;
    handleText?: string;
  } = {},
) {
  const container = document.createElement('ul');
  document.body.append(container);
  for (const name of names) {
    const row = document.createElement('li');
    row.dataset.key = name.toLowerCase();
    const text = document.createElement('span');
    text.textContent = name;
    const handle = document.createElement(handleTag);
    if (handle instanceof HTMLButtonElement) {
      handle.type = 'button';
    }
    handle.className = 'grip';
    if (handleText != null) {
      handle.textContent = handleText;
    }
    if (handleDescribedBy != null) {
      handle.setAttribute('aria-describedby', handleDescribedBy);
    }
    row.append(text, handle);
    container.append(row);
  }
  const rows = () => Array.from(container.querySelectorAll('li'));
  const moves: ReorderMove[] = [];
  const move = ({key, to}: ReorderMove) => {
    const row = rows().find(element => element.dataset.key === key);
    const rest = rows().filter(element => element !== row);
    if (row == null) {
      return;
    }
    const before = rest[to] ?? null;
    container.insertBefore(row, before);
  };
  const reorderable = createReorderable({
    onReorder: next => {
      moves.push(next);
      if (apply === 'sync') {
        move(next);
      } else if (apply === 'microtask') {
        // What React's flush of a setState made in this task does.
        queueMicrotask(() => move(next));
      } else if (apply === 'chained') {
        // A flush queued after attach's own check, still in this task.
        queueMicrotask(() => queueMicrotask(() => move(next)));
      } else if (apply === 'rerender') {
        // An app that renders every row again: new elements, same keys.
        move(next);
        for (const row of rows()) {
          row.replaceWith(row.cloneNode(true));
        }
      } else if (apply === 'late') {
        setTimeout(() => move(next), 0);
      }
    },
    isReorderable,
  });
  const attachment = reorderable.attach(container, {
    items: () =>
      rows().map(row => ({
        key: row.dataset.key ?? '',
        element: row,
        handle: row.querySelector<HTMLElement>('.grip') as HTMLElement,
      })),
  });
  const handle = (name: string) =>
    rows()
      .find(row => row.dataset.key === name.toLowerCase())
      ?.querySelector<HTMLElement>('.grip') as HTMLElement;
  const order = () => rows().map(row => row.textContent);
  return {container, reorderable, attachment, handle, order, moves};
}

/** Lets the end-of-task check and the controller's fallback run. */
async function settle() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

let attachments: ReorderableAttachment[] = [];
function track<T extends {attachment: ReorderableAttachment}>(value: T): T {
  attachments.push(value.attachment);
  return value;
}

beforeEach(() => {
  vi.mocked(announceMessage).mockClear();
});

afterEach(() => {
  for (const attachment of attachments) {
    attachment.detach();
  }
  attachments = [];
  document.body.innerHTML = '';
});

describe('createReorderable attach (spec:AST-103 FR4b)', () => {
  it('wires each handle as a named reorder toggle in the Tab order', () => {
    const {handle} = track(renderPlainList(['Milk', 'Eggs']));
    const milk = handle('Milk');
    expect(milk).toHaveAttribute('aria-pressed', 'false');
    expect(milk).toHaveAccessibleName('Reorder Milk');
    expect(milk).toHaveAccessibleDescription(
      'Drag to move this item, or press Space or Enter, then the arrow keys to move it one place at a time. Press Escape when you are done.',
    );
    expect(milk).not.toHaveAttribute('role');
  });

  it('gives a handle that is not a button the button role and a Tab stop', () => {
    const {handle} = track(renderPlainList(['Milk'], {handleTag: 'span'}));
    const milk = handle('Milk');
    expect(milk).toHaveAttribute('role', 'button');
    expect(milk).toHaveAttribute('tabindex', '0');
    milk.focus();
    fireEvent.keyDown(milk, {key: 'Enter'});
    expect(milk).toHaveAttribute('aria-pressed', 'true');
  });

  it('moves an item in reorder mode and announces its new place once', async () => {
    const {handle, order, moves} = track(
      renderPlainList(['Milk', 'Eggs', 'Bread']),
    );
    const milk = handle('Milk');
    act(() => milk.click());
    expect(milk).toHaveAttribute('aria-pressed', 'true');
    expect(milk).toHaveFocus();
    fireEvent.keyDown(milk, {key: 'ArrowDown'});
    expect(moves).toEqual([{key: 'milk', to: 1}]);
    await settle();
    expect(order()).toEqual(['Eggs', 'Milk', 'Bread']);
    expect(announced()).toEqual([
      'Milk, position 2 of 3, after Eggs, before Bread',
    ]);
    expect(milk).toHaveFocus();
    expect(milk).toHaveAttribute('aria-pressed', 'true');
  });

  it('commits a move the app applies in a microtask, as a React flush does', async () => {
    const {handle, order} = track(
      renderPlainList(['Milk', 'Eggs', 'Bread'], {apply: 'microtask'}),
    );
    const milk = handle('Milk');
    act(() => milk.click());
    fireEvent.keyDown(milk, {key: 'ArrowDown'});
    await settle();
    expect(order()).toEqual(['Eggs', 'Milk', 'Bread']);
    expect(announced()).toEqual([
      'Milk, position 2 of 3, after Eggs, before Bread',
    ]);
  });

  it("names a handle after its item without the handle's own text", () => {
    const {handle} = track(renderPlainList(['Milk'], {handleText: '⋮⋮'}));
    expect(handle('Milk')).toHaveAccessibleName('Reorder Milk');
  });

  it('commits a move the app applies in a later microtask of the same task', async () => {
    const {handle, order} = track(
      renderPlainList(['Milk', 'Eggs', 'Bread'], {apply: 'chained'}),
    );
    const milk = handle('Milk');
    act(() => milk.click());
    fireEvent.keyDown(milk, {key: 'ArrowDown'});
    await settle();
    expect(order()).toEqual(['Eggs', 'Milk', 'Bread']);
    expect(announced()).toEqual([
      'Milk, position 2 of 3, after Eggs, before Bread',
    ]);
  });

  it('commits a move the app applies by rendering its rows again, and the new handle keeps the mode and the focus', async () => {
    const {handle, order} = track(
      renderPlainList(['Milk', 'Eggs', 'Bread'], {apply: 'rerender'}),
    );
    act(() => handle('Milk').click());
    fireEvent.keyDown(handle('Milk'), {key: 'ArrowDown'});
    await settle();
    expect(order()).toEqual(['Eggs', 'Milk', 'Bread']);
    expect(announced()).toEqual([
      'Milk, position 2 of 3, after Eggs, before Bread',
    ]);
    expect(handle('Milk')).toHaveAttribute('aria-pressed', 'true');
    expect(handle('Milk')).toHaveFocus();
  });

  it('refuses and announces a move the app does not apply', async () => {
    const {handle, order} = track(
      renderPlainList(['Milk', 'Eggs', 'Bread'], {apply: 'never'}),
    );
    const milk = handle('Milk');
    act(() => milk.click());
    fireEvent.keyDown(milk, {key: 'ArrowDown'});
    await settle();
    expect(order()).toEqual(['Milk', 'Eggs', 'Bread']);
    expect(announced()).toEqual(["Can't move Milk"]);
  });

  it('refuses a move the app applies in a later task', async () => {
    const {handle} = track(
      renderPlainList(['Milk', 'Eggs', 'Bread'], {apply: 'late'}),
    );
    const milk = handle('Milk');
    act(() => milk.click());
    fireEvent.keyDown(milk, {key: 'ArrowDown'});
    await settle();
    expect(announced()).toEqual(["Can't move Milk"]);
  });

  it('ends reorder mode on Escape and announces where the item is', async () => {
    const {handle} = track(renderPlainList(['Milk', 'Eggs', 'Bread']));
    const milk = handle('Milk');
    act(() => milk.click());
    fireEvent.keyDown(milk, {key: 'ArrowDown'});
    await settle();
    vi.mocked(announceMessage).mockClear();
    fireEvent.keyDown(milk, {key: 'Escape'});
    expect(milk).toHaveAttribute('aria-pressed', 'false');
    expect(announced()).toEqual(['Done, Milk at position 2 of 3']);
  });

  it('shows the hint while in reorder mode, its buttons doing what the keys do', async () => {
    const {handle, order} = track(renderPlainList(['Milk', 'Eggs', 'Bread']));
    const milk = handle('Milk');
    act(() => milk.click());
    // jsdom never opens a popover, so the hint layer stays hidden there.
    const down = await waitFor(() =>
      screen.getByRole('button', {name: 'Move down', hidden: true}),
    );
    act(() => down.click());
    await settle();
    expect(order()).toEqual(['Eggs', 'Milk', 'Bread']);
    act(() => screen.getByRole('button', {name: 'Done', hidden: true}).click());
    expect(milk).toHaveAttribute('aria-pressed', 'false');
  });

  it("starts reorder mode from the app's own UI with start(key)", () => {
    const {handle, reorderable} = track(renderPlainList(['Milk', 'Eggs']));
    act(() => reorderable.start('eggs'));
    expect(handle('Eggs')).toHaveAttribute('aria-pressed', 'true');
    expect(handle('Eggs')).toHaveFocus();
  });

  it('wires no handle for an item isReorderable rejects, and refuses moves past one at the end', async () => {
    const {handle} = track(
      renderPlainList(['Milk', 'Eggs', 'Pinned'], {
        isReorderable: key => key !== 'pinned',
      }),
    );
    expect(handle('Pinned')).not.toHaveAttribute('aria-pressed');
    const eggs = handle('Eggs');
    act(() => eggs.click());
    fireEvent.keyDown(eggs, {key: 'ArrowDown'});
    await settle();
    expect(announced()).toEqual(["Can't move past Pinned"]);
  });

  it('wires an item the app adds after attach at the next press', () => {
    const {container, handle} = track(renderPlainList(['Milk']));
    const row = document.createElement('li');
    row.dataset.key = 'eggs';
    row.innerHTML =
      '<span>Eggs</span><button type="button" class="grip"></button>';
    container.append(row);
    expect(handle('Eggs')).not.toHaveAttribute('aria-pressed');
    act(() => handle('Milk').click());
    expect(handle('Eggs')).toHaveAttribute('aria-pressed', 'false');
    expect(handle('Eggs')).toHaveAccessibleName('Reorder Eggs');
  });

  it('detach puts back every attribute and element, and stops listening', () => {
    const {container, handle, attachment} = renderPlainList(['Milk', 'Eggs'], {
      handleTag: 'span',
      handleDescribedBy: 'own',
    });
    const milk = handle('Milk');
    expect(milk.getAttribute('aria-describedby')).toMatch(/^own \S+$/);
    const nodes = document.body.children.length;
    attachment.detach();
    expect(document.body.children.length).toBe(nodes - 1);
    // The description the app set before attach stays.
    expect(milk).toHaveAttribute('aria-describedby', 'own');
    for (const name of ['role', 'tabindex', 'aria-pressed', 'aria-label']) {
      expect(milk).not.toHaveAttribute(name);
    }
    expect(milk).not.toHaveAttribute('data-astryx-list-reorder');
    expect(container.children.length).toBe(2);
    fireEvent.keyDown(milk, {key: 'Enter'});
    expect(milk).not.toHaveAttribute('aria-pressed');
  });

  it.each(['flex', 'grid'])(
    "leaves a %s parent's children as they were, and puts its own elements in the theme scope",
    async display => {
      const scope = document.createElement('div');
      scope.setAttribute('data-astryx-theme', 'neutral');
      const parent = document.createElement('div');
      parent.style.display = display;
      const before = document.createElement('div');
      const container = document.createElement('div');
      const after = document.createElement('div');
      const row = document.createElement('div');
      row.textContent = 'Milk';
      const grip = document.createElement('button');
      row.append(grip);
      container.append(row);
      parent.append(before, container, after);
      scope.append(parent);
      document.body.append(scope);
      const attachment = createReorderable({onReorder: () => {}}).attach(
        container,
        {items: () => [{key: 'milk', element: row, handle: grip}]},
      );
      act(() => grip.click());
      expect(Array.from(parent.children)).toEqual([before, container, after]);
      expect(container.children.length).toBe(1);
      const owned = Array.from(scope.children).filter(
        child => child !== parent,
      );
      expect(owned.length).toBeGreaterThan(0);
      for (const element of owned) {
        expect(
          (element as HTMLElement).hidden ||
            (element as HTMLElement).style.position === 'fixed',
        ).toBe(true);
      }
      act(() => attachment.detach());
      // The hint's host goes once the detaching task's work is done.
      await act(async () => {
        await Promise.resolve();
      });
      expect(Array.from(scope.children)).toEqual([parent]);
    },
  );

  it('moves an item that is its own handle', async () => {
    const container = document.createElement('ul');
    document.body.append(container);
    for (const name of ['Milk', 'Eggs']) {
      const row = document.createElement('li');
      row.textContent = name;
      row.dataset.key = name.toLowerCase();
      container.append(row);
    }
    const rows = () => Array.from(container.querySelectorAll('li'));
    const reorderable = createReorderable({
      onReorder: ({key, to}) => {
        const row = rows().find(element => element.dataset.key === key);
        const rest = rows().filter(element => element !== row);
        if (row != null) {
          container.insertBefore(row, rest[to] ?? null);
        }
      },
    });
    attachments.push(
      reorderable.attach(container, {
        items: () =>
          rows().map(row => ({
            key: row.dataset.key ?? '',
            element: row,
            handle: row,
          })),
      }),
    );
    const milk = rows()[0];
    expect(milk).toHaveAccessibleName('Reorder Milk');
    act(() => milk.focus());
    fireEvent.keyDown(milk, {key: 'Enter'});
    fireEvent.keyDown(milk, {key: 'ArrowDown'});
    await settle();
    expect(rows().map(row => row.textContent)).toEqual(['Eggs', 'Milk']);
    // Each read names it again from its text, not from the label it got.
    expect(milk).toHaveAccessibleName('Reorder Milk');
    expect(announced()).toEqual([
      'Milk, position 2 of 2, after Eggs, at the end',
    ]);
  });

  it("takes an app's new aria-label on a self-handle as its own, and detach restores the new one", () => {
    const container = document.createElement('ul');
    const row = document.createElement('li');
    row.setAttribute('aria-label', 'Ace of spades');
    container.append(row);
    document.body.append(container);
    const attachment = createReorderable({onReorder: () => {}}).attach(
      container,
      {items: () => [{key: 'ace', element: row, handle: row}]},
    );
    expect(row).toHaveAccessibleName('Reorder Ace of spades');
    row.setAttribute('aria-label', 'Ace of hearts');
    act(() => row.click());
    expect(row).toHaveAccessibleName('Reorder Ace of hearts');
    act(() => attachment.detach());
    expect(row).toHaveAttribute('aria-label', 'Ace of hearts');
  });

  it('names a handle that has aria-labelledby "Reorder" plus its item, and detach restores it', () => {
    const container = document.createElement('ul');
    const row = document.createElement('li');
    const title = document.createElement('span');
    title.id = 'card-title';
    title.textContent = 'King of hearts';
    row.append(title);
    row.setAttribute('aria-labelledby', 'card-title');
    container.append(row);
    document.body.append(container);
    const attachment = createReorderable({onReorder: () => {}}).attach(
      container,
      {items: () => [{key: 'king', element: row, handle: row}]},
    );
    expect(row).toHaveAccessibleName('Reorder King of hearts');
    expect(row).not.toHaveAttribute('aria-labelledby');
    act(() => attachment.detach());
    expect(row).toHaveAttribute('aria-labelledby', 'card-title');
    expect(row).not.toHaveAttribute('aria-label');
  });

  it('wires no handle for a keyless item', () => {
    const container = document.createElement('div');
    const row = document.createElement('div');
    row.textContent = 'Milk';
    const grip = document.createElement('button');
    row.append(grip);
    container.append(row);
    document.body.append(container);
    attachments.push(
      createReorderable({onReorder: () => {}}).attach(container, {
        items: () => [
          {key: undefined as unknown as string, element: row, handle: grip},
        ],
      }),
    );
    expect(grip).not.toHaveAttribute('aria-pressed');
    expect(grip).not.toHaveAttribute('aria-label');
  });

  it('names an item with no accessible name or text by its place, and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const container = document.createElement('div');
    const row = document.createElement('div');
    const grip = document.createElement('button');
    row.append(grip);
    container.append(row);
    document.body.append(container);
    attachments.push(
      createReorderable({onReorder: () => {}}).attach(container, {
        items: () => [{key: 'a', element: row, handle: grip}],
      }),
    );
    expect(grip).toHaveAccessibleName('Reorder item 1');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('has no accessible name or text'),
    );
    warn.mockRestore();
  });

  it('announces inside the modal dialog that encloses the container', async () => {
    const dialog = document.createElement('dialog');
    document.body.append(dialog);
    vi.mocked(enclosingModalDialog).mockReturnValue(dialog);
    try {
      const {handle} = track(renderPlainList(['Milk', 'Eggs']));
      act(() => handle('Milk').click());
      fireEvent.keyDown(handle('Milk'), {key: 'ArrowDown'});
      await settle();
      expect(announceInModal).toHaveBeenCalledWith(
        dialog,
        'Milk, position 2 of 2, after Eggs, at the end',
        'polite',
      );
      expect(announced()).toEqual([]);
    } finally {
      vi.mocked(enclosingModalDialog).mockReturnValue(null);
      vi.mocked(announceInModal).mockClear();
    }
  });

  it('reorders two containers attached to one object each on its own, and start reaches the one attached last, with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const moves: ReorderMove[] = [];
    const reorderable = createReorderable({
      onReorder: move => moves.push(move),
    });
    const make = (names: string[]) => {
      const container = document.createElement('ul');
      for (const name of names) {
        const row = document.createElement('li');
        row.dataset.key = name.toLowerCase();
        row.innerHTML = `<span>${name}</span><button type="button" class="grip"></button>`;
        container.append(row);
      }
      document.body.append(container);
      attachments.push(
        reorderable.attach(container, {
          items: () =>
            Array.from(container.querySelectorAll('li')).map(row => ({
              key: row.dataset.key ?? '',
              element: row,
              handle: row.querySelector<HTMLElement>('.grip') as HTMLElement,
            })),
        }),
      );
      return container;
    };
    const first = make(['Milk', 'Eggs']);
    const second = make(['Tea', 'Coffee']);
    act(() => reorderable.start('coffee'));
    expect(second.querySelectorAll('[aria-pressed="true"]').length).toBe(1);
    expect(first.querySelectorAll('[aria-pressed="true"]').length).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('more than one'));
    const milkGrip = first.querySelector<HTMLElement>('.grip') as HTMLElement;
    act(() => milkGrip.click());
    fireEvent.keyDown(milkGrip, {key: 'ArrowDown'});
    expect(moves).toEqual([{key: 'milk', to: 1}]);
    warn.mockRestore();
  });

  it('detach removes only the class tokens attach added', () => {
    const {container, handle, attachment} = renderPlainList(['Milk', 'Eggs']);
    container.className = 'app-list';
    act(() => handle('Milk').click());
    container.classList.add('app-added-later');
    act(() => attachment.detach());
    expect(container.className).toBe('app-list app-added-later');
  });

  it('detach in a React commit leaves the hint root to unmount after it', async () => {
    const {handle, attachment} = renderPlainList(['Milk', 'Eggs']);
    act(() => handle('Milk').click());
    const before = document.body.children.length;
    attachment.detach();
    // The hint host is hidden at once, and removed once the task's
    // synchronous work is done.
    await Promise.resolve();
    expect(document.body.children.length).toBeLessThan(before);
  });

  it('puts its own elements in the dialog that encloses the container', () => {
    const dialog = document.createElement('dialog');
    const container = document.createElement('ul');
    const row = document.createElement('li');
    row.textContent = 'Milk';
    const grip = document.createElement('button');
    row.append(grip);
    container.append(row);
    dialog.append(container);
    document.body.append(dialog);
    attachments.push(
      createReorderable({onReorder: () => {}}).attach(container, {
        items: () => [{key: 'milk', element: row, handle: grip}],
      }),
    );
    act(() => grip.click());
    const owned = Array.from(dialog.children).filter(
      child => child !== container,
    );
    expect(owned.length).toBe(2);
    expect(document.body.children.length).toBe(1);
  });

  it("follows an item's rename and an unnamed item's move in its handle's name", async () => {
    const container = document.createElement('ul');
    const make = (key: string, text: string) => {
      const row = document.createElement('li');
      row.dataset.key = key;
      const label = document.createElement('span');
      label.textContent = text;
      const grip = document.createElement('button');
      row.append(label, grip);
      container.append(row);
      return {row, label, grip};
    };
    const milk = make('milk', 'Milk');
    const blank = make('blank', '');
    document.body.append(container);
    const rows = () => Array.from(container.querySelectorAll('li'));
    attachments.push(
      createReorderable({
        onReorder: ({key, to}) => {
          const row = rows().find(element => element.dataset.key === key);
          const rest = rows().filter(element => element !== row);
          if (row != null) {
            container.insertBefore(row, rest[to] ?? null);
          }
        },
      }).attach(container, {
        items: () =>
          rows().map(row => ({
            key: row.dataset.key ?? '',
            element: row,
            handle: row.querySelector('button') as HTMLElement,
          })),
      }),
    );
    expect(blank.grip).toHaveAccessibleName('Reorder item 2');
    milk.label.textContent = 'Oat milk';
    act(() => blank.grip.click());
    expect(milk.grip).toHaveAccessibleName('Reorder Oat milk');
    fireEvent.keyDown(blank.grip, {key: 'ArrowUp'});
    await settle();
    expect(blank.grip).toHaveAccessibleName('Reorder item 1');
  });

  it("counts a keyless item in each move's place, and an item passes it", async () => {
    const container = document.createElement('ul');
    for (const [key, text] of [
      ['milk', 'Milk'],
      ['', 'Note'],
      ['eggs', 'Eggs'],
    ]) {
      const row = document.createElement('li');
      row.dataset.key = key;
      row.innerHTML = `<span>${text}</span><button type="button"></button>`;
      container.append(row);
    }
    document.body.append(container);
    const rows = () => Array.from(container.querySelectorAll('li'));
    const moves: ReorderMove[] = [];
    attachments.push(
      createReorderable({
        onReorder: move => {
          moves.push(move);
          const row = rows().find(element => element.dataset.key === move.key);
          const rest = rows().filter(element => element !== row);
          if (row != null) {
            container.insertBefore(row, rest[move.to] ?? null);
          }
        },
      }).attach(container, {
        items: () =>
          rows().map(row => ({
            key: (row.dataset.key || undefined) as unknown as string,
            element: row,
            handle: row.querySelector('button') as HTMLElement,
          })),
      }),
    );
    const milkGrip = rows()[0].querySelector('button') as HTMLElement;
    act(() => milkGrip.click());
    fireEvent.keyDown(milkGrip, {key: 'ArrowDown'});
    await settle();
    fireEvent.keyDown(milkGrip, {key: 'ArrowDown'});
    await settle();
    expect(moves).toEqual([
      {key: 'milk', to: 1},
      {key: 'milk', to: 2},
    ]);
    expect(rows().map(row => row.textContent)).toEqual([
      'Note',
      'Eggs',
      'Milk',
    ]);
    expect(announced()).not.toContain("Can't move Milk");
  });

  it('puts a handle with its own tabindex="-1" in the Tab order, and detach restores it', () => {
    const container = document.createElement('ul');
    const row = document.createElement('li');
    row.textContent = 'Milk';
    const grip = document.createElement('button');
    grip.setAttribute('tabindex', '-1');
    row.append(grip);
    container.append(row);
    document.body.append(container);
    const attachment = createReorderable({onReorder: () => {}}).attach(
      container,
      {items: () => [{key: 'milk', element: row, handle: grip}]},
    );
    expect(grip).toHaveAttribute('tabindex', '0');
    attachment.detach();
    expect(grip).toHaveAttribute('tabindex', '-1');
  });

  it('detach ends reorder mode without a word and restores the container', async () => {
    const {container, handle, attachment} = renderPlainList(['Milk', 'Eggs']);
    const className = container.className;
    act(() => handle('Milk').click());
    vi.mocked(announceMessage).mockClear();
    act(() => attachment.detach());
    expect(announced()).toEqual([]);
    expect(container.className).toBe(className);
    expect(container.style.position).toBe('');
    expect(container.children.length).toBe(2);
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.body.children.length).toBe(1);
  });
});
