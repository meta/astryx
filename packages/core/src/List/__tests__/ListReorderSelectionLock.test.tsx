// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListReorderSelectionLock.test.tsx
 * @input A reorderable List (createReorderable), the iOS WebKit query
 *   stubbed per test, Testing Library
 * @output jsdom proofs that a finger held on a reorder handle locks text
 *   selection on the whole list from its touch-down until it lifts. On iOS
 *   WebKit the lock writes the list's selection and callout styles;
 *   elsewhere it refuses `selectstart`. A mouse press never locks
 * @position Tests for List/ListReorderTouch.ts's selection lock
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import {List} from '../List';
import {ListItem} from '../ListItem';
import {createReorderable} from '../../reorderable/createReorderable';
import type * as TouchQueries from '../../utils/touchQueries';

const ios = vi.hoisted(() => ({value: false}));

vi.mock('../../utils/touchQueries', async importOriginal => ({
  ...(await importOriginal<typeof TouchQueries>()),
  isIosWebKit: () => ios.value,
}));

const ITEMS = ['Inbox', 'Sent', 'Drafts'];

function Rows() {
  const reorderable = createReorderable({onReorder: () => {}});
  return (
    <List reorderable={reorderable}>
      {ITEMS.map(item => (
        <ListItem key={item} itemKey={item} label={item} />
      ))}
    </List>
  );
}

const FINGER = {
  pointerType: 'touch',
  pointerId: 7,
  button: 0,
  clientX: 280,
  clientY: 320,
};
const MOUSE = {...FINGER, pointerType: 'mouse', pointerId: 1};

const handleOf = (label: string) =>
  screen.getByRole('button', {name: `Reorder ${label}`});

/** Whether a selection that starts on the row's label is refused. */
function refusesSelection(label: string): boolean {
  const event = new Event('selectstart', {bubbles: true, cancelable: true});
  screen.getByText(label).dispatchEvent(event);
  return event.defaultPrevented;
}

afterEach(() => {
  ios.value = false;
});

describe('a reorderable List under a held finger', () => {
  it("writes the list's selection and callout styles on iOS WebKit from the touch-down on a handle until the lift", () => {
    ios.value = true;
    render(<Rows />);
    const list = screen.getByRole('list');
    const setProperty = vi.spyOn(list.style, 'setProperty');
    const removeProperty = vi.spyOn(list.style, 'removeProperty');
    fireEvent.pointerDown(handleOf('Sent'), FINGER);
    for (const name of [
      '-webkit-touch-callout',
      '-webkit-user-select',
      'user-select',
    ]) {
      expect(setProperty).toHaveBeenCalledWith(name, 'none');
    }
    expect(removeProperty).not.toHaveBeenCalled();
    fireEvent.pointerUp(handleOf('Sent'), FINGER);
    for (const name of [
      '-webkit-touch-callout',
      '-webkit-user-select',
      'user-select',
    ]) {
      expect(removeProperty).toHaveBeenCalledWith(name);
    }
  });

  it('refuses a selection on any row elsewhere from the touch-down on a handle until the lift, and a cancel ends it too', () => {
    render(<Rows />);
    expect(refusesSelection('Inbox')).toBe(false);
    fireEvent.pointerDown(handleOf('Sent'), FINGER);
    // The row beside the held handle too: the lock covers the whole list.
    expect(refusesSelection('Inbox')).toBe(true);
    expect(refusesSelection('Drafts')).toBe(true);
    fireEvent.pointerUp(handleOf('Sent'), FINGER);
    expect(refusesSelection('Inbox')).toBe(false);
    fireEvent.pointerDown(handleOf('Sent'), FINGER);
    expect(refusesSelection('Inbox')).toBe(true);
    fireEvent.pointerCancel(handleOf('Sent'), FINGER);
    expect(refusesSelection('Inbox')).toBe(false);
  });

  it('takes no lock for a mouse press on a handle, nor for a finger on a row away from its handle', () => {
    render(<Rows />);
    fireEvent.pointerDown(handleOf('Sent'), MOUSE);
    expect(refusesSelection('Inbox')).toBe(false);
    fireEvent.pointerUp(handleOf('Sent'), MOUSE);
    fireEvent.pointerDown(screen.getByText('Sent'), FINGER);
    expect(refusesSelection('Inbox')).toBe(false);
    fireEvent.pointerUp(screen.getByText('Sent'), FINGER);
  });
});
