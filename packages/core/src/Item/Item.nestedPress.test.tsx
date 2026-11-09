// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Item.nestedPress.test.tsx
 * @input vitest (jsdom), React Testing Library, Item in delegation mode, the
 *   press controller
 * @output Checks a delegated row's pressed state for a finger: a press on the
 *   control the row delegates to paints the row, since it is the row's
 *   action; a press on another control inside the row paints none
 * @position Testing; validates useClickableContainer's pointerdown callback
 *   through Item
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {useRef} from 'react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {PRESS_ONSET_MS} from '../utils/pressGesture';
import {PRESSED_ATTRIBUTE} from '../utils/pressFeedback';
import {Item} from './Item';

function DelegatingRow() {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <Item
      label="Row"
      interactiveRef={ref}
      startContent={<input ref={ref} type="checkbox" aria-label="Pick row" />}
      endContent={
        <button type="button" aria-label="More">
          ⋯
        </button>
      }
    />
  );
}

function rowOf(element: Element): Element {
  const row = element.closest('[data-pressable-container]');
  if (row == null) {
    throw new Error('no delegated row around the element');
  }
  return row;
}

function fingerOn(element: Element) {
  fireEvent.pointerDown(element, {pointerType: 'touch', pointerId: 1});
  act(() => {
    vi.advanceTimersByTime(PRESS_ONSET_MS * 2);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it("paints the row for a finger on the control it delegates to: that press is the row's action", () => {
  render(<DelegatingRow />);
  const checkbox = screen.getByRole('checkbox', {name: 'Pick row'});
  fingerOn(checkbox);
  expect(rowOf(checkbox).getAttribute(PRESSED_ATTRIBUTE)).toBe('on');
  fireEvent.pointerUp(checkbox, {pointerType: 'touch', pointerId: 1});
});

it('paints no press on the row for a finger on another control inside it', () => {
  render(<DelegatingRow />);
  const more = screen.getByRole('button', {name: 'More'});
  fingerOn(more);
  expect(rowOf(more).hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
  fireEvent.pointerUp(more, {pointerType: 'touch', pointerId: 1});
});

it('keeps the row marked as a pressable container while a finger on another control inside it paints no press', () => {
  render(<DelegatingRow />);
  const more = screen.getByRole('button', {name: 'More'});
  const row = rowOf(more);
  expect(row.getAttribute('data-pressable-container')).toBe('true');
  fingerOn(more);
  expect(row.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
  expect(row.getAttribute('data-pressable-container')).toBe('true');
  fireEvent.pointerUp(more, {pointerType: 'touch', pointerId: 1});
});
