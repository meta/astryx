// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListReorderNames.test.tsx
 * @input List with `reorderable` (createReorderable), ListItem `itemKey`,
 *   Testing Library, and server markup that hydrates
 * @output jsdom proofs that a reorder handle's name follows its row when the
 *   handle does not render again. A nameless row's place follows a row above
 *   it that goes, and a reorder, also after the list's numbering turns on. A
 *   label names the handle while it shows text. A handle named by its label,
 *   its `aria-label` or otherwise renders once per mount, and once when it
 *   hydrates.
 * @position Tests for List/ListReorderHandle.tsx
 */

import {act, render, screen, waitFor} from '@testing-library/react';
import {memo, useState} from 'react';
import {hydrateRoot, type Root} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';
import {List} from '../List';
import {ListItem} from '../ListItem';
import {createReorderable} from '../../reorderable/createReorderable';
import {
  InternationalizationContext,
  type InternationalizationContextValue,
} from '../../i18n/InternationalizationContext';
import {getResolve} from '../../i18n/resolve';

let verbReads = 0;
const english = getResolve('en', {});
/** English, counting the handle verb's reads. Module scope keeps it stable. */
const COUNTING_ENGLISH: InternationalizationContextValue = {
  locale: 'en',
  direction: 'ltr',
  messages: {},
  translate: (key, values) => {
    if (key === '@astryx.list.reorderHandleVerb') {
      verbReads += 1;
    }
    return english(key, values);
  },
};

