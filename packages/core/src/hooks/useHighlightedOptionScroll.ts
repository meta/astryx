// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useHighlightedOptionScroll.ts
 * @input Open state, the highlighted option index, its setter, and an
 *   option-id resolver for the owning listbox
 * @output Exports useHighlightedOptionScroll: keeps the highlighted option
 *   scrolled into view for keyboard navigation while hover-driven highlights
 *   never scroll; the hover callback it returns is stable
 * @position Internal hook; used by useCombobox, useMultiCombobox,
 *   BaseTypeahead, and DateTimeInput — the owners of combobox highlight state
 */

import {useCallback, useEffect, useRef} from 'react';

interface UseHighlightedOptionScrollOptions {
  isOpen: boolean;
  highlightedIndex: number;
  setHighlightedIndex: (index: number) => void;
  getOptionId: (index: number) => string;
  /**
   * Current option count, when the list can change while open (filtered or
   * min/max-clamped lists). A count change runs the scroll again.
   */
  itemCount?: number;
}

/**
 * Keep the highlighted option visible during keyboard navigation — but not for
 * hover highlights. Hover must highlight only: scrollIntoView moves the next
 * option under the stationary pointer, whose mouseenter re-highlights and
 * scrolls again — a runaway auto-scroll loop with no user input.
 * Keyboard paths call the raw setter directly and keep their scrolling; hover
 * paths call the returned callback.
 */
export function useHighlightedOptionScroll({
  isOpen,
  highlightedIndex,
  setHighlightedIndex,
  getOptionId,
  itemCount,
}: UseHighlightedOptionScrollOptions): (index: number) => void {
  // The index the last hover asked for. The callback reads no render state,
  // so it stays the same function while the highlight moves: owners pass it
  // to memoized rows.
  const hoveredIndexRef = useRef<number | null>(null);

  const highlightFromHover = useCallback(
    (index: number) => {
      hoveredIndexRef.current = index;
      setHighlightedIndex(index);
    },
    [setHighlightedIndex],
  );

  useEffect(() => {
    const isFromHover = hoveredIndexRef.current === highlightedIndex;
    hoveredIndexRef.current = null;
    if (isFromHover || !isOpen || highlightedIndex < 0) {
      return;
    }
    document
      .getElementById(getOptionId(highlightedIndex))
      ?.scrollIntoView?.({block: 'nearest'});
  }, [isOpen, highlightedIndex, getOptionId, itemCount]);

  return highlightFromHover;
}
