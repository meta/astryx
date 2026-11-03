// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useHighlightedOptionScroll.test.ts
 * @input useHighlightedOptionScroll with stubbed option elements
 * @output Proof that a keyboard or list change scrolls the highlighted option
 *   into view and a hover's own move does not
 * @position Unit tests for /packages/core/src/hooks/useHighlightedOptionScroll.ts
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {renderHook} from '@testing-library/react';
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
    result.current(2);
    rerender({highlightedIndex: 2});
    expect(scrolled).toEqual([]);
    rerender({highlightedIndex: 1});
    expect(scrolled).toEqual(['opt-1']);
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
    result.current(0);
    // A new query's list keeps the same row highlighted.
    rerender({itemCount: 2});
    expect(scrolled).toEqual(['opt-0']);
  });
});