describe('List reorder handle names', () => {
  it("keeps a nameless row's place in its handle's name when a row above it goes, though the row does not render again", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const reorderable = createReorderable({onReorder: () => {}});
    const Dot = memo(function Dot({itemKey}: {itemKey: string}) {
      return <ListItem itemKey={itemKey} label={<svg aria-hidden="true" />} />;
    });
    const rows = (keys: ReadonlyArray<string>) => (
      <List reorderable={reorderable}>
        {keys.map(key =>
          key === 'inbox' ? (
            <ListItem key={key} itemKey={key} label="Inbox" />
          ) : (
            <Dot key={key} itemKey={key} />
          ),
        )}
      </List>
    );
    const {rerender} = render(rows(['inbox', 'dot']));
    expect(
      await screen.findByRole('button', {name: 'Reorder item 2'}),
    ).toBeInTheDocument();
    rerender(rows(['dot']));
    expect(
      await screen.findByRole('button', {name: 'Reorder item 1'}),
    ).toBeInTheDocument();
    warn.mockRestore();
  });

  it("keeps a nameless row's place in its handle's name when the rows reorder, though the row does not render again", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const reorderable = createReorderable({onReorder: () => {}});
    const Dot = memo(function Dot({itemKey}: {itemKey: string}) {
      return <ListItem itemKey={itemKey} label={<svg aria-hidden="true" />} />;
    });
    const inbox = <ListItem key="inbox" itemKey="inbox" label="Inbox" />;
    const dot = <Dot key="dot" itemKey="dot" />;
    const {rerender} = render(
      <List reorderable={reorderable}>
        {inbox}
        {dot}
      </List>,
    );
    expect(
      await screen.findByRole('button', {name: 'Reorder item 2'}),
    ).toBeInTheDocument();
    // Both rows stay: only their order changes.
    rerender(
      <List reorderable={reorderable}>
        {dot}
        {inbox}
      </List>,
    );
    expect(
      await screen.findByRole('button', {name: 'Reorder item 1'}),
    ).toBeInTheDocument();
    warn.mockRestore();
  });

  it('keeps nameless rows named after their places when the rows reorder after numbering turns on', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const reorderable = createReorderable({onReorder: () => {}});
    const rows = (keys: ReadonlyArray<string>, isNumbered: boolean) => (
      <List
        reorderable={reorderable}
        listStyle={isNumbered ? 'decimal' : 'none'}>
        {keys.map(key => (
          <ListItem
            key={key}
            itemKey={key}
            label={<svg aria-hidden="true" />}
          />
        ))}
      </List>
    );
    const names = () =>
      screen
        .getAllByRole('button')
        .map(handle => handle.getAttribute('aria-label'));
    const inOrder = ['Reorder item 1', 'Reorder item 2', 'Reorder item 3'];
    const {rerender} = render(rows(['a', 'b', 'c'], false));
    // Numbering renders the list as a new element: an `ol`.
    rerender(rows(['a', 'b', 'c'], true));
    await waitFor(() => expect(names()).toEqual(inOrder));
    rerender(rows(['c', 'b', 'a'], true));
    await waitFor(() => expect(names()).toEqual(inOrder));
    warn.mockRestore();
  });

  it("names the handle after its row's label while an icon-only label shows text, though the handle does not render again", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let name: (text: string) => void = () => {};
    function Label() {
      const [text, setText] = useState('');
      name = setText;
      return text === '' ? <svg aria-hidden="true" /> : <span>{text}</span>;
    }
    render(
      <List reorderable={createReorderable({onReorder: () => {}})}>
        <ListItem itemKey="star" label={<Label />} />
      </List>,
    );
    expect(
      await screen.findByRole('button', {name: 'Reorder item 1'}),
    ).toBeInTheDocument();
    act(() => name('Starred'));
    expect(
      await screen.findByRole('button', {name: 'Reorder Starred'}),
    ).toBeInTheDocument();
    // The text goes again: the handle takes its place back.
    act(() => name(''));
    expect(
      await screen.findByRole('button', {name: 'Reorder item 1'}),
    ).toBeInTheDocument();
    warn.mockRestore();
  });

  it("renders a handle its row's label or aria-label names once per mount, though the session reads the names after the commit", async () => {
    // Each handle render reads the verb once, so the reads count renders.
    verbReads = 0;
    const reorderable = createReorderable({onReorder: () => {}});
    // Inbox is named by its `aria-label`, the other rows by their labels.
    const Row = memo(function Row({itemKey}: {itemKey: string}) {
      return itemKey === 'Inbox' ? (
        <ListItem itemKey={itemKey} aria-label={itemKey} label={itemKey} />
      ) : (
        <ListItem itemKey={itemKey} label={itemKey} />
      );
    });
    const rows = (keys: ReadonlyArray<string>) => (
      <InternationalizationContext value={COUNTING_ENGLISH}>
        <List reorderable={reorderable}>
          {keys.map(key => (
            <Row key={key} itemKey={key} />
          ))}
        </List>
      </InternationalizationContext>
    );
    const {rerender} = render(rows(['Inbox', 'Sent']));
    expect(
      await screen.findByRole('button', {name: 'Reorder Sent'}),
    ).toBeInTheDocument();
    // The session reads the names in a microtask after the commit. An
    // unchanged name keeps its snapshot, so no handle renders again.
    await act(async () => {});
    expect(verbReads).toBe(2);
    // A row that mounts later renders its handle once too.
    rerender(rows(['Inbox', 'Sent', 'Drafts']));
    expect(
      await screen.findByRole('button', {name: 'Reorder Drafts'}),
    ).toBeInTheDocument();
    await act(async () => {});
    expect(verbReads).toBe(3);
  });

  it("renders a hydrated handle its row's label or aria-label names once, though the server snapshot comes before the session's read", async () => {
    const error = vi.spyOn(console, 'error');
    const reorderable = createReorderable({onReorder: () => {}});
    const tree = (
      <InternationalizationContext value={COUNTING_ENGLISH}>
        <List reorderable={reorderable}>
          <ListItem itemKey="inbox" aria-label="Inbox" label="Inbox" />
          <ListItem itemKey="sent" label="Sent" />
        </List>
      </InternationalizationContext>
    );
    const container = document.createElement('div');
    container.innerHTML = renderToString(tree);
    document.body.append(container);
    verbReads = 0;
    let root: Root | null = null;
    await act(async () => {
      root = hydrateRoot(container, tree);
    });
    // A server snapshot that equals the session's unread name keeps the
    // hydrated handle as it is, and so does the session's first read.
    await act(async () => {});
    expect(verbReads).toBe(2);
    expect(error).not.toHaveBeenCalled();
    act(() => root?.unmount());
    container.remove();
    error.mockRestore();
  });
});
