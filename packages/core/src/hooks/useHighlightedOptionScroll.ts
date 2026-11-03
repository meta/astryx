// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useHighlightedOptionScroll.ts
 * @input Open state, the highlighted option index, its setter, and an
 *   option-id resolver for the owning listbox
 * @output Exports useHighlightedOptionScroll: keeps the highlighted option
 *   scrolled into view for keyboard navigation while hover-driven highlights
 *   never scroll, and a hover after a keyboard move waits for the pointer to
 *   move
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
 * takes effect: at once, or after the pointer moves when a keyboard move
 * holds the highlight.
 */
export type HighlightFromHover = (
  index: number,
  onHighlight?: () => void,
) => void;

/**
 * Keep the highlighted option visible during keyboard navigation — but not for
 * hover highlights. Hover must highlight only: scrollIntoView moves the next
 * option under the stationary pointer, whose mouseenter re-highlights and
 * scrolls again — a runaway auto-scroll loop with no user input.
 * Keyboard paths call the raw setter directly and keep their scrolling; hover
 * paths call the returned callback.
 *
 * After a keyboard move, a hover waits for the pointer to move. A key that
 * scrolls the list moves rows under a still mouse, and the browser reports
 * the row under it as entered; that row takes the highlight only once the
 * pointer moves.
 */
export function useHighlightedOptionScroll({
  isOpen,
  highlightedIndex,
  setHighlightedIndex,
  getOptionId,
  itemCount,
}: UseHighlightedOptionScrollOptions): HighlightFromHover {
  const hoverHighlightRef = useRef(false);
  // Set by a keyboard move, cleared by the next real pointer move.
  const isKeyAnchoredRef = useRef(false);
  // The hover that came while the keyboard held the highlight.
  const waitingHoverRef = useRef<{
    index: number;
    onHighlight?: () => void;
  } | null>(null);
  const lastPointerRef = useRef<{x: number; y: number} | null>(null);

  const highlightFromHover = useCallback<HighlightFromHover>(
    (index, onHighlight) => {
      if (isKeyAnchoredRef.current) {
        waitingHoverRef.current = {index, onHighlight};
        return;
      }
      if (index !== highlightedIndex) {
        hoverHighlightRef.current = true;
      }
      setHighlightedIndex(index);
      onHighlight?.();
    },
    [highlightedIndex, setHighlightedIndex],
  );
  // Effect: subscribes to the document's pointer moves while the list is
  // open. Movement is read by screen coordinates: a scroll moves the rows,
  // not the pointer. The browser reports a row as entered before the move
  // that reaches it, so the first real move gives that row the highlight.
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const onPointerMove = (event: PointerEvent) => {
      const last = lastPointerRef.current;
      lastPointerRef.current = {x: event.screenX, y: event.screenY};
      if (
        !isKeyAnchoredRef.current ||
        (last != null && last.x === event.screenX && last.y === event.screenY)
      ) {
        return;
      }
      isKeyAnchoredRef.current = false;
      const waiting = waitingHoverRef.current;
      waitingHoverRef.current = null;
      if (waiting != null) {
        highlightFromHover(waiting.index, waiting.onHighlight);
      }
    };
    document.addEventListener('pointermove', onPointerMove, {
      capture: true,
      passive: true,
    });
    return () => {
      document.removeEventListener('pointermove', onPointerMove, {
        capture: true,
      });
    };
  }, [isOpen, highlightFromHover]);

  useEffect(() => {
    if (hoverHighlightRef.current) {
      hoverHighlightRef.current = false;
      return;
    }
    if (!isOpen) {
      isKeyAnchoredRef.current = false;
      waitingHoverRef.current = null;
      return;
    }
    if (highlightedIndex < 0) {
      return;
    }
    isKeyAnchoredRef.current = true;
    waitingHoverRef.current = null;
    document
      .getElementById(getOptionId(highlightedIndex))
      ?.scrollIntoView?.({block: 'nearest'});
  }, [isOpen, highlightedIndex, getOptionId, itemCount]);

  return highlightFromHover;
}
