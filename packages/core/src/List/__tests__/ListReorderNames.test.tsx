// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListReorderNames.test.tsx
 * @input List with `reorderable` (createReorderable), ListItem `itemKey`,
 *   Testing Library
 * @output jsdom proofs that a reorder handle's name follows its row when the
 *   handle does not render again. A nameless row's place follows a row above
 *   it that goes, and a reorder, also after the list's numbering turns on. A
 *   label names the handle while it shows text.
 * @position Tests for List/ListReorderHandle.tsx
 */

import {act, render, screen, waitFor} from '@testing-library/react';
import {memo, useState} from 'react';
import {describe, expect, it, vi} from 'vitest';
import {List} from '../List';
import {ListItem} from '../ListItem';
import {createReorderable} from '../../reorderable/createReorderable';

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
});
