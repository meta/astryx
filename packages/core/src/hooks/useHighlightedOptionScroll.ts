// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useHighlightedOptionScroll.ts
 * @input Open state, the highlighted option index, its setter, and an
 *   option-id resolver for the owning listbox
 * @output Exports useHighlightedOptionScroll: keeps the highlighted option
 *   scrolled into view for keyboard navigation while hover-driven highlights
 *   never scroll, and a hover after a keyboard move waits for the pointer to
 *   move or press; the hover callback is stable while `setHighlightedIndex` is
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
 * Highlights the hovered option at `index`. `onHighlight` runs when the hover
 * takes effect: at once, or after the pointer moves or presses when a
 * keyboard move holds the highlight.
 */
export type HighlightFromHover = (
  index: number,
  onHighlight?: () => void,
) => void;

interface WaitingHover {
  index: number;
  onHighlight?: () => void;
}

/**
 * Keep the highlighted option visible during keyboard navigation — but not for
 * hover highlights. Hover must highlight only: scrollIntoView moves the next
 * option under the stationary pointer, whose mouseenter re-highlights and
 * scrolls again — a runaway auto-scroll loop with no user input.
 * Keyboard paths call the raw setter directly and keep their scrolling; hover
 * paths call the returned callback.
 *
 * A keyboard move holds the highlight. A key that scrolls the list moves rows
 * under a still mouse, and the browser reports the row under it as entered;
 * that row takes the highlight only once the pointer moves or presses.
 */
export function useHighlightedOptionScroll({
  isOpen,
  highlightedIndex,
  setHighlightedIndex,
  getOptionId,
  itemCount,
}: UseHighlightedOptionScrollOptions): HighlightFromHover {
  // The callback reads no render state, so memoized rows keep one function.
  const hoveredIndexRef = useRef<number | null>(null);
  const shownIndexRef = useRef(highlightedIndex);
  // The hover that came while a keyboard move held the highlight.
  const waitingHoverRef = useRef<WaitingHover | null>(null);
  // Set only while a keyboard move holds the highlight.
  const removeHoldListenersRef = useRef<(() => void) | null>(null);
  const setHighlightedIndexRef = useRef(setHighlightedIndex);
  // The pointer's last screen position a hold saw, kept across holds.
  const lastPointerRef = useRef<{x: number; y: number} | null>(null);

  const applyHover = useCallback((hover: WaitingHover) => {
    hoveredIndexRef.current = hover.index;
    setHighlightedIndexRef.current(hover.index);
    hover.onHighlight?.();
  }, []);

  const endHold = useCallback(() => {
    removeHoldListenersRef.current?.();
    removeHoldListenersRef.current = null;
  }, []);

  const releaseHold = useCallback(() => {
    endHold();
    const waiting = waitingHoverRef.current;
    waitingHoverRef.current = null;
    if (waiting != null) {
      applyHover(waiting);
    }
  }, [applyHover, endHold]);

  // Holds the highlight until the pointer moves or presses. The listeners
  // live only while the hold does. Movement is read by screen coordinates: a
  // scroll moves the rows, not the pointer. The browser reports a row as
  // entered before the move that reaches it, so the first real move gives
  // that row the highlight. A press releases at once, so a held press lights
  // the pressed row.
  const startHold = useCallback(() => {
    waitingHoverRef.current = null;
    if (removeHoldListenersRef.current != null) {
      return;
    }
    const onPointerMove = (event: PointerEvent) => {
      const last = lastPointerRef.current;
      lastPointerRef.current = {x: event.screenX, y: event.screenY};
      if (
        last != null &&
        last.x === event.screenX &&
        last.y === event.screenY
      ) {
        return;
      }
      releaseHold();
    };
    const options = {capture: true, passive: true} as const;
    document.addEventListener('pointermove', onPointerMove, options);
    document.addEventListener('pointerdown', releaseHold, options);
    removeHoldListenersRef.current = () => {
      document.removeEventListener('pointermove', onPointerMove, options);
      document.removeEventListener('pointerdown', releaseHold, options);
    };
  }, [releaseHold]);

  const highlightFromHover = useCallback<HighlightFromHover>(
    (index, onHighlight) => {
      if (removeHoldListenersRef.current != null) {
        waitingHoverRef.current = {index, onHighlight};
        return;
      }
      hoveredIndexRef.current = index;
      setHighlightedIndex(index);
      onHighlight?.();
    },
    [setHighlightedIndex],
  );

  // Effect: keeps the hold's document listeners calling the current setter.
  useEffect(() => {
    setHighlightedIndexRef.current = setHighlightedIndex;
  }, [setHighlightedIndex]);

  // Effect: removes the hold's document listeners on unmount.
  useEffect(() => endHold, [endHold]);

  // Effect: scrolls the highlighted option into view in the document, and
  // starts or ends the hold on its document listeners.
  useEffect(() => {
    // Only a move to the hovered row came from the hover. A hover on the row
    // already highlighted changes nothing, so a later run for the same row
    // (a new list) still scrolls it into view.
    const hasMoved = shownIndexRef.current !== highlightedIndex;
    shownIndexRef.current = highlightedIndex;
    const isFromHover =
      hasMoved && hoveredIndexRef.current === highlightedIndex;
    hoveredIndexRef.current = null;
    if (isFromHover) {
      return;
    }
    // A cleared highlight, a closed list, or a list that is not shown (a
    // closed CommandPalette reports itself as open) has nothing to hold.
    const option =
      isOpen && highlightedIndex >= 0
        ? document.getElementById(getOptionId(highlightedIndex))
        : null;
    if (option == null) {
      waitingHoverRef.current = null;
      endHold();
      return;
    }
    startHold();
    option.scrollIntoView?.({block: 'nearest'});
  }, [isOpen, highlightedIndex, getOptionId, itemCount, endHold, startHold]);

  return highlightFromHover;
}
