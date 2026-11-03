// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useHighlightedOptionScroll.test.ts
 * @input useHighlightedOptionScroll with stubbed option elements
 * @output Proof that a keyboard or list change scrolls the highlighted option
 *   into view and a hover's own move does not
 * @position Unit tests for /packages/core/src/hooks/useHighlightedOptionScroll.ts
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {fireEvent, renderHook} from '@testing-library/react';
import {useHighlightedOptionScroll} from './useHighlightedOptionScroll';

function addOptions(count: number) {
  const scrolled: string[] = [];
  for (let i = 0; i < count; i++) {
    const option = document.createElement('div');
    option.id = `opt-${i}`;
    option.scrollIntoView = vi.fn(() => {
      scrolled.push(option.id);
    });
    document.body.append(option);
  }
  return scrolled;
}

afterEach(() => {
  document.body.innerHTML = '';
});

const getOptionId = (index: number) => `opt-${index}`;

describe('useHighlightedOptionScroll', () => {
  it('does not scroll for a hover’s own move, and scrolls for the next keyboard move', () => {
    const scrolled = addOptions(3);
    const setHighlightedIndex = vi.fn();
    const {result, rerender} = renderHook(
      ({highlightedIndex}: {highlightedIndex: number}) =>
        useHighlightedOptionScroll({
          isOpen: true,
          highlightedIndex,
          setHighlightedIndex,
          getOptionId,
        }),
      {initialProps: {highlightedIndex: 0}},
    );
    scrolled.length = 0;
    // The pointer moves, so a hover no longer waits for the keyboard.
    fireEvent.pointerMove(document.body, {screenX: 5, screenY: 5});
    result.current(2);
    rerender({highlightedIndex: 2});
    expect(scrolled).toEqual([]);
    rerender({highlightedIndex: 1});
    expect(scrolled).toEqual(['opt-1']);
  });

  it('a hover after a keyboard move waits for the pointer to move, then applies', () => {
    addOptions(3);
    const setHighlightedIndex = vi.fn();
    const onHighlight = vi.fn();
    const {result} = renderHook(() =>
      useHighlightedOptionScroll({
        isOpen: true,
        highlightedIndex: 0,
        setHighlightedIndex,
        getOptionId,
      }),
    );
    // The open highlighted row 0, as a keyboard move does.
    result.current(2, onHighlight);
    expect(setHighlightedIndex).not.toHaveBeenCalled();
    fireEvent.pointerMove(document.body, {screenX: 9, screenY: 9});
    expect(setHighlightedIndex).toHaveBeenCalledWith(2);
    expect(onHighlight).toHaveBeenCalledTimes(1);
  });

  it('a cleared highlight ends the hold, so the next hover applies at once', () => {
    addOptions(3);
    const setHighlightedIndex = vi.fn();
    const {result, rerender} = renderHook(
      ({highlightedIndex}: {highlightedIndex: number}) =>
        useHighlightedOptionScroll({
          isOpen: true,
          highlightedIndex,
          setHighlightedIndex,
          getOptionId,
        }),
      {initialProps: {highlightedIndex: 0}},
    );
    // A new search clears the highlight; a value then highlights by hover.
    rerender({highlightedIndex: -1});
    result.current(1);
    expect(setHighlightedIndex).toHaveBeenCalledWith(1);
  });

  it('a hover over the row already highlighted does not stop a new list from scrolling that row into view', () => {
    const scrolled = addOptions(3);
    const setHighlightedIndex = vi.fn();
    const {result, rerender} = renderHook(
      ({itemCount}: {itemCount: number}) =>
        useHighlightedOptionScroll({
          isOpen: true,
          highlightedIndex: 0,
          setHighlightedIndex,
          getOptionId,
          itemCount,
        }),
      {initialProps: {itemCount: 3}},
    );
    scrolled.length = 0;
    // The pointer moves over the highlighted row: no state changes.
    fireEvent.pointerMove(document.body, {screenX: 5, screenY: 5});
    result.current(0);
    // A new query's list keeps the same row highlighted.
    rerender({itemCount: 2});
    expect(scrolled).toEqual(['opt-0']);
  });
});
