// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListItem.swipeKey.test.tsx
 * @input ListItem with a swipe value, the swipe module's keyed copy spied on
 * @output Proof that a ListItem keys its swipe value once per value and key.
 *   A render that changes neither hands its Item the same value, so an open
 *   row is never reset.
 * @position Beside List.test.tsx; its own file because the spy replaces a
 *   module for every test in the file
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {cleanup, render} from '@testing-library/react';
import {createSwipe} from '../Swipe/createSwipe';
import {swipeWithItemKey} from '../Swipe/swipeHost';
import type * as SwipeHost from '../Swipe/swipeHost';
import {List} from './List';
import {ListItem} from './ListItem';

vi.mock('../Swipe/swipeHost', async original => {
  const actual = await original<typeof SwipeHost>();
  return {...actual, swipeWithItemKey: vi.fn(actual.swipeWithItemKey)};
});

const mailSwipe = createSwipe({
  trailing: [{id: 'archive', label: 'Archive', onActivate: () => {}}],
});

afterEach(() => {
  cleanup();
  vi.mocked(swipeWithItemKey).mockClear();
});

describe('a ListItem’s swipe and its item key', () => {
  it('keys its swipe value once per value and key, so a render that changes neither hands the row the same value', () => {
    const row = (label: string, itemKey: string | number) => (
      <List>
        <ListItem label={label} itemKey={itemKey} swipe={mailSwipe} />
      </List>
    );
    const {rerender} = render(row('Inbox', 1));
    expect(swipeWithItemKey).toHaveBeenCalledTimes(1);
    // Another label: the same value and key, so no new value for the row.
    rerender(row('Inbox, read', 1));
    expect(swipeWithItemKey).toHaveBeenCalledTimes(1);
    // Another key: the row's value is keyed again.
    rerender(row('Inbox, read', 2));
    expect(swipeWithItemKey).toHaveBeenCalledTimes(2);
    expect(swipeWithItemKey).toHaveBeenLastCalledWith(mailSwipe, 2);
  });
});
